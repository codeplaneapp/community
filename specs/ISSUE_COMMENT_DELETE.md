# ISSUE_COMMENT_DELETE

Specification for ISSUE_COMMENT_DELETE.

## High-Level User POV

When a user is viewing an issue in Codeplane — whether through the web UI, terminal UI, CLI, or an editor integration — they may need to delete a comment they previously posted. Perhaps the comment contains incorrect information, was posted in error, includes sensitive data that was accidentally pasted, or is simply no longer relevant to the discussion. Deleting a comment removes it permanently from the issue thread, keeping the conversation clean and accurate.

A user navigates to the issue detail view and finds the comment they want to remove. If they are the original author of the comment, a delete action is available on that comment. Repository administrators and owners can also delete any comment on issues within their repositories, regardless of who authored it — this is essential for moderation, removing spam, or handling policy violations.

When the user initiates deletion, a confirmation prompt appears to prevent accidental removal. Once confirmed, the comment is immediately removed from the thread, the issue's visible comment count decrements by one, and the action is final. Deleted comments are permanently removed — they do not leave behind a "deleted comment" placeholder or ghost entry. The comment simply ceases to exist in the timeline.

The same deletion capability is available from every Codeplane surface: the web application's issue detail view, the terminal UI's issue detail screen, the CLI's `issue comment-delete` command, and through direct API calls. Agents can also delete comments programmatically when performing automated moderation or cleanup workflows. Regardless of which surface initiates the deletion, the result is identical: the comment is permanently removed, the comment count is updated, and appropriate webhook and workflow events fire to keep integrations in sync.

## Acceptance Criteria

### Definition of Done

A comment has been successfully deleted when:

- The comment is permanently removed from the database — it is no longer retrievable via any read path (list, get by ID).
- The parent issue's `comment_count` field has been atomically decremented by exactly 1.
- Webhook deliveries have been enqueued for any repository webhooks subscribing to `issue_comment` events with action `deleted`.
- Workflow triggers matching `issue_comment.deleted` have been evaluated and matching workflows dispatched.
- The comment is no longer visible in any client surface (web, TUI, CLI list output, editor views).
- The API returns a `204 No Content` response with an empty body.

### Authorization Constraints

- [ ] **Authentication required**: The request must include valid authentication (session cookie or PAT). Unauthenticated requests return `401 Unauthorized`.
- [ ] **Comment author can delete own comments**: A user who authored the comment can delete it, provided they have at least read access to the repository.
- [ ] **Repository admins/owners can delete any comment**: Users with admin or owner permissions on the repository can delete any comment, regardless of authorship.
- [ ] **Write-access users cannot delete others' comments**: Users with write access but not admin/owner status can only delete their own comments.
- [ ] **Read-only users cannot delete comments**: Users with only read access cannot delete any comment, not even their own (they should not have been able to create one).
- [ ] **Private repository scoping**: For private repositories, the user must have explicit repository access. Users without access receive `404 Not Found` (not `403`, to avoid leaking repository existence).

### Input Constraints

- [ ] **Comment ID is required**: The `:id` path parameter must be present. A missing or empty comment ID returns `400 Bad Request`.
- [ ] **Comment ID must be a positive integer**: Comment IDs of zero, negative numbers, floating-point numbers, or non-numeric strings return `400 Bad Request` with message `"invalid comment id"`.
- [ ] **Comment ID maximum**: Comment IDs are 64-bit integers. Values exceeding `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991) return `400 Bad Request`.

### Resource Constraints

- [ ] **Comment must exist**: The comment identified by `:id` must exist in the database. A nonexistent comment returns `404 Not Found`.
- [ ] **Comment must belong to the specified repository**: The comment's parent issue must belong to the repository identified by `:owner/:repo`. A comment ID that exists but belongs to a different repository returns `404 Not Found`.
- [ ] **Repository must exist**: The repository identified by `:owner/:repo` must exist. A nonexistent repository returns `404 Not Found`.

### Side Effects

- [ ] **Comment count decrement**: The parent issue's `comment_count` column must be decremented by exactly 1, atomically. The count must never go below zero.
- [ ] **Hard delete**: The comment is permanently removed from the database. No soft-delete flag, no tombstone record, no "this comment was deleted" placeholder.
- [ ] **Webhook delivery**: An `issue_comment` webhook event with action `deleted` is enqueued for every active repository webhook subscribing to the `issue_comment` event type. The webhook payload includes the deleted comment's data as it existed before deletion.
- [ ] **Workflow trigger evaluation**: Any repository workflow definitions with `issue_comment` triggers matching the `deleted` action type are evaluated and matching runs are dispatched.
- [ ] **No notification fanout on delete**: Deleting a comment does not generate notifications to issue participants. This is intentional — deletions are cleanup actions, not new collaboration signals.

### Response Contract

- [ ] **Status code**: `204 No Content` on success.
- [ ] **Response body**: Empty. No JSON payload is returned.
- [ ] **Idempotency**: Deleting an already-deleted comment returns `404 Not Found` (not `204`), because the resource no longer exists.

### Edge Cases

- [ ] **Delete the only comment on an issue**: The comment count decrements from 1 to 0. The issue remains valid with zero comments.
- [ ] **Delete a comment then list comments**: The deleted comment must not appear in subsequent `GET .../issues/:number/comments` responses.
- [ ] **Delete a comment then get by ID**: `GET .../issues/comments/:id` must return `404 Not Found`.
- [ ] **Concurrent deletion**: Two concurrent DELETE requests for the same comment ID — one succeeds with `204`, the other returns `404`. The comment count decrements exactly once.
- [ ] **Delete comment on a closed issue**: Deletion is permitted on comments belonging to closed issues. Issue state does not gate deletion.
- [ ] **Delete comment on a locked issue**: Deletion is permitted on locked issues for authorized users (comment authors + admins). Locking prevents new comments, not moderation of existing ones.
- [ ] **Delete comment on an archived repository**: Deletion returns `403 Forbidden` — archived repositories are read-only.

## Design

### API Shape

**Endpoint**: `DELETE /api/repos/:owner/:repo/issues/comments/:id`

**Request Headers**:
- `Authorization: Bearer <PAT>` or session cookie

**Request Body**: None. Any request body is ignored.

**Path Parameters**:
- `:owner` (string, required): Repository owner username or organization name.
- `:repo` (string, required): Repository name.
- `:id` (integer, required): The comment ID to delete. Must be a positive integer.

**Success Response** (`204 No Content`):
- Empty body.
- No `Content-Type` header.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Comment ID is missing, zero, negative, or non-numeric | `{ "message": "invalid comment id" }` |
| `401 Unauthorized` | No authentication provided | `{ "message": "authentication required" }` |
| `403 Forbidden` | User lacks permission to delete this comment (not author + not admin), or repository is archived | `{ "message": "forbidden" }` |
| `404 Not Found` | Repository, issue, or comment does not exist; or comment belongs to a different repository; or private repo with no access | `{ "message": "not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

**Webhook Payload** (dispatched on success):

```json
{
  "action": "deleted",
  "comment": {
    "id": 42,
    "issue_id": 7,
    "user_id": 1,
    "commenter": "alice",
    "body": "The original comment text before deletion.",
    "type": "comment",
    "created_at": "2026-03-20T10:30:00.000Z",
    "updated_at": "2026-03-21T09:00:00.000Z"
  },
  "issue": {
    "number": 7,
    "title": "Fix memory leak in SSE handler",
    "state": "open"
  },
  "repository": {
    "owner": "alice",
    "name": "frontend"
  },
  "sender": {
    "id": 1,
    "login": "alice"
  }
}
```

### SDK Shape

The `IssueService` in `@codeplane/sdk` exposes:

```typescript
deleteIssueComment(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void>
```

The method:
1. Validates `actor` is non-null (throws `unauthorized`).
2. Validates `commentId > 0` (throws `badRequest`).
3. Resolves the repository by owner and name.
4. Checks that the actor has permission to delete the comment (comment author OR repository admin/owner).
5. Looks up the issue associated with the comment via `dbGetIssueByCommentID`.
6. Validates the comment's parent issue belongs to the specified repository.
7. Deletes the comment via `dbDeleteIssueComment`.
8. Decrements the issue's `comment_count` via `dbDecrementIssueCommentCount`.
9. Enqueues webhook delivery with the pre-deletion comment data.
10. Evaluates workflow triggers for `issue_comment.deleted`.

The `@codeplane/ui-core` package provides a shared mutation hook:

```typescript
useDeleteIssueComment(owner: string, repo: string): {
  deleteComment: (commentId: number) => Promise<void>;
  isDeleting: boolean;
}
```

### CLI Command

**Command**: `codeplane issue comment-delete <id> [--repo OWNER/REPO] [--yes]`

**Arguments**:
- `id` (positional, required): The comment ID to delete. Parsed and validated as a positive integer.

**Options**:
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.
- `--yes` / `-y` (optional): Skip the confirmation prompt. Useful for scripting and agent workflows.

**Interactive behavior** (when `--yes` is not set):
- Before deleting, the CLI displays the first 3 lines of the comment body and the commenter's username, then prompts: `Delete comment #<id> by @<commenter>? (y/N)`.
- Default is "No" — pressing Enter without input cancels the deletion.

**Output (default)**:
```
Deleted comment #42 from issue #7
```

**Output (`--json`)**:
```json
{ "deleted": true, "comment_id": 42, "issue_number": 7 }
```

**Error handling**: Errors are routed through `handleIssueApiError()` which maps HTTP status codes to user-friendly CLI error messages:
- 401: `"Error: Authentication required. Run 'codeplane auth login' first."`
- 403: `"Error: You do not have permission to delete this comment."`
- 404: `"Error: Comment not found."`

### Web UI Design

**Location**: Issue detail view at `/:owner/:repo/issues/:number`, within the comment thread.

**Delete control placement**:
- Each comment displays a three-dot overflow menu (`⋯`) in the top-right corner of the comment block, visible on hover.
- For comments authored by the current user, the overflow menu contains "Edit" and "Delete" actions.
- For repository admins/owners viewing another user's comment, the overflow menu contains only "Delete".
- For users without delete permission, no delete action appears.

**Delete action flow**:
1. User clicks the `⋯` overflow menu on a comment.
2. A dropdown menu appears with "Delete" shown in destructive red text.
3. User clicks "Delete".
4. A confirmation dialog appears: "Delete this comment? This action cannot be undone." with "Cancel" (secondary) and "Delete" (destructive red) buttons.
5. User clicks "Delete" in the confirmation dialog.
6. The comment fades out (200ms opacity transition) and is removed from the thread.
7. The comment count in the issue header decrements.

**Optimistic UI**: The comment is removed from the thread immediately upon confirmation. If the server returns an error, the comment reappears in its original position with an error toast: "Failed to delete comment. Please try again."

**Loading state**: While the DELETE request is in flight, the "Delete" button in the confirmation dialog shows a loading spinner and is disabled.

**Keyboard shortcut**: When a comment is focused (via keyboard navigation), pressing `Delete` or `Backspace` on the user's own comment (or any comment for admins) opens the confirmation dialog directly.

### TUI UI

**Activation**: Press `x` while a comment is focused in the issue detail view's comment list. Only available when the `[delete]` indicator is shown on the focused comment (i.e., the user is the comment author or a repository admin).

**Confirmation dialog**: A modal confirmation box appears centered on screen:

```
┌── Delete Comment ──────────────────────┐
│                                        │
│  Delete comment by @alice?             │
│  This action cannot be undone.         │
│                                        │
│     [Cancel]  [Delete]                 │
│                                        │
└────────────────────────────────────────┘
```

- `Enter` or `y`: Confirm deletion.
- `Esc` or `n`: Cancel and close the dialog.
- `Tab`: Toggle focus between Cancel and Delete buttons.
- Delete button renders in `error` color (ANSI 196).

**Optimistic UI**: On confirmation, the comment is immediately removed from the comment list, the `─── Comments (N) ───` separator decrements to N-1, and a brief success toast appears: "Comment deleted" in `success` color (ANSI 34) for 2 seconds. If the server returns an error, the comment is restored to its original position in the list, and an error toast appears in `error` color for 3 seconds with the error message.

**Edge case — deleting the focused comment**: After deletion, focus moves to the next comment in the list. If the deleted comment was the last one, focus moves to the previous comment. If no comments remain, focus returns to the issue body area.

**Status bar**: Shows `x:delete │ e:edit │ c:comment │ q:back` when a comment with delete permission is focused.

### Editor Integrations

**VS Code**: The issue detail webview supports comment deletion through the embedded web UI. No separate VS Code-native delete command is required.

**Neovim**: Comments can be deleted via the CLI command, which is accessible through Neovim's command integration: `:Codeplane issue comment-delete <id> --yes`.

### Documentation

The following documentation must be provided:

- **API Reference** (`docs/api-reference/issues.mdx`): Document the `DELETE /api/repos/:owner/:repo/issues/comments/:id` endpoint with path parameters, error codes, and a curl example showing both the delete request and the confirmation that the comment is gone.
- **CLI Reference** (`docs/cli/issue.mdx`): Document the `issue comment-delete` subcommand with arguments, options (`--yes`, `--repo`), example usage, and the interactive confirmation behavior.
- **Webhook Events** (`docs/api-reference/webhooks.mdx`): Document the `issue_comment` event payload shape for the `deleted` action, noting that the payload includes the comment data as it existed before deletion.
- **Workflow Triggers** (`docs/workflows/triggers.mdx`): Document the `issueComment.deleted()` trigger and how to use it in a workflow definition.
- **User Guide** (`docs/guides/issues.mdx`): Add a section on comment management that covers how to delete comments from web, CLI, and TUI, including permission requirements and the permanent nature of deletion.

## Permissions & Security

### Authorization Matrix

| Role | Can Delete Own Comment? | Can Delete Others' Comments? | Notes |
|------|------------------------|------------------------------|-------|
| **Repository Owner** | ✅ Yes | ✅ Yes | Full moderation control |
| **Organization Admin** | ✅ Yes | ✅ Yes | Org-level admin implies repo admin access |
| **Repository Admin** | ✅ Yes | ✅ Yes | Admin-level moderation |
| **Team Member (write)** | ✅ Yes | ❌ No | Can only delete own comments |
| **Team Member (read)** | ❌ No | ❌ No | Read-only users cannot delete |
| **Collaborator (write)** | ✅ Yes | ❌ No | Can only delete own comments |
| **Collaborator (read)** | ❌ No | ❌ No | Read-only cannot delete |
| **Authenticated (public repo, no explicit access)** | ❌ No | ❌ No | No repo access, no delete |
| **Anonymous / Unauthenticated** | ❌ No | ❌ No | Returns 401 |

**Note on current implementation**: The current SDK implementation uses `requireWriteAccess` without distinguishing between "own comment" and "others' comment." The spec requires that the permission model be refined to:
1. Allow comment authors with write access to delete their own comments.
2. Require admin/owner access to delete other users' comments.
3. Repository admins and owners can delete any comment.

### Rate Limiting

- **Per-user rate limit**: 30 comment deletions per minute per authenticated user. This prevents accidental mass-deletion scripting while permitting reasonable moderation workflows.
- **Per-repository rate limit**: 100 comment deletions per minute across all users for a single repository. This prevents coordinated abuse.
- **Global rate limit**: Inherits from the platform-wide API rate limiting middleware.
- **PAT-based access**: Subject to the same rate limits as session-based access.

### Data Privacy

- **Hard delete**: Deleted comment data is permanently removed from the database. No residual body text, author reference, or metadata remains after deletion. This is a GDPR-friendly deletion model.
- **Webhook payload**: The webhook payload for the `deleted` action includes the full comment body as it existed before deletion. Webhook consumers must handle this data according to their own retention policies.
- **Audit trail**: Comment deletion is logged in structured server logs with the actor's user ID, the deleted comment ID, the parent issue number, and the repository. This log is accessible to platform operators for abuse investigation. The log does not include the comment body.
- **No cascade to notifications**: Existing notifications that reference the deleted comment remain intact — they will show a "comment not found" state if the user follows the notification link. This is acceptable.

## Telemetry & Product Analytics

### Business Events

**Event: `IssueCommentDeleted`**

Properties:
- `comment_id` (number): The ID of the deleted comment.
- `issue_id` (number): The parent issue ID.
- `issue_number` (number): The parent issue number.
- `repository_id` (string): The repository ID.
- `repository_owner` (string): The repository owner name.
- `repository_name` (string): The repository name.
- `actor_id` (number): The authenticated user ID who performed the deletion.
- `actor_username` (string): The authenticated username.
- `comment_author_id` (number): The user ID of the comment's original author.
- `comment_author_username` (string): The username of the comment's original author.
- `is_self_delete` (boolean): `true` if the actor is the comment author, `false` if an admin is deleting another user's comment.
- `comment_age_seconds` (number): Time in seconds between comment creation and deletion. Useful for detecting "oops" deletions (very young comments) vs. moderation (older comments).
- `body_length` (number): Character count of the deleted comment body.
- `issue_state` (string): The current state of the parent issue (`"open"` or `"closed"`).
- `source` (string): The client surface that initiated the deletion (`"web"`, `"cli"`, `"tui"`, `"api"`, `"agent"`).
- `latency_ms` (number): Server-side processing time in milliseconds.

### Funnel Metrics & Success Indicators

- **Deletion rate**: Comment deletions per active user per day. A healthy rate is low (most comments should be intentional). Spikes may indicate moderation events or abuse.
- **Self-delete vs. admin-delete ratio**: Breakdown of `is_self_delete` values. A high admin-delete ratio may indicate spam problems. A healthy system should see mostly self-deletes.
- **Comment age at deletion**: Distribution of `comment_age_seconds`. Very young deletions (<60 seconds) likely indicate typos or accidental posts. Older deletions (>24 hours) likely indicate content moderation.
- **Deletion-to-creation ratio**: `IssueCommentDeleted` count / `IssueCommentCreated` count over time. A healthy forge should see this well below 5%.
- **Error rate**: Percentage of comment deletion attempts that fail (4xx or 5xx). Should remain below 1%.
- **Cross-surface adoption**: Breakdown of deletion source. Ensures the feature works and is discoverable across all surfaces.
- **Confirmation dialog completion rate** (web/TUI only): Percentage of users who open the confirmation dialog and then proceed with deletion vs. cancel. High cancel rates may indicate the confirmation UX is too aggressive or users are accidentally triggering the dialog.

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `issue_comment.deleted` | `INFO` | `comment_id`, `issue_id`, `issue_number`, `repo_id`, `repo_owner`, `repo_name`, `actor_id`, `comment_author_id`, `is_self_delete`, `latency_ms` | On successful comment deletion |
| `issue_comment.delete_failed` | `WARN` | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `error_code`, `error_message` | On any non-2xx response |
| `issue_comment.delete_unauthorized` | `WARN` | `comment_id`, `repo_owner`, `repo_name`, `request_ip` | On 401 unauthenticated attempt |
| `issue_comment.delete_forbidden` | `WARN` | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `comment_author_id`, `actor_permission` | On 403 permission denied (not author, not admin) |
| `issue_comment.delete_not_found` | `INFO` | `comment_id`, `repo_owner`, `repo_name`, `actor_id` | On 404 (comment doesn't exist or belongs to different repo) |
| `issue_comment.delete_webhook_dispatched` | `DEBUG` | `comment_id`, `issue_id`, `webhook_count` | After webhook event enqueue for deletion |
| `issue_comment.delete_count_decremented` | `DEBUG` | `issue_id`, `new_count` | After issue comment count decrement |
| `issue_comment.delete_count_decrement_failed` | `ERROR` | `issue_id`, `comment_id`, `error_message` | If the count decrement fails after successful comment deletion |

### Prometheus Metrics

**Counters**:
- `codeplane_issue_comments_deleted_total` — Labels: `repo_owner`, `source` (`web`/`cli`/`tui`/`api`/`agent`), `is_self_delete` (`true`/`false`). Total successful comment deletions.
- `codeplane_issue_comments_delete_errors_total` — Labels: `error_code` (`400`, `401`, `403`, `404`, `429`, `500`). Total failed comment deletion attempts.

**Histograms**:
- `codeplane_issue_comment_delete_duration_seconds` — Labels: `source`. Latency of comment deletion (DB delete + count decrement + webhook dispatch). Buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]`.
- `codeplane_issue_comment_age_at_deletion_seconds` — Labels: `is_self_delete`. Age of the comment when deleted. Buckets: `[10, 60, 300, 3600, 86400, 604800, 2592000]` (10s, 1m, 5m, 1h, 1d, 7d, 30d).

**Gauges**:
- `codeplane_issue_comment_delete_inflight` — Labels: none. Number of comment deletion requests currently in progress.

### Alerts

#### Alert: `IssueCommentDeleteErrorRateHigh`
- **Condition**: `rate(codeplane_issue_comments_delete_errors_total{error_code=~"5.."}[5m]) > 0.1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_comments_delete_errors_total` by `error_code` label to identify the dominant server-side error.
  2. If `500` errors dominate: check server logs for `issue_comment.delete_failed` entries. Common root causes:
     - Database connection failure: verify DB connectivity and connection pool metrics.
     - `dbDeleteIssueComment` query failure: check for table locks, disk space, or constraint violations.
     - `dbDecrementIssueCommentCount` failure: check if the issue record has been concurrently deleted.
  3. If `429` errors dominate: review rate limit configuration. Check if a single user or bot is mass-deleting comments. This may be legitimate moderation or abuse.
  4. Check recent server deployments for regressions in the delete path.
  5. If the error is transient and resolves within 10 minutes, no action required.

#### Alert: `IssueCommentDeleteLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_comment_delete_duration_seconds_bucket[5m])) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database latency metrics. The delete operation involves two DB calls: `DELETE FROM issue_comments` and `UPDATE issues SET comment_count = comment_count - 1`.
  2. Check for table-level lock contention on the `issue_comments` table. Heavy concurrent writes (e.g., bulk comment creation by agents) can cause lock waits.
  3. Check if the `issue_comments` table needs a VACUUM or has excessive bloat.
  4. Check connection pool saturation — high inflight gauge combined with high latency suggests pool exhaustion.
  5. If webhook dispatch is included in the latency path, check webhook service health separately.

#### Alert: `IssueCommentMassDeleteSpike`
- **Condition**: `rate(codeplane_issue_comments_deleted_total[5m]) > 10` sustained for 5 minutes (more than 10 deletions per second, sustained).
- **Severity**: Critical
- **Runbook**:
  1. This may indicate a compromised admin account mass-deleting comments, or a runaway automation script.
  2. Immediately check the `actor_id` label distribution. If a single user is responsible for the spike, investigate that user's activity.
  3. Check the `is_self_delete` label. If all deletions are non-self (admin deleting others), this is a moderation event — verify it's intentional by contacting the admin.
  4. If the deletions appear unauthorized, consider temporarily revoking the user's access or rotating their PAT.
  5. Check the `source` label. If `api` dominates, a script may be responsible — check for recently created PATs for the actor.
  6. If this is legitimate (e.g., spam cleanup), acknowledge the alert and monitor for completion.

#### Alert: `IssueCommentCountDriftDetected`
- **Condition**: Periodic reconciliation job detects `issue.comment_count != COUNT(*) FROM issue_comments WHERE issue_id = issue.id` for any issue.
- **Severity**: Warning
- **Runbook**:
  1. This indicates the atomic decrement failed silently or a race condition between create and delete operations caused a count mismatch.
  2. Query the affected issue IDs from the reconciliation output.
  3. For each affected issue, run: `UPDATE issues SET comment_count = (SELECT COUNT(*) FROM issue_comments WHERE issue_id = issues.id) WHERE id = <issue_id>`.
  4. Investigate server logs for `issue_comment.delete_count_decrement_failed` entries around the time of the drift.
  5. If drift is systematic (many issues), check for database replication lag or failed transactions in the delete path.
  6. Consider adding a periodic reconciliation cron job if drift occurs frequently.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| DB delete query fails | Returns `500 Internal Server Error`. Comment still exists. Count unchanged. | Client retries. No orphaned state. |
| Count decrement fails after successful delete | Comment is deleted but count is stale (off by 1). | Eventually consistent — count can be reconciled by re-counting. Logged as `ERROR` for investigation. |
| Webhook dispatch fails after successful delete | Comment is deleted. Webhook delivery enters retry queue. | Webhook worker retries on schedule (1m, 5m, 30m, 2h). Auto-disables webhook after 10 consecutive failures. |
| Concurrent delete + delete race | First request succeeds with `204`. Second returns `404`. Count decrements exactly once. | No action needed — this is correct behavior. |
| Concurrent delete + edit race | If delete completes first, edit returns `404`. If edit completes first, delete removes the updated comment. | No action needed — both outcomes are acceptable. Last operation wins. |
| Delete on an issue whose count is already 0 | Comment is deleted. Decrement may produce a negative count. | Reconciliation job corrects the count. The decrement query should use `GREATEST(comment_count - 1, 0)` to prevent negatives. |
| Network timeout during delete | Client does not know if the delete succeeded. | Client should re-check the comment's existence via GET and retry the delete if it still exists. |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **Delete a comment on an open issue**: Create an issue, add a comment, DELETE the comment. Verify `204` status, empty response body.
- [ ] **Verify comment is gone after deletion**: After deleting a comment, GET `/api/repos/:owner/:repo/issues/comments/:id`. Verify `404 Not Found`.
- [ ] **Verify comment is removed from list**: After deleting a comment, GET the issue's comment list. Verify the deleted comment does not appear.
- [ ] **Verify comment count decrements**: GET the issue before deletion, note `comment_count`. DELETE the comment. GET the issue again and verify `comment_count` decremented by 1.
- [ ] **Delete a comment on a closed issue**: Create an issue, add a comment, close the issue, DELETE the comment. Verify `204`.
- [ ] **Delete own comment as write-access user**: Authenticate as a user with write access who authored the comment. DELETE the comment. Verify `204`.
- [ ] **Delete another user's comment as repository admin**: Authenticate as repository admin. DELETE a comment authored by a different user. Verify `204`.
- [ ] **Delete another user's comment as repository owner**: Authenticate as repository owner. DELETE a comment authored by a different user. Verify `204`.
- [ ] **Delete a comment using PAT authentication**: Use a PAT in the `Authorization` header instead of session cookies. Verify `204`.
- [ ] **Delete one of multiple comments**: Create 3 comments on an issue. Delete the second one. Verify only 2 comments remain in the list and `comment_count` is correct.
- [ ] **Delete all comments on an issue**: Create 3 comments, delete all three. Verify `comment_count` is 0 and the comment list is empty.
- [ ] **Delete a comment with a very large body**: Create a comment with a body of exactly 65,535 characters. DELETE it. Verify `204` and the comment is removed.

#### Authorization & Permission Tests

- [ ] **Unauthenticated request**: DELETE without any auth credentials. Verify `401 Unauthorized`.
- [ ] **Read-only user attempting delete**: Authenticate as a user with only read access. DELETE a comment. Verify `403 Forbidden`.
- [ ] **Write-access user attempting to delete another's comment**: Authenticate as a user with write (but not admin) access. DELETE a comment authored by a different user. Verify `403 Forbidden`.
- [ ] **Private repo, no access**: Authenticate as a user with no access to a private repo. Verify `404 Not Found` (not `403`).
- [ ] **Archived repository**: DELETE a comment in an archived repository. Verify `403 Forbidden`.

#### Validation & Error Path

- [ ] **Non-existent comment ID**: DELETE with comment ID `999999999` that does not exist. Verify `404 Not Found`.
- [ ] **Comment ID zero**: DELETE with comment ID `0`. Verify `400 Bad Request` with message `"invalid comment id"`.
- [ ] **Negative comment ID**: DELETE with comment ID `-1`. Verify `400 Bad Request`.
- [ ] **Non-numeric comment ID**: DELETE with comment ID `abc`. Verify `400 Bad Request`.
- [ ] **Comment belongs to different repository**: Create a comment in repo A. Try to DELETE it using repo B's URL. Verify `404 Not Found`.
- [ ] **Non-existent repository**: DELETE at `/api/repos/no-such-owner/no-such-repo/issues/comments/1`. Verify `404 Not Found`.
- [ ] **Deleting an already-deleted comment**: DELETE the same comment twice. First returns `204`, second returns `404`.
- [ ] **Float comment ID**: DELETE with comment ID `1.5`. Verify `400 Bad Request`.

#### Concurrency & Edge Cases

- [ ] **Concurrent deletion of the same comment**: Send 10 concurrent DELETE requests for the same comment ID. Verify exactly one returns `204` and the rest return `404`. Verify the issue's `comment_count` decrements by exactly 1.
- [ ] **Delete comment immediately after creation**: Create a comment and immediately DELETE it within the same test. Verify both succeed.
- [ ] **Delete during concurrent comment creation**: While one user is creating comments on an issue, another user deletes an existing comment. Verify both operations complete correctly and the final `comment_count` is accurate.

### CLI Integration Tests

- [ ] **`codeplane issue comment-delete <id> --yes`**: Delete a comment via CLI with confirmation bypassed. Verify default output: `"Deleted comment #<id> from issue #<number>"`.
- [ ] **`codeplane issue comment-delete <id> --yes --json`**: Delete a comment with JSON output. Verify returned JSON has `deleted: true`, `comment_id`, and `issue_number`.
- [ ] **`codeplane issue comment-delete <id> --yes --repo OWNER/REPO`**: Delete a comment using explicit repo flag. Verify success.
- [ ] **CLI error: non-existent comment**: Run `codeplane issue comment-delete 999999999 --yes`. Verify CLI outputs a not-found error.
- [ ] **CLI error: unauthenticated**: Run without prior `auth login`. Verify CLI outputs an authentication error.
- [ ] **CLI error: permission denied**: Attempt to delete another user's comment as a non-admin. Verify CLI outputs a permission error.
- [ ] **CLI confirmation prompt (no --yes)**: Run `codeplane issue comment-delete <id>` without `--yes`. Verify the CLI shows the comment preview and confirmation prompt. Respond with `n` and verify the comment is NOT deleted.
- [ ] **CLI confirmation prompt (accept)**: Run `codeplane issue comment-delete <id>` without `--yes`. Respond with `y` and verify the comment IS deleted.

### E2E Playwright Tests (Web UI)

- [ ] **Delete own comment via overflow menu**: Navigate to issue detail, hover over own comment, click `⋯`, click "Delete", confirm in dialog. Verify the comment is removed from the thread.
- [ ] **Comment count updates after deletion**: Verify the comment count in the issue header decrements after successful deletion.
- [ ] **Confirmation dialog appears**: Click delete on a comment, verify the confirmation dialog appears with "Delete this comment? This action cannot be undone." text and Cancel/Delete buttons.
- [ ] **Cancel deletion**: Open the confirmation dialog, click "Cancel". Verify the comment remains in the thread.
- [ ] **Delete button not shown for others' comments (non-admin)**: Log in as a write-access user (not admin). Verify the overflow menu on another user's comment does not contain "Delete".
- [ ] **Admin can delete others' comments**: Log in as repository admin. Verify the overflow menu on another user's comment contains "Delete". Delete the comment and verify removal.
- [ ] **Error toast on server failure**: Mock a 500 response, attempt deletion, confirm. Verify an error toast appears and the comment remains visible.
- [ ] **Optimistic removal and revert on error**: Mock a slow failing response. Confirm deletion. Verify the comment disappears immediately, then reappears when the error response arrives.
- [ ] **Delete the only comment**: Create an issue with one comment. Delete it. Verify the comment list shows an empty state.
- [ ] **Loading state on confirmation button**: Mock a slow successful response. Click Delete in the confirmation dialog. Verify the button shows a loading spinner and is disabled.
- [ ] **No delete action for unauthenticated users**: Visit issue detail while logged out. Verify no overflow menu or delete action appears on comments.

### Webhook & Workflow Integration Tests

- [ ] **Webhook delivery on comment deletion**: Create a webhook subscribing to `issue_comment` events. Create and then delete a comment. Verify a webhook delivery is recorded with `action: "deleted"` and the payload contains the comment data as it existed before deletion (body, commenter, timestamps).
- [ ] **Webhook payload includes full comment data**: Verify the webhook payload's `comment` object contains `id`, `issue_id`, `user_id`, `commenter`, `body`, `type`, `created_at`, and `updated_at` — all reflecting the pre-deletion state.
- [ ] **Workflow trigger on issue comment deleted**: Define a workflow with an `issue_comment.deleted` trigger. Delete a comment. Verify a workflow run is created.

### TUI Integration Tests

- [ ] **Press `x` on focused own comment**: Focus an authored comment in the TUI, press `x`. Verify the confirmation dialog appears.
- [ ] **Confirm deletion in TUI**: Press `y` or `Enter` in the confirmation dialog. Verify the comment is removed from the list and the comment count separator updates.
- [ ] **Cancel deletion in TUI**: Press `Esc` or `n` in the confirmation dialog. Verify the comment remains.
- [ ] **`x` is no-op on non-authored comment (non-admin)**: Focus a comment authored by another user (as non-admin). Press `x`. Verify nothing happens.
- [ ] **Focus moves after deletion**: Delete the middle comment in a list of 3. Verify focus moves to the next comment.
- [ ] **Focus after deleting last comment**: Delete the last comment in the list. Verify focus moves to the previous comment.
- [ ] **Focus after deleting only comment**: Delete the only comment. Verify focus returns to the issue body area and the empty state message appears.

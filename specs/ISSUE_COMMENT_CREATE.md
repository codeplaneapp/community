# ISSUE_COMMENT_CREATE

Specification for ISSUE_COMMENT_CREATE.

## High-Level User POV

When a user is viewing an issue in Codeplane — whether through the web UI, terminal UI, CLI, or an editor integration — they can add a comment to contribute to the discussion. Commenting on an issue is one of the most fundamental collaboration actions in a software forge: it lets developers ask clarifying questions, share investigation results, propose solutions, reference related changes, mention teammates, and build a human-readable audit trail of how work progresses from problem statement to resolution.

A user navigates to an issue they care about and writes a comment using a markdown-capable text input. The comment appears immediately in the chronological thread beneath the issue body. The system automatically notifies the issue author, all assignees, anyone mentioned with an `@username` reference in the comment, and anyone watching the repository — while excluding the commenter themselves from receiving a redundant notification. The issue's visible comment count increments to reflect the new comment.

Comments support full markdown formatting, including code blocks, inline code, links, images, lists, and headings. This ensures that technical discussion around issues maintains the same expressive power developers expect from modern collaboration tools. Comments are flat (not threaded), keeping the conversation model simple and chronological.

The same comment creation experience is available from every Codeplane surface: the web application's issue detail view, the terminal UI's issue detail screen, the CLI's `issue comment` command, and through direct API calls. Agents can also create comments programmatically when performing automated issue triage, investigation, or resolution workflows. Regardless of which surface creates the comment, the result is identical: a timestamped, attributed markdown comment that becomes part of the issue's permanent record and triggers the appropriate notification and webhook fanout.

## Acceptance Criteria

### Definition of Done

A comment has been successfully created when:

- The comment is persisted in the database with the correct issue association, author attribution, body content, and timestamps.
- The issue's `comment_count` field has been atomically incremented.
- Notifications have been dispatched to all eligible recipients (issue author, assignees, @mentioned users, repository watchers) excluding the commenter.
- Webhook deliveries have been enqueued for any repository webhooks subscribing to `issue_comment` events.
- Workflow triggers matching `issue_comment.created` have been evaluated and matching workflows dispatched.
- The comment is immediately visible via all read paths (list, get by ID).
- The API returns a `201 Created` response with the complete comment resource.

### Input Constraints

- [ ] **Body is required**: The `body` field must be present and non-empty after trimming whitespace. An empty or whitespace-only body must return a `422 Validation Failed` error with `{ resource: "IssueComment", field: "body", code: "missing_field" }`.
- [ ] **Body maximum length**: The body must not exceed 65,535 characters (64 KiB text column limit). Bodies exceeding this length must return a `422 Validation Failed` error. Client-side rendering truncates display at 50,000 characters with a "truncated" notice.
- [ ] **Body content**: The body is stored as-is (after trim). No server-side sanitization of markdown content is performed; rendering clients are responsible for safe markdown rendering. The body may contain any valid UTF-8 characters including emoji, CJK characters, and special symbols.
- [ ] **No duplicate prevention**: Multiple identical comments by the same user on the same issue are permitted. There is no idempotency constraint on comment creation.

### Issue Constraints

- [ ] **Issue must exist**: The target issue (identified by `owner/repo` + `number`) must exist. A non-existent issue returns `404 Not Found`.
- [ ] **Issue may be in any state**: Comments can be added to both open and closed issues. There is no state-gate on comment creation.
- [ ] **Locked issue handling**: If issue locking is active, only users with write access to the repository can comment on locked issues. Other authenticated users receive a `403 Forbidden`.

### Repository Constraints

- [ ] **Repository must exist**: The repository identified by `owner/repo` must exist. A non-existent repository returns `404 Not Found`.
- [ ] **Repository access**: The user must have at minimum write access to the repository to create a comment. Read-only access is insufficient.
- [ ] **Private repositories**: Comments on issues in private repositories require the user to have explicit repository access.
- [ ] **Archived repositories**: Commenting on issues in archived repositories is disallowed and returns `403 Forbidden`.

### Side Effects

- [ ] **Comment count**: The parent issue's `comment_count` column must be incremented by exactly 1, atomically.
- [ ] **Notification fanout**: Notifications are dispatched to: issue author, all current issue assignees, all `@mentioned` usernames found in the body, and all repository watchers — minus the commenter.
- [ ] **Webhook delivery**: A `issue_comment` webhook event with action `created` is enqueued for every active repository webhook subscribing to the `issue_comment` event type.
- [ ] **Workflow trigger evaluation**: Any repository workflow definitions with `issue_comment` triggers matching the `created` action type are evaluated and matching runs are dispatched.

### Response Contract

- [ ] **Status code**: `201 Created` on success.
- [ ] **Response body**: A JSON object with fields: `id` (number), `issue_id` (number), `user_id` (number), `commenter` (string — username), `body` (string), `type` (string — always `"comment"`), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
- [ ] **Timestamps**: `created_at` and `updated_at` must be identical on creation and reflect the server's current time.

## Design

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/issues/:number/comments`

**Request Headers**:
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body**:
```json
{
  "body": "string (required, 1–65535 chars after trim)"
}
```

**Success Response** (`201 Created`):
```json
{
  "id": 42,
  "issue_id": 7,
  "user_id": 1,
  "commenter": "alice",
  "body": "I've identified the root cause — see change `kxqpznmt`.",
  "type": "comment",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `401 Unauthorized` | No authentication provided | `{ "message": "authentication required" }` |
| `403 Forbidden` | User lacks write access to repository, or repo is archived | `{ "message": "forbidden" }` |
| `404 Not Found` | Repository or issue does not exist | `{ "message": "not found" }` |
| `422 Unprocessable Entity` | Body is empty/missing | `{ "message": "Validation Failed", "errors": [{ "resource": "IssueComment", "field": "body", "code": "missing_field" }] }` |
| `422 Unprocessable Entity` | Body exceeds 65,535 characters | `{ "message": "Validation Failed", "errors": [{ "resource": "IssueComment", "field": "body", "code": "too_long" }] }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

**Pagination headers**: The `X-Total-Count` header is not set on the create response (it applies to list endpoints only).

### SDK Shape

The `IssueService` in `@codeplane/sdk` exposes:

```typescript
createIssueComment(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  number: number,
  req: CreateIssueCommentInput
): Promise<IssueCommentResponse>
```

Where:
```typescript
interface CreateIssueCommentInput {
  body: string;
}

interface IssueCommentResponse {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;
  created_at: string;
  updated_at: string;
}
```

### CLI Command

**Command**: `codeplane issue comment <number> --body <text> [--repo OWNER/REPO]`

**Arguments**:
- `number` (positional, required): The issue number to comment on. Parsed via `parseIssueNumber()` which validates it is a positive integer.

**Options**:
- `--body` (required): The comment body text. Supports multi-line strings when quoted.
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.

**Output (default)**: `Added a comment to issue #<number>`

**Output (`--json`)**: The full `IssueCommentResponse` JSON object.

**Error handling**: Errors are routed through `handleIssueApiError()` which maps HTTP status codes to user-friendly CLI error messages.

### Web UI Design

**Location**: Issue detail view at `/:owner/:repo/issues/:number`

**Comment Form**:
- Positioned below the existing comment thread at the bottom of the issue detail page.
- Contains a markdown-capable textarea with placeholder text: "Leave a comment…"
- A "Comment" submit button is right-aligned below the textarea.
- The textarea supports markdown preview (write/preview tabs).
- The submit button is disabled when the body is empty or while a submission is in flight.
- On successful submission, the textarea clears, the new comment appears at the bottom of the comment list, and the comment count in the issue header updates.

**Unauthenticated state**: When the viewer is not authenticated, the comment form is replaced with a prompt: "Sign in to comment on this issue."

**Loading state**: While the comment is being submitted, the submit button shows a loading spinner and the textarea is non-editable.

**Error state**: If the server returns an error, a toast notification appears with the error message and the textarea content is preserved so the user can retry.

**Optimistic UI**: The comment should appear immediately in the thread with a pending indicator (subtle opacity or spinner) and be confirmed or reverted when the server responds.

### TUI UI

**Activation**: Press `c` on the issue detail screen to open the comment creation panel.

**Panel layout**: An inline panel appears at the bottom of the issue detail view containing a multi-line textarea.

**Textarea sizing** (responsive):
- 80×24 terminal: 5 rows
- 120×40 terminal: 8 rows
- 200×60+ terminal: 12 rows

**Keybindings**:
- `Ctrl+S`: Submit the comment (validates body is non-empty)
- `Esc`: Cancel and close the panel. If the textarea has content, show a discard confirmation: "Discard comment? (y/n)". If confirmed or empty, close and restore scroll position.
- All other issue-detail keybindings (`j`, `k`, `n`, `p`, `q`, etc.) are disabled while the comment panel is active.

**Status bar**: Shows `Ctrl+S:submit │ Esc:cancel` while the panel is open.

**Optimistic UI**: On submit, the comment immediately appears in the comment list with a `⏳` pending indicator. On server confirmation, the indicator is removed. On error, the optimistic comment is removed, the panel reopens with the content preserved, and an inline error toast is shown.

**Error messages**:
- 401: "Session expired. Run `codeplane auth login`."
- 403: "Permission denied. You cannot comment on this issue."
- 422: Server validation error displayed inline.
- 429: "Rate limit exceeded. Please wait and try again."
- 5xx / network: "Failed to post comment. Your text has been preserved."

### Editor Integrations

**VS Code**: The issue detail webview supports commenting through the embedded web UI. No separate VS Code-native comment form is required.

**Neovim**: Comments can be created via the `issue comment` CLI command, which is accessible through Neovim's command integration: `:Codeplane issue comment <number> --body "text"`.

### Documentation

The following documentation must be provided:

- **API Reference** (`docs/api-reference/issues.mdx`): Document the `POST /api/repos/:owner/:repo/issues/:number/comments` endpoint with request/response schema, error codes, and a curl example.
- **CLI Reference** (`docs/cli/issue.mdx`): Document the `issue comment` subcommand with arguments, options, and example usage.
- **Webhook Events** (`docs/api-reference/webhooks.mdx`): Document the `issue_comment` event payload shape for the `created` action, including all fields delivered in the webhook body.
- **Workflow Triggers** (`docs/workflows/triggers.mdx`): Document the `issueComment.created()` trigger and how to use it in a workflow definition.

## Permissions & Security

### Authorization Matrix

| Role | Can Create Comment? | Notes |
|------|---------------------|-------|
| **Repository Owner** | ✅ Yes | Full access |
| **Organization Admin** | ✅ Yes | Org-level admin implies repo write access |
| **Repository Admin** | ✅ Yes | Explicit admin on repo |
| **Team Member (write)** | ✅ Yes | Team with write permissions on repo |
| **Team Member (read)** | ❌ No | Read access is insufficient for commenting |
| **Collaborator (write)** | ✅ Yes | Direct write collaborator |
| **Collaborator (read)** | ❌ No | Read-only collaborators cannot comment |
| **Authenticated (public repo, no explicit access)** | ❌ No | Must have write access even on public repos |
| **Anonymous / Unauthenticated** | ❌ No | Returns 401 |

### Rate Limiting

- **Per-user rate limit**: 30 comments per minute per authenticated user across all repositories.
- **Per-repository rate limit**: 100 comments per minute across all users for a single repository.
- **Global rate limit**: Inherits from the platform-wide API rate limiting middleware.
- **PAT-based access**: Subject to the same rate limits as session-based access.

### Data Privacy

- **PII exposure**: The `commenter` field in the response exposes the username of the comment author. This is intentional and consistent with forge semantics — comments are public attributions.
- **Body content**: Comment bodies may contain @mentions which reference other usernames. This is by design for notification routing.
- **Audit trail**: Comment creation is logged with the actor's user ID, the target issue, and the repository. This log is accessible to repository and organization administrators.
- **No secret scanning**: Comment bodies are not scanned for secrets or tokens. Users are responsible for not pasting sensitive data into comments.

## Telemetry & Product Analytics

### Business Events

**Event: `IssueCommentCreated`**

Properties:
- `comment_id` (number): The ID of the created comment.
- `issue_id` (number): The parent issue ID.
- `issue_number` (number): The parent issue number.
- `repository_id` (string): The repository ID.
- `repository_owner` (string): The repository owner name.
- `repository_name` (string): The repository name.
- `actor_id` (number): The authenticated user ID.
- `actor_username` (string): The authenticated username.
- `body_length` (number): Character count of the trimmed comment body.
- `has_mentions` (boolean): Whether the body contains `@username` mentions.
- `mention_count` (number): Number of distinct @mentions found.
- `has_code_blocks` (boolean): Whether the body contains fenced code blocks.
- `source` (string): The client surface that created the comment (`"web"`, `"cli"`, `"tui"`, `"api"`, `"agent"`).
- `issue_state` (string): The current state of the issue (`"open"` or `"closed"`).
- `latency_ms` (number): Server-side processing time in milliseconds.

### Funnel Metrics & Success Indicators

- **Comment creation rate**: Comments created per active user per day. A healthy forge should see steady or growing comment activity.
- **Issue-to-first-comment latency**: Time from issue creation to the first comment. Shorter latency indicates active engagement.
- **Comment-per-issue distribution**: Average and median comments per issue. Indicates collaboration depth.
- **Cross-surface adoption**: Breakdown of comment creation by source (`web`, `cli`, `tui`, `api`, `agent`). Healthy product shows usage across multiple surfaces.
- **Error rate**: Percentage of comment creation attempts that fail (4xx or 5xx). Should remain below 1%.
- **Agent comment ratio**: Percentage of comments created by agents vs. humans. Tracks the adoption of agent-assisted workflows.

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `issue_comment.created` | `INFO` | `comment_id`, `issue_id`, `issue_number`, `repo_id`, `actor_id`, `body_length`, `latency_ms` | On successful comment creation |
| `issue_comment.create_failed` | `WARN` | `issue_number`, `repo_owner`, `repo_name`, `actor_id`, `error_code`, `error_message` | On any non-2xx response |
| `issue_comment.validation_failed` | `WARN` | `issue_number`, `repo_owner`, `repo_name`, `actor_id`, `field`, `code` | On 422 validation errors |
| `issue_comment.unauthorized` | `WARN` | `issue_number`, `repo_owner`, `repo_name`, `request_ip` | On 401 unauthenticated attempt |
| `issue_comment.forbidden` | `WARN` | `issue_number`, `repo_owner`, `repo_name`, `actor_id` | On 403 permission denied |
| `issue_comment.notification_fanout` | `DEBUG` | `comment_id`, `issue_id`, `recipient_count`, `mention_count` | After notification dispatch |
| `issue_comment.webhook_dispatched` | `DEBUG` | `comment_id`, `issue_id`, `webhook_count` | After webhook event enqueue |

### Prometheus Metrics

**Counters**:
- `codeplane_issue_comments_created_total` — Labels: `repo_owner`, `source` (`web`/`cli`/`tui`/`api`/`agent`). Total successful comment creations.
- `codeplane_issue_comments_create_errors_total` — Labels: `error_code` (`401`, `403`, `404`, `422`, `429`, `500`). Total failed comment creation attempts.
- `codeplane_issue_comment_notifications_sent_total` — Labels: `notification_type` (`author`, `assignee`, `mention`, `watcher`). Total notifications dispatched due to comments.

**Histograms**:
- `codeplane_issue_comment_create_duration_seconds` — Labels: `source`. Latency of comment creation (DB insert + count increment + notification fanout). Buckets: `[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`.
- `codeplane_issue_comment_body_length_chars` — Labels: none. Distribution of comment body lengths. Buckets: `[10, 50, 100, 500, 1000, 5000, 10000, 50000, 65535]`.

**Gauges**:
- `codeplane_issue_comment_create_inflight` — Labels: none. Number of comment creation requests currently in progress.

### Alerts

#### Alert: `IssueCommentCreateErrorRateHigh`
- **Condition**: `rate(codeplane_issue_comments_create_errors_total[5m]) / rate(codeplane_issue_comments_created_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_comments_create_errors_total` by `error_code` label to identify the dominant error type.
  2. If `422` errors dominate: likely a client bug sending empty bodies. Check recent client deployments. No server action needed.
  3. If `401`/`403` errors dominate: check auth service health, session cookie issuance, and PAT validation.
  4. If `500` errors dominate: check server logs for `issue_comment.create_failed` entries. Examine DB connection health and query latency. Check if `dbCreateIssueComment` or `dbIncrementIssueCommentCount` is failing.
  5. If `429` errors dominate: review rate limit configuration. Check if a single user or bot is generating excessive traffic.

#### Alert: `IssueCommentCreateLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_comment_create_duration_seconds_bucket[5m])) > 2` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database latency metrics. Issue comment creation involves two DB calls (insert + count increment), so DB slowness has an outsized effect.
  2. Check notification fanout latency. If the fanout service is slow (e.g., many watchers on a popular repository), it may block the response. Consider whether fanout should be made async.
  3. Check connection pool saturation. High inflight gauge combined with high latency suggests connection pool exhaustion.
  4. Check disk I/O on the database host. Heavy write load from other features may be causing contention.

#### Alert: `IssueCommentNotificationFanoutFailure`
- **Condition**: Structured log entries with `issue_comment.notification_fanout` at `ERROR` level > 5 in 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the notification service health. Examine `createNotification` and `notifyUser` DB function success rates.
  2. Verify PostgreSQL NOTIFY channel is operational for real-time SSE delivery.
  3. Check if the watcher query is timing out on repositories with large watcher counts. The fanout pages through watchers at 200 per batch (`WATCHER_PAGE_SIZE`).
  4. Notification fanout failures are non-blocking — the comment was still created successfully. Monitor for recovery before escalating.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| DB insert fails | Returns `500 Internal Server Error`. Comment count is NOT incremented. | Automatic retry by client. No orphaned state. |
| Count increment fails after insert | Comment exists but count is stale. | Eventually consistent — count can be reconciled by re-counting. Log as error for investigation. |
| Notification fanout fails | Comment is created successfully. Notifications are lost for this event. | Best-effort delivery. No retry mechanism for missed notifications. Logged for auditing. |
| Webhook dispatch fails | Comment is created. Webhook delivery enters retry queue. | Webhook worker retries on schedule (1m, 5m, 30m, 2h). Auto-disables webhook after 10 consecutive failures. |
| Body exceeds DB column limit | Returns `422` before insert. | Client-side validation should prevent this. |
| Concurrent comment creation race | Both succeed independently. Comment counts increment correctly due to atomic increment. | No action needed — this is expected behavior. |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **Create a comment on an open issue**: POST a valid comment body to an open issue. Verify `201` status, returned `id` is a positive integer, `body` matches input, `commenter` matches actor username, `type` is `"comment"`, `created_at` and `updated_at` are valid ISO 8601 and equal.
- [ ] **Create a comment on a closed issue**: POST a valid comment to a closed issue. Verify `201` status — commenting on closed issues is allowed.
- [ ] **Create multiple comments on the same issue**: POST 3 comments sequentially. Verify each returns a unique `id` and all are visible in the subsequent list response.
- [ ] **Create a comment with markdown content**: POST a body containing headings, code blocks, links, lists, bold, italic, and images. Verify the body is stored and returned verbatim.
- [ ] **Create a comment with @mentions**: POST a body containing `@alice` and `@bob`. Verify `201` and the body is returned with mentions intact.
- [ ] **Create a comment with emoji and unicode**: POST a body containing emoji (🎉), CJK characters (漢字), and special symbols (→ ≠ ∞). Verify exact round-trip.
- [ ] **Create a comment with maximum valid body length (65,535 chars)**: POST a body of exactly 65,535 characters. Verify `201` and the full body is stored.
- [ ] **Verify comment count increments**: GET the issue before commenting, note `comment_count`. POST a comment. GET the issue again and verify `comment_count` incremented by 1.
- [ ] **Verify comment appears in list**: POST a comment, then GET the issue's comment list. Verify the new comment appears in the list with correct fields.
- [ ] **Verify comment is retrievable by ID**: POST a comment, extract the `id`, then GET `/api/repos/:owner/:repo/issues/comments/:id`. Verify the returned comment matches.
- [ ] **Create a comment with PAT authentication**: Use a PAT in the `Authorization` header instead of session cookies. Verify `201`.
- [ ] **Create a comment with leading/trailing whitespace in body**: POST `"  hello world  "`. Verify the returned body is `"hello world"` (trimmed).

#### Validation & Error Path

- [ ] **Empty body string**: POST `{ "body": "" }`. Verify `422` with `missing_field` error on `body`.
- [ ] **Whitespace-only body**: POST `{ "body": "   \n\t  " }`. Verify `422` with `missing_field` error on `body`.
- [ ] **Missing body field**: POST `{}`. Verify `422` with `missing_field` error on `body`.
- [ ] **Body exceeds maximum length (65,536 chars)**: POST a body of 65,536 characters. Verify `422` with `too_long` error on `body`.
- [ ] **Non-existent repository**: POST to `/api/repos/no-such-owner/no-such-repo/issues/1/comments`. Verify `404`.
- [ ] **Non-existent issue number**: POST to a valid repo but with issue number `99999` that does not exist. Verify `404`.
- [ ] **Issue number zero**: POST with issue number `0`. Verify `400` or `404`.
- [ ] **Negative issue number**: POST with issue number `-1`. Verify `400` or `404`.
- [ ] **Non-integer issue number**: POST with issue number `abc`. Verify `400`.
- [ ] **Unauthenticated request**: POST without any auth credentials. Verify `401`.
- [ ] **Read-only user**: Authenticate as a user with only read access to the repo. POST a comment. Verify `403`.
- [ ] **Private repo, no access**: Authenticate as a user with no access to a private repo. Verify `404` (not `403`, to avoid leaking repo existence).
- [ ] **Archived repository**: POST a comment to an issue in an archived repository. Verify `403`.
- [ ] **Invalid JSON body**: POST with malformed JSON. Verify `400`.
- [ ] **Wrong content type**: POST with `Content-Type: text/plain`. Verify `415` or `400`.

#### Concurrency & Edge Cases

- [ ] **Concurrent comment creation**: POST 10 comments to the same issue concurrently. Verify all 10 succeed, all have unique IDs, and the issue's `comment_count` reflects exactly 10 new comments.
- [ ] **Comment on issue immediately after creation**: Create an issue and immediately POST a comment in the same test. Verify both succeed without race conditions.
- [ ] **Very long body near boundary**: POST bodies of 65,534, 65,535, and 65,536 characters. Verify the first two succeed and the third fails.

### CLI Integration Tests

- [ ] **`codeplane issue comment <number> --body <text>`**: Create a comment via CLI. Verify default output: `"Added a comment to issue #<number>"`.
- [ ] **`codeplane issue comment <number> --body <text> --json`**: Create a comment with JSON output. Verify returned JSON has `id`, `body`, `commenter`, `type`, `created_at`.
- [ ] **`codeplane issue comment <number> --body <text> --repo OWNER/REPO`**: Create a comment using explicit repo flag. Verify success.
- [ ] **CLI error: empty body**: Run `codeplane issue comment 1 --body ""`. Verify CLI outputs an error message.
- [ ] **CLI error: non-existent issue**: Run `codeplane issue comment 99999 --body "test"`. Verify CLI outputs a not-found error.
- [ ] **CLI error: unauthenticated**: Run without prior `auth login`. Verify CLI outputs an authentication error.
- [ ] **CLI: comment body with special characters**: Run with body containing quotes, newlines (in shell quoting), and backslashes. Verify exact round-trip.

### E2E Playwright Tests (Web UI)

- [ ] **Navigate to issue detail, type and submit a comment**: Visit `/:owner/:repo/issues/:number`, enter text in the comment textarea, click "Comment", verify the comment appears in the thread.
- [ ] **Comment form is disabled when empty**: Verify the submit button is disabled when the textarea is empty.
- [ ] **Comment form shows loading state during submission**: Mock slow API response, verify spinner appears on submit button and textarea becomes non-editable.
- [ ] **Comment appears with correct attribution**: After submitting, verify the comment shows the correct username and a relative timestamp.
- [ ] **Comment count updates after submission**: Verify the comment count in the issue header increments after a successful comment.
- [ ] **Error toast on server failure**: Mock a 500 response, submit a comment, verify an error toast appears and the textarea content is preserved.
- [ ] **Unauthenticated state shows sign-in prompt**: Visit issue detail while logged out, verify "Sign in to comment" message appears instead of the comment form.
- [ ] **Markdown preview works**: Enter markdown in the textarea, switch to preview tab, verify rendered markdown is displayed.
- [ ] **Comment on closed issue**: Navigate to a closed issue, verify the comment form is still present and functional.

### Webhook & Notification Integration Tests

- [ ] **Webhook delivery on comment creation**: Create a webhook subscribing to `issue_comment` events. Create a comment. Verify a webhook delivery is recorded with the correct event type and payload containing `action: "created"`, comment body, issue number, and commenter.
- [ ] **Notification created for issue author**: Create an issue as user A. Comment as user B. Verify user A receives a notification with source type `issue_comment` and subject containing the issue title.
- [ ] **No self-notification**: Create an issue and comment as the same user. Verify no notification is created for that user.
- [ ] **@mention notification**: Comment with `@charlie` in the body. Verify user `charlie` receives a notification.
- [ ] **Assignee notification**: Assign user D to the issue. Comment as user E. Verify user D receives a notification.

### Workflow Trigger Integration Tests

- [ ] **Workflow trigger on issue comment created**: Define a workflow with an `issue_comment.created` trigger. Create a comment. Verify a workflow run is created.

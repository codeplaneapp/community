# ISSUE_COMMENT_EDIT

Specification for ISSUE_COMMENT_EDIT.

## High-Level User POV

When a user has posted a comment on an issue in Codeplane and later realizes they made a typo, left out important context, or want to refine their message, the Issue Comment Edit feature lets them update the comment body in place. Rather than deleting the original comment and posting a new one — which disrupts the conversation's chronological thread and loses the original timestamp — the user simply edits their existing comment, and the system updates it while preserving its position in the timeline.

From the web UI, a user sees an "Edit" control on any comment they authored. Clicking it transforms the rendered markdown into an editable textarea, pre-populated with the comment's current body. The user can refine the text, preview their markdown changes, and save — or cancel to discard modifications. After saving, the comment displays an "edited" indicator next to the timestamp so other participants can see it was modified. Repository administrators also have the ability to edit any comment, not just their own, which is important for moderation and content correction.

From the CLI, a user runs `codeplane issue comment-edit` with the comment ID and a new body to make a quick surgical fix without leaving the terminal. This is particularly useful for agents or automation scripts that need to correct a comment they previously posted.

From the TUI, a user navigates to a comment they authored, presses `e` to enter edit mode, modifies the body in a pre-populated textarea, and presses `Ctrl+S` to save. The comment updates immediately with an optimistic UI indicator, confirmed once the server responds.

The value of Issue Comment Edit is that it keeps issue discussions clean and accurate without requiring users to delete and repost. It respects the collaborative audit trail by showing an "edited" indicator, and it works consistently across all Codeplane client surfaces — web, CLI, TUI, and API.

## Acceptance Criteria

- **Body-only edit**: Only the `body` field of a comment may be modified. Author, timestamps, issue association, and other metadata are immutable through this operation.
- **Body is required**: The updated body must be non-empty after trimming whitespace. An empty or whitespace-only body must be rejected with a `422 Validation Failed` error with `{ resource: "IssueComment", field: "body", code: "missing_field" }`.
- **Body maximum length**: The body must not exceed 65,535 characters (64 KiB text column limit). Bodies exceeding this length must return a `422 Validation Failed` error with `{ resource: "IssueComment", field: "body", code: "too_long" }`.
- **Body content**: The body is stored as-is after trimming. No server-side markdown sanitization is performed. The body may contain any valid UTF-8 characters including emoji, CJK characters, RTL scripts, and special symbols. Full markdown formatting is preserved.
- **Whitespace trimming**: Leading and trailing whitespace in the body is trimmed before validation and storage.
- **Authentication**: The user must be authenticated. Unauthenticated requests must return `401 Unauthorized`.
- **Authorization — comment author**: The comment author can always edit their own comment (given they have at least write access to the repository).
- **Authorization — repository admin/owner**: Repository owners, organization owners, and repository admins can edit any comment in the repository, not just their own.
- **Authorization — write collaborator non-author**: A user with write access who is NOT the comment author and NOT an admin/owner must receive `403 Forbidden`.
- **Authorization — read-only and anonymous**: Read-only users receive `403 Forbidden`. Anonymous users receive `401 Unauthorized`.
- **Not Found**: Editing a nonexistent comment ID or a comment belonging to a different repository must return `404 Not Found`.
- **Invalid comment ID**: A comment ID that is zero, negative, or non-numeric must return `400 Bad Request`.
- **Repository must exist**: The repository identified by `owner/repo` must exist. A nonexistent repository returns `404 Not Found`.
- **Private repository access**: On private repositories, the user must have explicit repository access. Users without access receive `404 Not Found` (to avoid leaking repository existence).
- **Archived repository**: Editing comments in an archived repository is disallowed and returns `403 Forbidden`.
- **Timestamps**: The `updated_at` field must be set to the current server time on every successful edit. The `created_at` field must never change.
- **Edited indicator**: When `updated_at` differs from `created_at`, all clients must display an "edited" indicator next to the comment.
- **Idempotency**: Sending the same edit payload twice in succession must produce the same result and not error (second call updates `updated_at` again).
- **Edit to identical body**: Editing a comment to the same body content it already has must succeed (200 OK) and update `updated_at`.
- **No edit history**: The system does not maintain a revision history of comment edits. Only the latest body is stored.
- **Response contract**: A successful edit must return the full, updated comment object with all fields (`id`, `issue_id`, `user_id`, `commenter`, `body`, `type`, `created_at`, `updated_at`).
- **Status code**: Successful edit returns `200 OK`.
- **Side effects — webhook**: An `issue_comment` webhook event with action `edited` must be enqueued for any active repository webhooks subscribing to `issue_comment` events.
- **Side effects — workflow triggers**: Any repository workflow definitions with `issue_comment` triggers matching the `edited` action type must be evaluated.
- **CLI parity**: The CLI `issue comment-edit` command must support `--body` and `--repo` flags and produce structured JSON output with `--json`.
- **TUI parity**: The TUI must provide an inline edit flow triggered by `e` on a focused comment, with `Ctrl+S` to save and `Esc` to cancel (with confirmation if dirty).
- **Web UI parity**: The web UI must show an edit button on comments the user is authorized to edit, provide an inline editing surface with markdown preview, and display a save/cancel flow.
- **Definition of Done**: Feature is complete when a user can edit a comment's body from the API, CLI, TUI, and web UI with correct authorization (author or admin), the "edited" indicator displays on all surfaces, webhook and workflow triggers fire on edit, and all verification tests pass.

## Design

### API Shape

**Endpoint**: `PATCH /api/repos/:owner/:repo/issues/comments/:id`

**Request Headers**:
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body**:
```json
{
  "body": "string (required, 1–65535 chars after trim)"
}
```

**Success Response** (`200 OK`):
```json
{
  "id": 42,
  "issue_id": 7,
  "user_id": 1,
  "commenter": "alice",
  "body": "Updated comment text with corrected typo.",
  "type": "comment",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T15:45:00.000Z"
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Invalid or missing comment ID, malformed JSON | `{ "message": "invalid comment id" }` |
| `401 Unauthorized` | No authentication provided | `{ "message": "authentication required" }` |
| `403 Forbidden` | User lacks permission (non-author without admin role, or archived repo) | `{ "message": "forbidden" }` |
| `404 Not Found` | Comment, issue, or repository does not exist, or comment belongs to a different repository | `{ "message": "not found" }` |
| `422 Unprocessable Entity` | Body is empty/missing after trim | `{ "message": "Validation Failed", "errors": [{ "resource": "IssueComment", "field": "body", "code": "missing_field" }] }` |
| `422 Unprocessable Entity` | Body exceeds 65,535 characters | `{ "message": "Validation Failed", "errors": [{ "resource": "IssueComment", "field": "body", "code": "too_long" }] }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

### SDK Shape

The `IssueService` in `@codeplane/sdk` exposes:

```typescript
updateIssueComment(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  commentId: number,
  req: UpdateIssueCommentInput
): Promise<IssueCommentResponse>
```

Where:
```typescript
interface UpdateIssueCommentInput {
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

The SDK also exposes data hooks for UI/TUI consumers:
- `useIssueComment(owner, repo, commentId)` — Fetches the current comment for pre-population
- `useUpdateIssueComment(owner, repo, commentId)` — Returns `{ mutate, loading, error }` for submitting edits

### CLI Command

```
codeplane issue comment-edit <comment-id> [options]
```

**Arguments**:
- `<comment-id>` — Comment ID (required, positive integer)

**Options**:
- `--body <string>` — New comment body (required). Use `-` to read from stdin.
- `--repo <OWNER/REPO>` / `-R` — Target repository (defaults to current repo context)

**Output (default)**: `✓ Updated comment #<id> on issue #<number> in owner/repo`

**Output (`--json`)**: The full `IssueCommentResponse` JSON object.

**Output (`--json` with field filtering)**: Supports `--json body,updated_at` to return only selected fields.

**Error output**:
- Validation errors print the field and constraint that failed
- 404 prints `Comment not found in owner/repo`
- 403 prints `Permission denied: you can only edit your own comments (or be a repo admin)`
- 401 prints `Authentication required. Run 'codeplane auth login'.`

### Web UI Design

**Location**: Issue detail view at `/:owner/:repo/issues/:number`, within the comment timeline.

**Edit control visibility**:
- Each comment authored by the current user displays a "⋯" overflow menu or a pencil icon that reveals an "Edit" option.
- Repository owners and admins also see the "Edit" option on comments authored by other users.
- Users without edit permission see no edit control.

**Edit mode activation**:
- Clicking "Edit" transforms the rendered markdown body into an editable markdown textarea, pre-populated with the comment's raw markdown body.
- A toolbar above the textarea provides write/preview tabs for markdown preview.
- "Save" and "Cancel" buttons appear below the textarea.

**Save flow**:
- The "Save" button is disabled when the textarea is empty or whitespace-only, or while a submission is in-flight.
- On save, the textarea is replaced by the re-rendered markdown body and the "edited" indicator appears next to the timestamp.
- Loading state: While saving, the "Save" button shows a spinner and the textarea becomes read-only.

**Cancel flow**:
- If the user has modified the body and clicks "Cancel", a confirmation dialog appears: "Discard changes?"
- If the body is unchanged from the original, cancellation is immediate with no confirmation.

**Error handling**:
- On server error, a toast notification appears with the error message and the textarea remains open with content preserved so the user can retry.

**Optimistic UI**:
- On save, the UI optimistically updates the rendered comment body and shows the "edited" indicator. If the server returns an error, the body reverts to its previous content.

**Edited indicator**:
- When `updated_at` differs from `created_at`, display "(edited)" in muted text next to the comment timestamp.
- Hovering/focusing the "(edited)" text shows a tooltip with the full `updated_at` timestamp.

### TUI UI

**Activation**: Press `e` while a comment authored by the current user (or any comment if the user is a repo admin/owner) is focused in the issue detail view comment list. Alternatively, type `:edit-comment` in the command palette.

**Panel layout**: The comment's rendered body is replaced by a multi-line textarea pre-populated with the current body text.

**Textarea sizing** (responsive):
- 80×24 terminal: 5 rows
- 120×40 terminal: 8 rows
- 200×60+ terminal: 12 rows

**Keybindings**:
- `Ctrl+S`: Submit the edit (validates body is non-empty)
- `Esc`: Cancel and close the edit panel. If the textarea content differs from the original body, show a discard confirmation: "Discard changes? (y/n)". If confirmed or unchanged, close and restore the rendered comment view.
- All other issue-detail keybindings (`j`, `k`, `n`, `p`, `q`, etc.) are disabled while the edit panel is active.

**Status bar**: Shows `Ctrl+S:save │ Esc:cancel` while the edit panel is open.

**Optimistic UI**: On submit, the comment body updates immediately with a `⏳` pending indicator. On server confirmation, the indicator is replaced with "(edited)" in muted text. On error, the body reverts, the edit panel reopens with the content preserved, and an inline error toast is shown.

**Error messages**:
- 401: "Session expired. Run `codeplane auth login`."
- 403: "Permission denied. You can only edit your own comments."
- 404: "Comment not found."
- 422: Server validation error displayed inline.
- 429: "Rate limit exceeded. Please wait and try again."
- 5xx / network: "Failed to update comment. Your changes have been preserved."

### Editor Integrations

**VS Code**: The issue detail webview supports comment editing through the embedded web UI. No separate VS Code-native comment edit form is required.

**Neovim**: Comments can be edited via the `issue comment-edit` CLI command, which is accessible through Neovim's command integration: `:Codeplane issue comment-edit <comment-id> --body "text"`.

### Documentation

The following end-user documentation must be provided:

- **API Reference** (`docs/api-reference/issues.mdx`): Document the `PATCH /api/repos/:owner/:repo/issues/comments/:id` endpoint with request/response schema, error codes, and a curl example showing a comment edit.
- **CLI Reference** (`docs/cli/issue.mdx`): Document the `issue comment-edit` subcommand with arguments, options, and example usage (including reading body from stdin).
- **Web UI Guide** (`docs/guides/issues.mdx`): "Editing Comments" subsection under the Issues chapter, covering how to enter edit mode, preview changes, save, cancel, and understand the "edited" indicator.
- **TUI Guide** (`docs/guides/tui.mdx`): "Comment Editing" section showing the keyboard shortcut, edit flow, and discard-changes confirmation.
- **Webhook Events** (`docs/api-reference/webhooks.mdx`): Document the `issue_comment` event payload shape for the `edited` action, including `changes.body.from` showing the previous body.

## Permissions & Security

### Authorization Matrix

| Role | Can Edit Own Comments? | Can Edit Others' Comments? | Notes |
|------|------------------------|---------------------------|-------|
| **Repository Owner** | ✅ Yes | ✅ Yes | Full edit access to all comments |
| **Organization Owner** | ✅ Yes | ✅ Yes | Org-level admin implies repo admin |
| **Admin Collaborator** | ✅ Yes | ✅ Yes | Repo admin can moderate |
| **Write Collaborator** | ✅ Yes | ❌ No (403) | Can only edit own comments |
| **Read Collaborator** | ❌ No (403) | ❌ No (403) | Insufficient permissions |
| **Authenticated (public repo, no access)** | ❌ No (403) | ❌ No (403) | Must have write access |
| **Anonymous / Unauthenticated** | ❌ No (401) | ❌ No (401) | Returns 401 |

**Important implementation note**: The current implementation checks `requireWriteAccess(repository, actor)` but does NOT verify that the actor is the comment author. This must be tightened so that non-admin write collaborators can only edit their own comments, while admins/owners can edit any comment. The authorization logic should be:

```
allowed = (actor.id === comment.user_id) || isRepoAdmin(actor, repository) || isRepoOwner(actor, repository) || isOrgOwner(actor, repository)
```

### Rate Limiting

- **Per-user rate limit**: 30 comment edits per minute per authenticated user across all repositories.
- **Per-repository rate limit**: 100 comment edits per minute across all users for a single repository.
- **Global rate limit**: Inherits from the platform-wide API rate limiting middleware.
- **PAT-based access**: Subject to the same rate limits as session-based access.

### Data Privacy

- **PII exposure**: Comment bodies may contain PII. The API must never log full request bodies at INFO level — only at DEBUG, and only in non-production environments.
- **Author attribution**: The `commenter` field exposes the username of the original comment author. The editing user's identity is not reflected in the comment response itself (only in audit logs and telemetry events).
- **Edit transparency**: The `updated_at` timestamp reveals that an edit occurred and when. This is intentional for collaboration transparency. There is no "stealth edit" capability.
- **No edit history exposure**: Previous versions of the comment body are not stored or exposed, preventing accidental PII from being permanently recoverable through the API.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `IssueCommentEdited` | Successful PATCH returning 200 | `comment_id`, `issue_id`, `issue_number`, `repository_id`, `repository_owner`, `repository_name`, `actor_id`, `actor_username`, `is_author` (bool — whether the editor is the comment author), `body_length_before` (number), `body_length_after` (number), `source` (`"web"`, `"cli"`, `"tui"`, `"api"`, `"agent"`), `latency_ms` |
| `IssueCommentEditFailed` | PATCH returning 4xx/5xx | `comment_id`, `repository_id`, `actor_id`, `error_code`, `error_field`, `source` |
| `IssueCommentEditFormOpened` | User enters edit mode (web/TUI) | `comment_id`, `issue_id`, `repository_id`, `actor_id`, `is_author` (bool), `entry_point` (`"overflow_menu"`, `"pencil_icon"`, `"keyboard_shortcut"`, `"command_palette"`), `source` |
| `IssueCommentEditFormAbandoned` | User cancels edit with unsaved changes | `comment_id`, `issue_id`, `repository_id`, `actor_id`, `body_changed` (bool), `source` |

### Funnel Metrics

- **Edit initiation rate**: % of comment views where the user has edit permission that result in an edit form open or edit API call. Indicates discoverability.
- **Edit completion rate**: % of edit form opens that result in a successful save. Target: > 85%.
- **Edit abandonment rate**: % of edit form opens cancelled with unsaved changes. High rates indicate UX friction.
- **Author vs. admin edits**: Ratio of self-edits to admin-moderation edits. Most edits should be by the original author.
- **Time-to-edit**: Time between comment creation and first edit. Short times (< 60s) indicate typo corrections; longer times indicate substantive revisions.
- **Cross-surface adoption**: Breakdown of edits by source (`web`, `cli`, `tui`, `api`, `agent`).

### Success Indicators

- Edit completion rate > 85%.
- p95 edit latency < 500ms server-side.
- < 2% of comment edits result in validation errors (indicating good client-side pre-validation).
- > 90% of edits are by the original comment author (indicating the feature is used for self-correction, not moderation overreach).

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `issue_comment.edit_received` | DEBUG | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `request_id` | Request received (never log body content at this level) |
| `issue_comment.edited` | INFO | `comment_id`, `issue_id`, `issue_number`, `repo_id`, `actor_id`, `is_author`, `body_length`, `latency_ms`, `request_id` | Successful edit |
| `issue_comment.edit_validation_failed` | WARN | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `field`, `code`, `request_id` | 422 validation error |
| `issue_comment.edit_unauthorized` | WARN | `comment_id`, `repo_owner`, `repo_name`, `request_ip`, `request_id` | 401 unauthenticated attempt |
| `issue_comment.edit_forbidden` | WARN | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `is_author`, `request_id` | 403 insufficient permissions |
| `issue_comment.edit_not_found` | WARN | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `request_id` | 404 comment/repo not found |
| `issue_comment.edit_internal_error` | ERROR | `comment_id`, `repo_owner`, `repo_name`, `actor_id`, `error_message`, `stack`, `request_id` | DB failures, unexpected exceptions |
| `issue_comment.edit_webhook_dispatched` | DEBUG | `comment_id`, `issue_id`, `webhook_count`, `request_id` | After webhook event enqueue |

### Prometheus Metrics

**Counters**:
- `codeplane_issue_comment_edit_total` — Labels: `status` (`success`, `validation_error`, `auth_error`, `forbidden`, `not_found`, `internal_error`), `source` (`web`/`cli`/`tui`/`api`/`agent`). Total comment edit attempts.
- `codeplane_issue_comment_edit_by_role_total` — Labels: `role` (`author`, `admin`, `owner`). Tracks who is editing comments.

**Histograms**:
- `codeplane_issue_comment_edit_duration_seconds` — Labels: `source`. End-to-end edit latency. Buckets: `[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`.
- `codeplane_issue_comment_edit_body_length_chars` — Labels: none. Distribution of edited comment body lengths. Buckets: `[10, 50, 100, 500, 1000, 5000, 10000, 50000, 65535]`.

**Gauges**:
- `codeplane_issue_comment_edit_inflight` — Labels: none. Number of comment edit requests currently in progress.

### Alerts

#### Alert 1: `IssueCommentEditErrorRateHigh`
- **Condition**: `rate(codeplane_issue_comment_edit_total{status="internal_error"}[5m]) / rate(codeplane_issue_comment_edit_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_comment_edit_total{status="internal_error"}` by label breakdown to confirm it is not a single spike.
  2. Query application logs for `level=ERROR` with `event=issue_comment.edit_internal_error` in the last 15 minutes. Look at the `error_message` and `stack` fields.
  3. Check database connectivity: run `SELECT 1` against the primary database. If the DB is unresponsive, escalate to the database on-call.
  4. Check if errors are concentrated on a single repository (look at `repo_owner`/`repo_name` in logs) — may indicate a corrupt comment or issue record.
  5. If errors are across all repos, check recent deployments for regressions. Roll back if a deploy happened in the last 30 minutes.
  6. Verify the `issue_comments` table is not experiencing lock contention by checking `pg_stat_activity` for long-running transactions.

#### Alert 2: `IssueCommentEditLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_comment_edit_duration_seconds_bucket[5m])) > 2` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is elevated globally or scoped to specific repositories.
  2. Check database query latency dashboards. Comment edits involve: a comment lookup by ID, a repository resolution, an authorization check, and an UPDATE query. Any could be slow.
  3. Check if the `issue_comments` table has grown very large — ensure indexes on `id` and the `issue_id` foreign key are present.
  4. Check connection pool saturation: high inflight gauge + high latency suggests pool exhaustion.
  5. Check overall database load and disk I/O. Heavy write activity from other features (e.g., bulk workflow runs, workspace provisioning) may cause contention.
  6. If localized to a single repo, check if that repo has an unusually large number of comments or issues.

#### Alert 3: `IssueCommentEditForbiddenSpike`
- **Condition**: `rate(codeplane_issue_comment_edit_total{status="forbidden"}[15m]) > 5 * avg_over_time(rate(codeplane_issue_comment_edit_total{status="forbidden"}[15m])[1d:])` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if a specific user or agent is responsible for the spike (check `actor_id` in logs). May indicate a misconfigured bot trying to edit comments it doesn't own.
  2. Check if a recent permission change (e.g., collaborator demotion from admin to write) caused previously-allowed edits to start failing.
  3. Check if a client release incorrectly shows edit controls to unauthorized users, causing them to attempt edits that fail server-side.
  4. If the forbidden rate is high for a specific repository, check if the repository's collaboration settings changed recently.
  5. If caused by a single automation, contact the bot owner. No server action needed.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Invalid JSON body | 400 | Malformed request body rejected | Client fix |
| Invalid comment ID (non-numeric, zero, negative) | 400 | Request rejected at parsing | Client fix |
| Unauthenticated | 401 | No session or token | Re-authenticate |
| Non-author, non-admin with write access | 403 | Forbidden, cannot edit others' comments | User must be the author or a repo admin |
| Archived repository | 403 | Edits not allowed on archived repos | Unarchive the repository first |
| Comment not found | 404 | Comment ID does not exist | Verify comment ID |
| Comment in different repository | 404 | Comment exists but not in the specified repo | Use correct repo scope |
| Repository not found | 404 | Owner/repo does not exist | Verify repository path |
| Empty body after trim | 422 | Validation error | Provide non-empty body |
| Body exceeds 65,535 characters | 422 | Validation error | Shorten body |
| Rate limit exceeded | 429 | Too many requests | Back off and retry |
| DB update fails | 500 | Internal server error. Comment unchanged. | Retry; if persistent, check DB health |
| DB update returns null (concurrent delete) | 404 | Comment was deleted between auth check and update | Comment no longer exists — no recovery needed |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **Edit comment body**: PATCH with `{ "body": "Updated text" }` → 200, `body` matches, `updated_at` > `created_at`, all other fields unchanged.
- [ ] **Edit comment body with markdown**: PATCH with body containing headings, code fences, bold, italic, lists, links, and images → 200, body round-trips exactly.
- [ ] **Edit comment body with emoji and unicode**: PATCH with body containing 🎉, 漢字, → ≠ ∞, RTL characters → 200, exact round-trip.
- [ ] **Edit comment body at maximum valid length (65,535 chars)**: PATCH with exactly 65,535 character body → 200, full body stored and returned.
- [ ] **Edit comment body near boundary (65,534 chars)**: PATCH with 65,534 character body → 200, succeeds.
- [ ] **Edit comment body with leading/trailing whitespace**: PATCH with `"  hello world  "` → 200, returned body is `"hello world"` (trimmed).
- [ ] **Edit comment body idempotent**: PATCH same body twice → both return 200, second call updates `updated_at` to a newer timestamp.
- [ ] **Edit comment body to identical content**: PATCH with the same body the comment already has → 200, succeeds, `updated_at` refreshed.
- [ ] **Verify updated_at changes**: Record `updated_at` before edit, perform edit, verify `updated_at` is strictly newer.
- [ ] **Verify created_at is immutable**: Record `created_at` before edit, perform edit, verify `created_at` is unchanged.
- [ ] **Edit comment via PAT authentication**: PATCH using a PAT in the `Authorization` header instead of session cookie → 200.
- [ ] **Author edits own comment**: Authenticate as the comment author, PATCH → 200.
- [ ] **Repo owner edits another user's comment**: Create comment as user A, authenticate as repo owner, PATCH → 200.
- [ ] **Repo admin edits another user's comment**: Create comment as user A, authenticate as a repo admin collaborator, PATCH → 200.
- [ ] **Org owner edits comment in org repo**: Create comment as user A, authenticate as org owner, PATCH → 200.
- [ ] **Verify response shape**: Verify response contains all required fields: `id`, `issue_id`, `user_id`, `commenter`, `body`, `type`, `created_at`, `updated_at`.
- [ ] **Verify commenter field unchanged**: After editing, `commenter` still reflects the original author's username (not the editor's).
- [ ] **Edit comment on closed issue**: PATCH a comment on a closed issue → 200, editing on closed issues is permitted.
- [ ] **Edit comment on issue with many comments**: Create 100 comments, edit the 50th → 200, correct comment updated.

#### Validation & Error Path

- [ ] **Empty body string**: PATCH `{ "body": "" }` → 422 with `missing_field` error on `body`.
- [ ] **Whitespace-only body**: PATCH `{ "body": "   \n\t  " }` → 422 with `missing_field` error on `body`.
- [ ] **Missing body field**: PATCH `{}` → 422 with `missing_field` error on `body`.
- [ ] **Body exceeds maximum length (65,536 chars)**: PATCH with 65,536 character body → 422 with `too_long` error on `body`.
- [ ] **Body far exceeds maximum length (100,000 chars)**: PATCH with 100,000 character body → 422 with `too_long` error on `body`.
- [ ] **Non-existent comment ID**: PATCH to comment ID 999999 → 404.
- [ ] **Comment ID zero**: PATCH to comment ID 0 → 400.
- [ ] **Negative comment ID**: PATCH to comment ID -1 → 400.
- [ ] **Non-integer comment ID**: PATCH to comment ID `abc` → 400.
- [ ] **Comment in different repository**: Create a comment in repo A, attempt PATCH using repo B's owner/repo path → 404.
- [ ] **Non-existent repository**: PATCH to `nonexistent-owner/nonexistent-repo/issues/comments/1` → 404.
- [ ] **Unauthenticated request**: PATCH without any auth credentials → 401.
- [ ] **Read-only user**: Authenticate as a user with only read access to the repo, PATCH → 403.
- [ ] **Write collaborator editing another user's comment**: Authenticate as a write collaborator who is NOT the comment author and NOT an admin → 403.
- [ ] **Private repo, no access**: Authenticate as a user with no access to a private repo, PATCH → 404 (not 403, to avoid leaking repo existence).
- [ ] **Archived repository**: PATCH a comment in an archived repository → 403.
- [ ] **Invalid JSON body**: PATCH with malformed JSON → 400.
- [ ] **Wrong content type**: PATCH with `Content-Type: text/plain` → 415 or 400.

#### Concurrency & Edge Cases

- [ ] **Concurrent edits to same comment**: Two simultaneous PATCHes with different bodies → both return 200, last write wins, final body is one of the two.
- [ ] **Edit after concurrent delete**: Delete comment while an edit is in-flight → edit returns 404.
- [ ] **Edit comment immediately after creation**: Create a comment and immediately PATCH it in the same test → 200, body updated.
- [ ] **Rapid sequential edits**: PATCH the same comment 10 times in quick succession → all return 200, final body and `updated_at` reflect the last edit.

### CLI Integration Tests

- [ ] **`codeplane issue comment-edit <id> --body <text> --repo OWNER/REPO`**: Edit a comment via CLI. Verify default output contains "Updated comment".
- [ ] **`codeplane issue comment-edit <id> --body <text> --repo OWNER/REPO --json`**: Edit a comment with JSON output. Verify returned JSON has `id`, `body`, `commenter`, `type`, `created_at`, `updated_at`, and `updated_at` > `created_at`.
- [ ] **CLI error: empty body**: Run `codeplane issue comment-edit <id> --body "" --repo OWNER/REPO`. Verify CLI outputs a validation error message.
- [ ] **CLI error: non-existent comment**: Run `codeplane issue comment-edit 999999 --body "test" --repo OWNER/REPO`. Verify CLI outputs a not-found error.
- [ ] **CLI error: unauthenticated**: Run without prior `auth login`. Verify CLI outputs an authentication error.
- [ ] **CLI error: permission denied (non-author)**: Run as a write collaborator editing another user's comment. Verify CLI outputs a permission error.
- [ ] **CLI: body with special characters**: Run with body containing quotes, newlines (in shell quoting), and backslashes. Verify exact round-trip in `--json` output.
- [ ] **CLI: body from stdin**: Run `echo "updated body" | codeplane issue comment-edit <id> --body - --repo OWNER/REPO --json`. Verify body updated.
- [ ] **CLI: human-friendly output**: Run without `--json`. Verify output contains "Updated comment" and the comment ID.

### E2E Playwright Tests (Web UI)

- [ ] **Edit button visible for own comment**: Log in, navigate to issue detail, verify "Edit" control is visible on own comments.
- [ ] **Edit button hidden for read-only user**: Log in as read-only user, navigate to issue detail, verify no edit controls appear on any comments.
- [ ] **Edit button visible for admin on others' comments**: Log in as repo admin, verify edit control appears on comments authored by other users.
- [ ] **Enter edit mode**: Click "Edit" on own comment, verify textarea appears pre-populated with current body, Save/Cancel buttons visible, rendered markdown hidden.
- [ ] **Save edited comment**: Enter edit mode, modify body, click "Save", verify rendered markdown updates, "(edited)" indicator appears.
- [ ] **Cancel edit with changes shows confirmation**: Enter edit mode, modify body, click "Cancel", verify confirmation dialog appears.
- [ ] **Cancel edit without changes — no confirmation**: Enter edit mode, click "Cancel" immediately without modifying body, verify form closes without confirmation.
- [ ] **Confirm cancel discards changes**: Enter edit mode, modify body, click "Cancel", confirm discard, verify original body is restored.
- [ ] **Save button disabled when body is empty**: Enter edit mode, clear the textarea, verify Save button is disabled.
- [ ] **Loading state during save**: Mock slow API response, enter edit mode, modify body, click "Save", verify spinner appears on Save button and textarea becomes read-only.
- [ ] **Error toast on server failure**: Mock a 500 response, attempt to save, verify error toast appears and textarea content is preserved.
- [ ] **Edited indicator after save**: After successful edit, verify "(edited)" text appears next to timestamp.
- [ ] **Edited indicator tooltip**: Hover over "(edited)" text, verify tooltip shows the full `updated_at` timestamp.
- [ ] **Markdown preview in edit mode**: Enter edit mode, switch to Preview tab, verify markdown is rendered.
- [ ] **Optimistic update revert on error**: Mock server error, save edit, verify UI briefly shows updated body then reverts to original.
- [ ] **Edit comment on closed issue**: Navigate to a closed issue, verify edit controls are present and functional on own comments.
- [ ] **Write collaborator cannot edit others' comments**: Log in as write collaborator (non-admin), verify no edit control on comments by other users.

### TUI E2E Tests

- [ ] **TUI edit activates on `e`**: Navigate to issue detail, focus own comment, press `e` → edit textarea appears with pre-populated body.
- [ ] **TUI edit not available on others' comments (non-admin)**: As write collaborator, focus another user's comment, press `e` → no edit mode activated (or error shown).
- [ ] **TUI edit save with `Ctrl+S`**: Enter edit mode, modify body, press `Ctrl+S` → form closes, comment body updated, "(edited)" indicator visible.
- [ ] **TUI edit cancel with `Esc` (no changes)**: Enter edit mode, press `Esc` immediately → form closes, no confirmation.
- [ ] **TUI edit cancel with `Esc` (with changes)**: Enter edit mode, modify body, press `Esc` → discard confirmation appears.
- [ ] **TUI edit shows loading state**: Submit edit, verify `⏳` pending indicator appears briefly.
- [ ] **TUI edit shows error inline**: Trigger a server error, verify error message appears and content is preserved.
- [ ] **TUI edit empty body rejected**: Clear textarea, press `Ctrl+S` → validation error shown, form remains open.

### Webhook & Side Effect Integration Tests

- [ ] **Webhook delivery on comment edit**: Create a webhook subscribing to `issue_comment` events. Edit a comment. Verify a webhook delivery is recorded with action `"edited"`, the updated comment body, issue number, and editor username.
- [ ] **Webhook payload includes previous body**: Verify the webhook payload for the `edited` action includes `changes.body.from` with the previous body text.
- [ ] **Workflow trigger on issue comment edited**: Define a workflow with an `issue_comment.edited` trigger. Edit a comment. Verify a workflow run is created.
- [ ] **No notification on self-edit**: Edit own comment. Verify no notification is created for the editor.

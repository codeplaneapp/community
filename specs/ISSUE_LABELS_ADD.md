# ISSUE_LABELS_ADD

Specification for ISSUE_LABELS_ADD.

## High-Level User POV

As a repository collaborator, I want to add labels to an issue so that I can categorize, filter, and organize issues by topic, priority, or type. I should be able to add one or more labels to an issue from the web UI, CLI, or TUI, and the labels should appear immediately on the issue detail view. Labels help teams triage work, filter issue lists, and visually distinguish issue categories.

## Acceptance Criteria

1. Users can add one or more existing labels to an issue via POST /api/v1/repos/:owner/:repo/issues/:issue_number/labels with a JSON body containing label IDs.
2. The endpoint returns the complete list of labels currently on the issue after the addition.
3. Adding a label that is already on the issue is idempotent and does not produce an error or duplicate.
4. Adding a non-existent label ID returns a 404 or appropriate error.
5. The CLI supports `codeplane issue label add <issue_number> <label_names_or_ids>` to add labels.
6. The TUI issue detail screen reflects added labels immediately after mutation.
7. The web UI issue detail view allows adding labels via a label picker dropdown and reflects changes without full page reload.
8. A timeline/activity event is recorded when labels are added to an issue.
9. Webhook events are fired for label addition if webhooks are configured on the repository.
10. Notifications are generated for issue subscribers when labels change.

## Design

## API Layer
- **Endpoint**: `POST /api/v1/repos/:owner/:repo/issues/:issue_number/labels`
- **Request body**: `{ "labels": [<label_id>, ...] }` — array of integer label IDs to add.
- **Response**: `200 OK` with JSON array of all labels currently on the issue (each label object includes `id`, `name`, `color`, `description`, `is_archived`).
- **Route handler** (in `apps/server/src/routes/issues.ts` or `labels.ts`): validates repo and issue existence, delegates to `IssueService.addLabels()` in `packages/sdk/src/services/issue.ts`.

## Service Layer
- `IssueService.addLabels(repoId, issueNumber, labelIds)`: 
  1. Validates all label IDs belong to the repository.
  2. Inserts into `issue_labels` join table, using `ON CONFLICT DO NOTHING` for idempotency.
  3. Creates a timeline event of type `label` recording which labels were added and by whom.
  4. Emits a webhook event `issues.labeled` with issue and label payload.
  5. Creates notifications for issue subscribers.
  6. Returns the full current label set for the issue.

## Database
- **Join table**: `issue_labels` with columns `(issue_id, label_id)` and a unique constraint on the pair.
- **Timeline table**: `issue_timeline` entry with `action = 'label'`, `metadata = { added: [...label_ids] }`.

## Web UI
- Issue detail page (`apps/ui/src/routes/repo/issues/[number].tsx`) includes a label picker component.
- The picker fetches available labels via `GET /api/v1/repos/:owner/:repo/labels` and shows checkboxes.
- On selection, fires the POST endpoint above and invalidates the issue detail query to refresh labels.
- Labels render as colored badges in the issue sidebar.

## CLI
- Command: `codeplane issue label add <number> <label1> [label2...]`
- Resolves label names to IDs via `GET /api/v1/repos/:owner/:repo/labels`, then calls the POST endpoint.
- Outputs the resulting label list in table or JSON format depending on `--json` flag.

## TUI
- Issue detail screen shows labels section.
- Keybinding (e.g., `l`) opens a label picker overlay.
- Selection triggers the same API call and refreshes the issue detail view.

## Permissions & Security

1. **Authentication required**: The endpoint requires a valid session cookie or PAT token. Unauthenticated requests receive 401.
2. **Repository access**: The user must have at least `write` access to the repository. Read-only collaborators and anonymous users cannot modify labels. Returns 403 if insufficient permissions.
3. **Repository membership**: Organization-owned repositories respect team permission levels — only members of teams with `write` or `admin` access can add labels.
4. **Deploy keys**: Deploy keys with write access can add labels via API (relevant for automation).
5. **Issue lock**: If the issue is locked, only users with `admin` repository access can modify labels. Other write-access users receive a 403 with a message indicating the issue is locked.
6. **Archived repository**: If the repository is archived, all mutations including label addition are rejected with 403.

## Telemetry & Product Analytics

1. **API request metrics**: Standard HTTP request duration, status code, and path metrics via the server middleware (request ID, structured logging).
2. **Event tracking**: `issue.labeled` event emitted through the SSE manager for real-time subscribers.
3. **Webhook delivery**: `issues` webhook event with action `labeled` dispatched to all configured repository webhooks, with delivery status tracked in webhook_deliveries table.
4. **Audit trail**: The issue timeline entry serves as an audit record of who added which labels and when.
5. **Rate limiting**: Label addition requests are subject to the global rate limiter configured in the middleware stack.

## Observability

1. **Structured logging**: The route handler logs label addition with `repo_id`, `issue_number`, `label_ids`, `user_id`, and request ID at info level.
2. **Error logging**: Failed label additions (invalid label IDs, permission denied, database errors) are logged at warn/error level with full context.
3. **Health endpoint**: The existing `/api/v1/health` endpoint covers general API availability; label operations rely on database health.
4. **SSE event stream**: Label changes are observable via the notification SSE stream for subscribed users.
5. **Webhook delivery logs**: Failed webhook deliveries for label events are tracked in the webhook_deliveries table with error details, enabling admin inspection via the webhook deliveries API.

## Verification

1. **Unit tests**: `IssueService.addLabels()` tested with:
   - Adding a single label to an issue with no existing labels.
   - Adding multiple labels in one request.
   - Idempotent behavior: adding an already-present label does not duplicate or error.
   - Error case: adding a label ID that doesn't exist in the repository returns appropriate error.
   - Error case: adding labels to a non-existent issue returns 404.
   - Timeline event is created with correct metadata.
   - Webhook event is emitted with correct payload.
2. **API integration tests**: HTTP-level tests against the route:
   - `POST /api/v1/repos/:owner/:repo/issues/:number/labels` with valid labels returns 200 and full label list.
   - Unauthenticated request returns 401.
   - Unauthorized user (read-only) returns 403.
   - Locked issue returns 403 for non-admin users.
   - Archived repository returns 403.
   - Invalid label IDs return 404.
3. **CLI tests**: `codeplane issue label add` command:
   - Resolves label names correctly and calls the API.
   - Outputs results in table format by default and JSON with `--json`.
   - Handles errors gracefully with user-friendly messages.
4. **E2E tests**: Full flow test:
   - Create a repository, create labels, create an issue, add labels via API, verify labels appear on issue detail GET.
   - Verify webhook delivery is recorded if webhook is configured.
   - Verify notification is created for issue subscriber.
5. **TUI/UI smoke tests**: Verify the label picker renders available labels and that selecting labels triggers the correct API call (component-level tests where applicable).

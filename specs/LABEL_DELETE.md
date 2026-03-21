# LABEL_DELETE

Specification for LABEL_DELETE.

## High-Level User POV

When a repository's label taxonomy evolves, teams need the ability to remove labels that are no longer relevant. A label may have been created during an early triage phase that no longer applies, may have been superseded by a better-named replacement, or may simply be a mistake. The Label Delete feature lets a user with write access permanently remove a label definition from a repository.

Deleting a label is a repository-level action. A user navigates to their repository's label management area — through the web settings page, the CLI, or the API — identifies the label they want to remove, and confirms deletion. Once deleted, the label is immediately and permanently removed from the repository. It will no longer appear in the label list, will no longer be available for selection in issue creation or editing flows, and will be automatically disassociated from any issues that previously carried it. The label's colored badge disappears from all issue list views, issue detail sidebars, and filtered search results.

The value of label deletion is housekeeping: a clean, current set of labels makes triage faster, reduces confusion for new contributors, and keeps automation (agents, workflow filters, search queries) operating against a relevant taxonomy rather than a sprawling collection of outdated tags. Because deletion is permanent and affects every issue that uses the label, the product should make the consequences clear before the action is confirmed, and the action should be limited to users with write access to the repository.

## Acceptance Criteria

- A user with write access to a repository can delete a label by its numeric ID.
- The label is permanently removed from the repository upon successful deletion.
- All `issue_labels` associations referencing the deleted label are removed as part of the delete operation, ensuring no orphaned junction rows remain.
- After deletion, the label no longer appears in the repository's label list (`GET /api/repos/:owner/:repo/labels`).
- After deletion, the label no longer appears on any issue that previously carried it.
- After deletion, the label is no longer available in the issue label picker in the web UI, TUI, or editor integrations.
- The API endpoint is `DELETE /api/repos/:owner/:repo/labels/:id`.
- On successful deletion, the response status code is `204 No Content` with an empty body.
- Deleting a label that does not exist in the target repository returns `404 Not Found` with message `"label not found"`.
- Deleting a label with an invalid (non-numeric or non-positive) ID returns `400 Bad Request` with message `"invalid label id"`.
- Unauthenticated requests are rejected with `401 Unauthorized` and message `"authentication required"`.
- Authenticated users without write access to the repository are rejected with `403 Forbidden` and message `"permission denied"`.
- Requests targeting a non-existent repository return `404 Not Found` with message `"repository not found"`.
- Requests with an empty or whitespace-only `owner` path parameter return `400 Bad Request` with message `"owner is required"`.
- Requests with an empty or whitespace-only `repo` path parameter return `400 Bad Request` with message `"repository name is required"`.
- The `owner` and `repo` path parameters are resolved case-insensitively.
- Deleting the same label twice returns `404 Not Found` on the second attempt (the operation is not silently idempotent — the label must exist at the time of deletion).
- If a label is currently attached to 0 issues, deletion still succeeds with `204`.
- If a label is currently attached to many issues (e.g., 1000+), deletion still succeeds and all associations are cleaned up.
- The CLI `label delete` command accepts a positional `id` argument and an optional `--repo OWNER/REPO` option.
- The CLI returns a structured JSON confirmation `{ "status": "deleted", "id": <id> }` on success.
- The web UI label management page removes the label row immediately upon successful deletion, without requiring a full page reload.
- The web UI displays a confirmation dialog before executing the deletion, warning the user that the label will be removed from all issues.
- **Definition of Done**: The feature is complete when the API endpoint, CLI command, web UI delete flow, and all acceptance criteria are covered by passing integration/E2E tests, and label deletion properly cascades to remove issue-label associations.

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/labels/:id`

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `owner` | string | Repository owner username or organization name. Case-insensitive. |
| `repo` | string | Repository name. Case-insensitive. |
| `id` | integer | Numeric label ID. Must be a valid positive integer. |

**Request Headers:**
- `Authorization: Bearer <PAT>` or session cookie (required)

**Request Body:** None. Any request body is ignored.

**Success Response:** `204 No Content` — empty body.

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| 400 | Invalid label ID (non-numeric, zero, negative) | `{ "message": "invalid label id" }` |
| 400 | Empty owner parameter | `{ "message": "owner is required" }` |
| 400 | Empty repo parameter | `{ "message": "repository name is required" }` |
| 401 | No authentication | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "permission denied" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Label not found | `{ "message": "label not found" }` |
| 500 | Unexpected server error | `{ "message": "failed to delete label" }` |

### SDK Shape

The `LabelService` class from `@codeplane/sdk` exposes:

```typescript
deleteLabel(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  id: number,
): Promise<void>
```

Execution flow:
1. Validate that `actor` is authenticated (throw 401 if null).
2. Resolve the repository by `owner` and `repo` (throw 404 if not found).
3. Verify the actor has write access (throw 403 if denied).
4. Look up the label by `(repository_id, id)` (throw 404 if not found).
5. Delete all `issue_labels` rows referencing this label ID.
6. Delete the label row from the `labels` table.
7. Return void.

### CLI Command

**Command:** `codeplane label delete <id> [options]`

**Arguments:**
- `<id>` — The numeric label ID (positional, required). Coerced to a number.

**Options:**
- `--repo <OWNER/REPO>` — Target repository. If omitted, resolved from the current working directory's jj/git context.

**Output:** JSON object `{ "status": "deleted", "id": <id> }` on success. Error message on failure.

**Exit codes:** 0 on success, non-zero on error.

**Examples:**
```bash
# Delete label with ID 42
codeplane label delete 42 --repo myorg/myproject

# Delete label using repo from working directory context
codeplane label delete 7

# Pipe to jq for confirmation
codeplane label delete 42 --repo myorg/myproject | jq .status
```

### Web UI Design

Label deletion in the web UI is accessible from the repository's label management settings page at `/:owner/:repo/settings/labels`.

**Delete trigger:** Each label row in the label list includes a delete button (trash icon or "Delete" text button), visible only to users with write access.

**Confirmation dialog:** Clicking the delete button opens a confirmation dialog that reads:

> **Delete label "{label_name}"?**
>
> This label will be permanently removed from this repository and detached from all issues that currently use it. This action cannot be undone.
>
> [Cancel] [Delete]

The "Delete" button is styled as a destructive action (red). The "Cancel" button is the default focus.

**On success:** The label row is removed from the list with a brief fade-out animation. A success toast reads: "Label deleted." The total label count updates immediately.

**On error:** A toast notification displays the error message. The label row remains in the list. Common error toasts:
- "Label not found" — if the label was concurrently deleted by another user.
- "Permission denied" — if the user's access was revoked between page load and delete action.

**Optimistic UI:** The web UI should not use optimistic deletion. The label row should remain visible until the server confirms deletion with a 204, because deletion is destructive and irreversible.

### TUI UI

The TUI does not currently expose a dedicated label deletion screen. Label deletion is available through the CLI (`codeplane label delete`). If a label deletion flow is added to the TUI in the future, it should present a confirmation prompt before executing the delete and display a success/error message afterward.

### Documentation

End-user documentation should cover:

- **How-to: Delete a label via CLI** — Show `codeplane label delete <id>` usage with examples, including how to find the label ID using `codeplane label list`.
- **How-to: Delete a label via API** — Show the `DELETE /api/repos/:owner/:repo/labels/:id` endpoint with a curl example.
- **How-to: Delete a label via web UI** — Step-by-step walkthrough of navigating to label settings, clicking delete, and confirming the action.
- **Reference: Label API** — Full endpoint reference for label delete, including path parameters, response codes, and all error conditions.
- **Reference: CLI label commands** — Argument/option table for `label delete`.
- **Concept: Label lifecycle** — Explain what happens when a label is deleted (removed from all issues, permanent, not recoverable).

## Permissions & Security

### Authorization Matrix

| Role | Can Delete Labels? |
|---|---|
| Repository Owner | ✅ Yes |
| Organization Owner (for org repo) | ✅ Yes |
| Admin Collaborator | ✅ Yes |
| Write Collaborator | ✅ Yes |
| Read Collaborator | ❌ No (403) |
| Authenticated, no repo access | ❌ No (403) |
| Unauthenticated | ❌ No (401) |

### Permission Resolution Order

1. If the actor is not authenticated, return 401.
2. If the actor is the repository owner (direct user match), allow.
3. If the repository is org-owned and the actor is the org owner, allow.
4. Resolve the highest permission from team permissions and collaborator permissions.
5. If the resolved permission is `write` or `admin`, allow.
6. Otherwise, return 403.

### Rate Limiting

- Label deletion is subject to the server's global rate limiting middleware applied to all mutation endpoints.
- A per-user burst limit of **30 label deletion requests per minute per repository** is recommended to prevent automated mass-deletion abuse.
- No additional per-endpoint rate limiting is required beyond the platform default.

### Data Privacy

- Label deletion removes repository metadata (name, color, description). No PII is directly involved.
- The deleted label's name and metadata are not retained after deletion. There is no soft-delete or audit trail beyond structured server logs.
- Private repository label deletion events are not exposed to unauthorized viewers.
- The label ID in the API path does not leak information about other repositories' labels, since labels are scoped per-repository and resolved by `(repository_id, id)`.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `LabelDeleted` | Successful label deletion | `repository_id`, `label_id`, `label_name`, `label_color`, `actor_id`, `issues_affected_count`, `client` ("api" / "cli" / "web" / "tui"), `timestamp` |

### Event Properties Detail

- `repository_id` (number): Internal ID of the repository.
- `label_id` (number): ID of the deleted label.
- `label_name` (string): Name of the deleted label (captured before deletion for analytics).
- `label_color` (string): Color of the deleted label.
- `actor_id` (number): ID of the user who performed the deletion.
- `issues_affected_count` (number): Number of issues that had this label attached at the time of deletion.
- `client` (string): Client surface that initiated the deletion.
- `timestamp` (string): ISO 8601 timestamp of the event.

### Funnel Metrics and Success Indicators

- **Label deletion rate**: Number of labels deleted per week, measured globally and per repository. A high rate may indicate churn in label taxonomies or cleanup campaigns.
- **Label lifecycle duration**: Distribution of time between label creation and deletion. Very short lifetimes (minutes) may indicate accidental creation or experimentation. Longer lifetimes indicate intentional cleanup.
- **Issues affected per deletion**: Distribution of `issues_affected_count`. If many deletions affect 0 issues, labels are being cleaned up proactively. If deletions frequently affect many issues, it may indicate disruptive taxonomy changes.
- **Label deletion error rate**: Ratio of failed deletion attempts to successful ones, broken down by error type (not found, permission denied, server error).
- **Delete-then-recreate pattern**: Count of cases where a label is deleted and a label with the same name is recreated within 1 hour. This suggests rename-by-delete-and-create behavior, which may indicate a need for better rename UX.

## Observability

### Logging Requirements

| Event | Log Level | Structured Fields |
|---|---|---|
| Label deleted successfully | `info` | `event: "label.deleted"`, `repository_id`, `label_id`, `label_name`, `actor_id`, `issues_affected_count`, `duration_ms` |
| Label delete failed — not found | `info` | `event: "label.delete_failed"`, `reason: "not_found"`, `label_id`, `repository_id`, `actor_id` |
| Label delete failed — permission denied | `warn` | `event: "label.delete_failed"`, `reason: "forbidden"`, `repository_id`, `actor_id` |
| Label delete failed — unauthenticated | `info` | `event: "label.delete_failed"`, `reason: "unauthenticated"` |
| Label delete failed — invalid ID | `info` | `event: "label.delete_failed"`, `reason: "bad_request"`, `repository_id`, `raw_id` |
| Label delete failed — repository not found | `info` | `event: "label.delete_failed"`, `reason: "repo_not_found"`, `owner`, `repo` |
| Label delete failed — internal error | `error` | `event: "label.delete_failed"`, `reason: "internal"`, `repository_id`, `label_id`, `actor_id`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_label_deletes_total` | Counter | `status` (success / error), `error_type` (not_found / forbidden / unauthenticated / bad_request / internal) | Total label deletion attempts |
| `codeplane_label_delete_duration_seconds` | Histogram | — | Time taken to process a label deletion request end-to-end. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 |
| `codeplane_label_delete_issues_affected` | Histogram | — | Number of issues affected per label deletion. Buckets: 0, 1, 5, 10, 25, 50, 100, 500, 1000 |
| `codeplane_labels_per_repo` | Gauge | `repository_id` | Current number of labels in a repository (decremented on delete) |

### Alerts

#### Alert: High Label Delete Internal Error Rate

**Condition:** `rate(codeplane_label_deletes_total{status="error", error_type="internal"}[5m]) > 0.1`

**Severity:** Warning

**Runbook:**
1. Check server logs for `event: "label.delete_failed"` with `reason: "internal"` to identify the root cause.
2. Look for database connection issues — the delete operation requires a read (existence check) followed by a delete. Check `pg_stat_activity` for connection pool exhaustion.
3. Check if the `labels` table or `issue_labels` table has any locking issues (e.g., long-running transactions holding row locks).
4. Verify the `issue_labels` cascade delete is not failing due to foreign key constraint violations or missing indexes.
5. If the error is isolated to a specific repository, check that repository's label/issue state for data integrity issues.
6. If the error is a transient DB issue, monitor for auto-recovery. If persistent, check database health and restart the server if needed.

#### Alert: Label Delete Latency Spike

**Condition:** `histogram_quantile(0.99, rate(codeplane_label_delete_duration_seconds_bucket[5m])) > 2`

**Severity:** Warning

**Runbook:**
1. Check if the latency spike correlates with deletions of labels attached to many issues. Cross-reference with `codeplane_label_delete_issues_affected` histogram.
2. Run `EXPLAIN ANALYZE` on the `DELETE FROM issue_labels WHERE label_id = $1` query to check for missing indexes.
3. Run `EXPLAIN ANALYZE` on the `DELETE FROM labels WHERE repository_id = $1 AND id = $2` query.
4. Check for table bloat or vacuum backlog on `labels` and `issue_labels` tables.
5. Review server resource utilization (CPU, memory, DB connections).
6. If isolated to deletions affecting many issues, consider batching the `issue_labels` cleanup or adding an index on `issue_labels(label_id)`.

#### Alert: Unusual Label Deletion Volume

**Condition:** `rate(codeplane_label_deletes_total{status="success"}[5m]) > 5`

**Severity:** Info

**Runbook:**
1. This may indicate a user performing a bulk label cleanup (legitimate) or automated abuse.
2. Check structured logs for the `actor_id` performing the deletions.
3. If concentrated on one repository by one user, it's likely a cleanup — no action needed.
4. If distributed or from an unexpected source, investigate whether rate limiting needs tightening.
5. If a single actor is mass-deleting labels across multiple repositories, check for compromised credentials.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Label does not exist | 404 | "label not found" | User verifies the label ID exists (via `label list`) |
| Invalid label ID (non-numeric) | 400 | "invalid label id" | User provides a valid numeric ID |
| Invalid label ID (zero or negative) | 400 | "invalid label id" | User provides a positive integer |
| Not authenticated | 401 | "authentication required" | User logs in or provides a valid PAT |
| No write access | 403 | "permission denied" | User requests write access from a repo admin |
| Repository not found | 404 | "repository not found" | User verifies the owner/repo path |
| Empty owner | 400 | "owner is required" | User provides a valid owner |
| Empty repo name | 400 | "repository name is required" | User provides a valid repo name |
| Database unreachable | 500 | "failed to delete label" | Ops team investigates DB connectivity |
| Concurrent deletion (race) | 404 | "label not found" | Second caller gets 404, which is the correct and expected outcome |
| Label attached to thousands of issues | 204 (slow) | N/A | Deletion succeeds but may take longer; monitor latency |

## Verification

### API Integration Tests

1. **Happy path: Delete a label** — Create a label, then DELETE `/api/repos/:owner/:repo/labels/:id`. Assert 204 status. Assert empty response body.

2. **Deleted label no longer in list** — Create a label, delete it, then GET `/api/repos/:owner/:repo/labels`. Assert the deleted label is absent from the list.

3. **Deleted label returns 404 on direct fetch** — Create a label, delete it, then GET `/api/repos/:owner/:repo/labels/:id`. Assert 404 with message "label not found".

4. **Double delete returns 404** — Create a label, delete it (assert 204), delete it again with the same ID. Assert 404 with message "label not found".

5. **Delete label with no issue associations** — Create a label that is not attached to any issue. Delete it. Assert 204.

6. **Delete label attached to one issue** — Create a label, create an issue, attach the label to the issue, then delete the label. Assert 204. Verify the issue's labels list no longer contains the deleted label.

7. **Delete label attached to multiple issues** — Create a label, create 5 issues, attach the label to all 5 issues. Delete the label. Assert 204. Verify all 5 issues no longer list the deleted label.

8. **Delete label attached to many issues (50+)** — Create a label, create 50 issues, attach the label to all 50. Delete the label. Assert 204. Verify none of the 50 issues list the deleted label.

9. **Delete does not affect other labels on the same issue** — Create labels "bug" and "enhancement", attach both to an issue. Delete "bug". Assert the issue still has "enhancement" attached.

10. **Delete does not affect labels in other repositories** — Create a label "bug" in repo A and repo B. Delete "bug" from repo A. Assert "bug" still exists in repo B.

11. **Invalid label ID: non-numeric** — DELETE `/api/repos/:owner/:repo/labels/abc`. Assert 400 with message "invalid label id".

12. **Invalid label ID: zero** — DELETE `/api/repos/:owner/:repo/labels/0`. Assert 400 with message "invalid label id".

13. **Invalid label ID: negative** — DELETE `/api/repos/:owner/:repo/labels/-1`. Assert 400 with message "invalid label id".

14. **Invalid label ID: floating point** — DELETE `/api/repos/:owner/:repo/labels/1.5`. Assert 400 with message "invalid label id".

15. **Label ID that does not exist** — DELETE with an ID that was never created (e.g., 999999). Assert 404 with message "label not found".

16. **Label ID belongs to a different repository** — Create a label in repo A (gets ID 1). Call DELETE on repo B with ID 1. Assert 404 with message "label not found" (label scoping is per-repository).

17. **Unauthenticated request** — DELETE without auth. Assert 401 with message "authentication required".

18. **Read-only collaborator** — DELETE as a user with only read access. Assert 403 with message "permission denied".

19. **Write collaborator** — DELETE as a user with write access. Assert 204.

20. **Admin collaborator** — DELETE as a user with admin access. Assert 204.

21. **Repository owner** — DELETE as the repository owner. Assert 204.

22. **Organization owner** — DELETE as the org owner for an org-owned repo. Assert 204.

23. **Authenticated user with no repo access** — DELETE as a user who has no relationship to the repository. Assert 403 with message "permission denied".

24. **Non-existent repository** — DELETE `/api/repos/nobody/nonexistent/labels/1`. Assert 404 with message "repository not found".

25. **Owner path parameter case-insensitivity** — Create repo as `Alice/MyRepo`. Delete label using path `alice/myrepo`. Assert 204.

26. **Empty owner parameter** — DELETE `/api/repos/%20/myrepo/labels/1`. Assert 400 with message "owner is required".

27. **Empty repo parameter** — DELETE `/api/repos/alice/%20/labels/1`. Assert 400 with message "repository name is required".

28. **Concurrent deletion race** — Start two DELETE requests for the same label concurrently. Assert one returns 204 and the other returns 404.

29. **Label with special characters in name can be deleted** — Create a label with name `"won't fix / duplicate"`, then delete it by ID. Assert 204.

30. **Label with Unicode name can be deleted** — Create a label with name `"🐛 バグ"`, then delete it by ID. Assert 204.

31. **Label with maximum valid name length (255 chars) can be deleted** — Create a label with a 255-character name, then delete it by ID. Assert 204.

32. **Delete label then create new label with same name** — Create label "bug", delete it, create label "bug" again. Assert the second creation returns 201 (the uniqueness constraint no longer conflicts).

33. **Label total count updates after deletion** — Create 5 labels, delete 1. List labels and verify the pagination total header shows 4.

34. **Verify issue-label junction cleanup via API** — Create a label, attach it to an issue, delete the label. Call `GET /api/repos/:owner/:repo/issues/:number/labels`. Assert the deleted label does not appear.

### CLI E2E Tests

35. **CLI: Delete label by ID** — Create a label via CLI, note the ID, then run `codeplane label delete <id> --repo OWNER/REPO`. Assert JSON output contains `{ "status": "deleted", "id": <id> }`.

36. **CLI: Delete non-existent label** — Run `codeplane label delete 999999 --repo OWNER/REPO`. Assert non-zero exit code and error output containing "not found".

37. **CLI: Deleted label absent from list** — Create a label, delete it via CLI, then run `codeplane label list --repo OWNER/REPO`. Assert the deleted label is absent from the output.

38. **CLI: Delete label without --repo (from repo context)** — In a directory with jj/git context pointing to a known repo, create a label, then run `codeplane label delete <id>` without `--repo`. Assert success.

39. **CLI: Delete with invalid ID** — Run `codeplane label delete abc --repo OWNER/REPO`. Assert non-zero exit code and error output.

40. **CLI: Delete then recreate same name** — Create label "test" via CLI, note the ID, delete it, then create "test" again. Assert the second creation succeeds.

### Playwright (Web UI) E2E Tests

41. **Web: Delete button visible for write-access users** — Navigate to `/:owner/:repo/settings/labels` as a write-access user. Assert each label row has a delete button.

42. **Web: Delete button hidden for read-only users** — Navigate to the labels page as a read-only collaborator. Assert no delete buttons are visible.

43. **Web: Confirmation dialog appears on click** — Click a label's delete button. Assert a confirmation dialog appears with the label name and a warning about issue detachment.

44. **Web: Cancel button dismisses dialog without deleting** — Open the delete confirmation dialog, click "Cancel". Assert the dialog closes and the label remains in the list.

45. **Web: Confirm deletion removes label from list** — Open the delete confirmation dialog, click "Delete". Assert the label row is removed from the list and a success toast appears.

46. **Web: Deleted label absent from issue label picker** — Delete a label via the settings page. Navigate to an issue, open the label picker. Assert the deleted label is no longer listed.

47. **Web: Error toast on concurrent deletion** — Delete a label via API while viewing the labels page. Then attempt to delete the same label via the UI. Assert an error toast appears (label not found).

48. **Web: Label count updates after deletion** — If the page displays a total label count, verify it decrements after a successful deletion.

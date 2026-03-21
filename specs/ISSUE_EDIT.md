# ISSUE_EDIT

Specification for ISSUE_EDIT.

## High-Level User POV

When a user is working on a Codeplane repository and needs to update an existing issue, the Issue Edit feature lets them modify any combination of an issue's title, body, state, labels, assignees, and milestone in a single operation. The edit is a partial update — users only need to supply the fields they want to change, and everything else remains untouched.

From the web UI, a user navigates to an issue's detail page and clicks an edit control to modify the title or body inline, or uses sidebar controls to adjust labels, assignees, and milestones. The experience is designed so that quick metadata changes (adding a label, reassigning) feel instant, while heavier edits (rewriting the title or body) give the user a focused editing surface with markdown support and a clear save/cancel flow. If the user navigates away or cancels with unsaved changes, they are prompted to confirm they want to discard their work.

From the CLI, a user runs `codeplane issue edit <number>` with flags like `--title`, `--body`, `--assignee`, or `--label` to make surgical updates without leaving the terminal. The CLI returns structured JSON output by default when piped, and a human-friendly summary when used interactively.

From the TUI, a user presses `e` on a focused issue (either from the issue list or the issue detail view) to open a full-screen edit form. The form is pre-populated with the issue's current values and supports keyboard-driven navigation between fields, multi-select overlays for labels and assignees, and `Ctrl+S` to save.

The value of Issue Edit is that it keeps issue metadata accurate and up-to-date as work progresses, without forcing users to close and recreate issues or leave their preferred client surface. It is the primary mechanism for issue triage, re-prioritization, and collaborative refinement.

## Acceptance Criteria

- **Partial updates**: A PATCH request containing only a subset of fields (e.g., only `title`) must update only those fields and leave all other fields unchanged.
- **Empty payload**: A PATCH request with an empty JSON body `{}` must return the issue unchanged (200 OK, no mutation). It must NOT error.
- **Title constraints**:
  - Title is optional in the edit payload, but if provided it must not be empty or whitespace-only after trimming.
  - Title maximum length: 255 characters. Titles exceeding this must be rejected with a validation error.
  - Title must accept Unicode characters, including emoji, CJK, and RTL scripts.
- **Body constraints**:
  - Body is optional. If provided, it may be an empty string (to clear the body).
  - Body maximum length: 262,144 characters (256 KiB). Bodies exceeding this must be rejected.
  - Body must accept full markdown content including code fences, images, and raw HTML.
- **State constraints**:
  - State must be one of `"open"` or `"closed"` (case-insensitive, normalized to lowercase).
  - Any other state value must be rejected with a validation error.
  - When transitioning from open → closed, `closed_at` must be set to the current timestamp.
  - When transitioning from closed → open, `closed_at` must be cleared to null.
  - When state does not change, `closed_at` must not be modified.
  - State transitions must update the repository's closed-issue counter atomically.
- **Assignees constraints**:
  - Assignees array, if provided, replaces all current assignees (not additive).
  - Each username must correspond to an existing user; invalid usernames must be rejected.
  - Usernames are case-insensitive (normalized to lowercase) and trimmed.
  - Duplicate usernames in the array must be silently deduplicated.
  - An empty assignees array `[]` must clear all assignees.
- **Labels constraints**:
  - Labels array, if provided, replaces all current labels (not additive).
  - Each label name must exist in the repository's label set; nonexistent labels must be rejected.
  - Label names are trimmed; duplicates are silently deduplicated.
  - An empty labels array `[]` must clear all labels.
- **Milestone constraints**:
  - If the `milestone` key is present in the JSON body with a numeric value, the issue must be associated with that milestone (validated against repository milestones).
  - If the `milestone` key is present with a `null` value, the milestone must be cleared.
  - If the `milestone` key is absent from the JSON body, the milestone must not change.
  - Invalid or nonexistent milestone IDs must be rejected.
- **Authentication**: The user must be authenticated. Unauthenticated requests must return 401.
- **Authorization**: The user must have write access to the repository. Read-only and anonymous users must receive 403.
- **Not Found**: Editing a nonexistent issue number or nonexistent repository must return 404.
- **Response**: A successful edit must return the full, updated issue object (including resolved assignees, labels, milestone, timestamps).
- **updated_at**: The `updated_at` timestamp must be set to the current time on every successful mutation.
- **Idempotency**: Sending the same edit payload twice in succession must produce the same result and not error.
- **Concurrent edits**: Two concurrent edits to different fields on the same issue must both succeed (last-write-wins on overlapping fields).
- **CLI parity**: The CLI `issue edit` command must support `--title`, `--body`, `--assignee`, `--label`, and `--repo` flags and produce structured JSON output with `--json`.
- **TUI parity**: The TUI edit form must pre-populate current values, support keyboard navigation, show loading/error states, and confirm discard of unsaved changes.
- **Web UI parity**: The web UI must allow editing title, body, labels, assignees, milestone, and state from the issue detail page.

## Design

### API Shape

**Endpoint**: `PATCH /api/repos/:owner/:repo/issues/:number`

**Request Headers**:
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: token <PAT>` or session cookie

**Request Body** (all fields optional):
```json
{
  "title": "Updated issue title",
  "body": "Updated markdown body",
  "state": "open" | "closed",
  "assignees": ["username1", "username2"],
  "labels": ["bug", "priority-high"],
  "milestone": 42 | null
}
```

**Response** (200 OK):
```json
{
  "id": 1,
  "number": 7,
  "title": "Updated issue title",
  "body": "Updated markdown body",
  "state": "open",
  "author": { "id": 1, "login": "alice" },
  "assignees": [{ "id": 2, "login": "username1" }, { "id": 3, "login": "username2" }],
  "labels": [{ "id": 1, "name": "bug", "color": "#d73a49", "description": "Something isn't working" }],
  "milestone_id": 42,
  "comment_count": 3,
  "closed_at": null,
  "created_at": "2026-03-20T10:00:00Z",
  "updated_at": "2026-03-22T14:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request` — Invalid JSON body, invalid issue number in URL
- `401 Unauthorized` — No authentication
- `403 Forbidden` — Authenticated but insufficient repository permissions
- `404 Not Found` — Repository or issue does not exist
- `422 Unprocessable Entity` — Validation failures (empty title, invalid state, unknown label/assignee/milestone)
- `429 Too Many Requests` — Rate limit exceeded

**Milestone disambiguation**: The server detects whether the `milestone` key is present in the parsed JSON (even if `null`) versus absent. Presence with `null` clears the milestone. Absence means no change.

### SDK Shape

The SDK exposes the following service method:

```typescript
updateIssue(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  number: number,
  req: UpdateIssueInput
): Promise<IssueResponse>
```

Where `UpdateIssueInput` is:
```typescript
interface UpdateIssueInput {
  title?: string;
  body?: string;
  state?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: IssueMilestonePatch;
}

interface IssueMilestonePatch {
  value: number | null;
}
```

The SDK also exposes data hooks for UI/TUI consumers:
- `useIssue(owner, repo, number)` — Fetches current issue for pre-population
- `useUpdateIssue(owner, repo, number)` — Returns `{ mutate, loading, error }` for submitting edits
- `useLabels(owner, repo)` — Available labels for the multi-select picker
- `useCollaborators(owner, repo)` — Available assignees for the multi-select picker
- `useMilestones(owner, repo)` — Open milestones for the single-select picker

### CLI Command

```
codeplane issue edit <number> [options]
```

**Arguments**:
- `<number>` — Issue number (required, positive integer)

**Options**:
- `--title <string>` — New issue title
- `--body <string>` — New issue body (use `-` for stdin)
- `--assignee <username>` — Set assignee (replaces existing; pass flag multiple times for multiple)
- `--label <name>` — Set label (replaces existing; pass flag multiple times for multiple)
- `--repo <OWNER/REPO>` — Target repository (defaults to current repo context)

**Output**:
- Interactive: Human-friendly summary, e.g., `✓ Updated issue #7 in owner/repo`
- `--json`: Full `IssueResponse` JSON object
- Supports `--json` field filtering (e.g., `--json title,state`)

**Error output**:
- Validation errors print the field and constraint that failed
- 404 prints `Issue #N not found in owner/repo`
- 403 prints `Permission denied: write access required`

### Web UI Design

The web issue detail page at `/:owner/:repo/issues/:number` provides the following editing surfaces:

**Title editing**: Click the title text to enter inline edit mode. The title becomes an editable text input. Press Enter or click a checkmark to save. Press Escape to cancel. The save button is disabled while the title is empty or whitespace-only.

**Body editing**: Click an "Edit" button/tab on the body section to switch from rendered markdown to a markdown textarea editor. The editor supports a preview toggle. Save and Cancel buttons appear below the editor. Unsaved changes trigger a confirmation dialog if the user navigates away.

**State toggle**: A button in the issue header or comment box area allows toggling between "Close issue" and "Reopen issue". The button label and color reflect the target state.

**Labels sidebar**: A sidebar widget shows current labels with a gear/edit icon. Clicking it opens a dropdown/popover with a searchable, multi-select list of all repository labels. Selecting/deselecting labels sends the PATCH immediately.

**Assignees sidebar**: Same pattern as labels — a sidebar widget with a popover for selecting from repository collaborators.

**Milestone sidebar**: A sidebar widget showing the current milestone (or "No milestone"). Clicking opens a single-select dropdown of open milestones, including a "Clear milestone" option.

**Loading states**: All mutation controls show a spinner or disabled state during the PATCH request. On error, an inline toast or banner appears with the error message.

**Optimistic updates**: Label, assignee, and milestone sidebar changes update the UI optimistically and revert on error.

### TUI Design

**Entry points**:
- Press `e` from the issue list screen (on the focused row)
- Press `e` from the issue detail screen
- Type `:edit issue` in the command palette

**Form layout** (full-screen overlay):
```
┌─ Edit Issue #7 ─────────────────────────────┐
│ Title:  [_____________________________]     │
│                                              │
│ Body:                                        │
│ ┌──────────────────────────────────────────┐ │
│ │ (multi-line markdown editor)             │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Labels:    [bug] [enhancement]  (Enter)      │
│ Assignees: [alice] [bob]        (Enter)      │
│ Milestone: v1.0                 (Enter)      │
│                                              │
│         [ Save (Ctrl+S) ]  [ Cancel (Esc) ]  │
└──────────────────────────────────────────────┘
```

**Keyboard navigation**: Tab / Shift+Tab to move between fields. Enter on Labels/Assignees/Milestone opens a multi-select or single-select overlay. Ctrl+S saves from any field. Esc cancels (with confirmation if dirty).

**Responsive breakpoints**:
- Small (80×24): Compact layout, truncated labels
- Medium (120×40): Full field labels, comfortable spacing
- Large (200×60+): Wide body editor, side-by-side metadata

**Error handling**: Errors display as a red banner at the top of the form. Form remains open and editable. Retry is available.

### Editor Integrations

**VS Code**: The issues tree view allows right-click → "Edit Issue" which opens a QuickPick flow for selecting which field to edit, then an input box for the new value. State toggle is available as a direct action icon on issue tree items.

**Neovim**: The `:CodeplaneIssueEdit <number>` command opens a split buffer pre-populated with the issue title on line 1 and body from line 3 onward. Writing the buffer (`:w`) sends the PATCH. Labels/assignees/milestone can be edited via `:CodeplaneIssueSetLabels`, `:CodeplaneIssueSetAssignees`, `:CodeplaneIssueSetMilestone` commands with Telescope pickers.

### Documentation

The following end-user documentation should be written:

- **Web UI guide**: "Editing Issues" section under the Issues chapter, covering inline title editing, body editing, sidebar metadata controls, and state toggling.
- **CLI reference**: `codeplane issue edit` man-page-style reference with examples for common edits (change title, add label, reassign, clear milestone).
- **TUI guide**: "Issue Edit Form" section showing the keyboard shortcuts table and walkthrough of the form flow.
- **API reference**: `PATCH /api/repos/:owner/:repo/issues/:number` endpoint documentation with request/response schemas, field semantics, error codes, and milestone disambiguation behavior.

## Permissions & Security

### Authorization Roles

| Role | Can Edit? | Notes |
|---|---|---|
| Repository Owner | ✅ | Full edit access |
| Organization Owner | ✅ | Full edit access to all org repos |
| Admin Collaborator | ✅ | Full edit access |
| Write Collaborator | ✅ | Can edit any issue in the repo |
| Read Collaborator | ❌ | 403 Forbidden |
| Anonymous | ❌ | 401 Unauthorized |

The server enforces authorization via `requireWriteAccess(repository, actor)` in the service layer. There is no issue-author-only restriction — any user with write access can edit any issue.

### Rate Limiting

- **Authenticated users**: 60 issue edit requests per minute per user per repository.
- **PAT-based requests**: Same limit as authenticated users, keyed by token owner.
- **Global burst**: The general API rate limiter (applied via middleware) provides a baseline. Issue edits should have a tighter per-resource limit to prevent bulk-mutation abuse.

### Data Privacy

- Issue titles and bodies may contain PII. The API must never log full request bodies at INFO level — only at DEBUG, and only in non-production environments.
- Assignee usernames are public profile data and are safe to include in responses and logs.
- The `updated_at` timestamp reveals edit timing, which is acceptable for collaboration transparency.
- Webhook payloads (when implemented) for issue edits must respect repository visibility — private repository webhook events must only be delivered to configured webhook URLs, never to public event streams.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `IssueEdited` | Successful PATCH returning 200 | `repository_id`, `issue_number`, `actor_id`, `fields_changed[]`, `client` (web/cli/tui/api), `state_transition` (null, "opened", "closed"), `labels_added_count`, `labels_removed_count`, `assignees_changed` (bool), `milestone_changed` (bool) |
| `IssueEditFailed` | PATCH returning 4xx/5xx | `repository_id`, `issue_number`, `actor_id`, `error_code`, `error_field`, `client` |
| `IssueEditFormOpened` | User opens the edit form (web/TUI) | `repository_id`, `issue_number`, `actor_id`, `entry_point` (detail_page, list_row, command_palette), `client` |
| `IssueEditFormAbandoned` | User cancels edit with unsaved changes | `repository_id`, `issue_number`, `actor_id`, `dirty_fields[]`, `client` |

### Funnel Metrics

- **Edit initiation rate**: % of issue detail views that result in an edit form open or edit API call.
- **Edit completion rate**: % of edit form opens that result in a successful save (measures form usability).
- **Edit abandonment rate**: % of edit form opens that are cancelled with unsaved changes (measures friction).
- **Fields-per-edit distribution**: Histogram of how many fields are changed per edit (indicates whether users batch changes or make incremental updates).
- **Time-to-edit**: p50/p95 duration from edit form open to successful save (measures editing efficiency).
- **Client distribution**: Breakdown of edits by client surface (web, CLI, TUI, API, editor) — measures adoption of each surface.

### Success Indicators

- Edit completion rate > 85% (form is not causing abandonment).
- p95 edit latency < 500ms (server-side).
- < 1% of edits result in validation errors (good client-side pre-validation).
- CLI and TUI account for > 20% of edits (multi-surface adoption).

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|---|---|---|---|
| Issue edit request received | DEBUG | `owner`, `repo`, `issue_number`, `actor_id`, `fields_present[]`, `request_id` | Never log body/title content at INFO+ |
| Issue edit succeeded | INFO | `owner`, `repo`, `issue_number`, `actor_id`, `fields_changed[]`, `state_transition`, `duration_ms`, `request_id` | Core operational log |
| Issue edit validation failed | WARN | `owner`, `repo`, `issue_number`, `actor_id`, `error_code`, `error_field`, `request_id` | Indicates client bug or user error |
| Issue edit auth failed | WARN | `owner`, `repo`, `issue_number`, `error_code`, `request_id` | Missing or insufficient auth |
| Issue edit internal error | ERROR | `owner`, `repo`, `issue_number`, `actor_id`, `error_message`, `stack`, `request_id` | DB failures, unexpected exceptions |
| Assignee resolution failed | WARN | `owner`, `repo`, `issue_number`, `username`, `request_id` | Invalid username provided |
| Label resolution failed | WARN | `owner`, `repo`, `issue_number`, `label_name`, `request_id` | Label not found in repo |
| Milestone resolution failed | WARN | `owner`, `repo`, `issue_number`, `milestone_id`, `request_id` | Milestone not found |
| State counter update | DEBUG | `owner`, `repo`, `direction` (increment/decrement), `request_id` | Closed-issue counter change |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_issue_edit_total` | Counter | `owner`, `repo`, `status` (success, validation_error, auth_error, not_found, internal_error) | Total issue edit attempts |
| `codeplane_issue_edit_duration_seconds` | Histogram | `owner`, `repo` | End-to-end edit latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_issue_edit_fields_changed` | Histogram | `owner`, `repo` | Number of fields changed per edit (buckets: 1, 2, 3, 4, 5, 6) |
| `codeplane_issue_state_transitions_total` | Counter | `owner`, `repo`, `from_state`, `to_state` | State transition count |

### Alerts

**Alert 1: High Issue Edit Error Rate**
- **Condition**: `rate(codeplane_issue_edit_total{status="internal_error"}[5m]) / rate(codeplane_issue_edit_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check `codeplane_issue_edit_total{status="internal_error"}` to confirm the alert is real and not a single spike.
  2. Query application logs for `level=ERROR` with `operation=issue_edit` in the last 15 minutes.
  3. Check database connectivity: run `SELECT 1` against the primary database. If the DB is down, escalate to the database on-call.
  4. Check if errors are concentrated on a single repository (check the `owner`/`repo` labels) — may indicate a corrupt issue or repository record.
  5. If errors are across all repos, check recent deployments for regressions. Roll back if a deploy happened in the last 30 minutes.
  6. If the issue is DB deadlocks, check `pg_stat_activity` for long-running transactions and consider killing them.

**Alert 2: Elevated Issue Edit Latency**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_edit_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is elevated globally or scoped to specific repositories.
  2. Check database query latency dashboards. Issue edits involve multiple queries (read, update, replace assignees, replace labels) — any one could be slow.
  3. Check if the labels or assignees tables have grown unusually large for the affected repository.
  4. Check if there is lock contention on the issues table (e.g., from bulk imports or migrations).
  5. If localized, check for missing indexes on `issues(repository_id, number)`.
  6. If global, check overall database load and consider connection pool exhaustion.

**Alert 3: Unusual Validation Error Spike**
- **Condition**: `rate(codeplane_issue_edit_total{status="validation_error"}[15m]) > 10 * avg_over_time(rate(codeplane_issue_edit_total{status="validation_error"}[15m])[1d:])`
- **Severity**: Warning
- **Runbook**:
  1. Check if a specific client version or user agent is responsible (may indicate a broken client release).
  2. Query logs for the specific validation `error_field` — is it title, state, labels, assignees, or milestone?
  3. If it's labels/assignees, check if a repository recently had labels or collaborators removed, causing existing client caches to reference stale data.
  4. If it's a single user, consider whether it's an automation or bot misconfiguration rather than a product bug.
  5. If correlated with a client release, file a bug against the relevant client (web/CLI/TUI).

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|---|---|---|---|
| Invalid JSON body | 400 | Malformed request body | Client fix |
| Invalid issue number | 400 | Non-numeric or negative number in URL | Client fix |
| Unauthenticated | 401 | Missing/expired session or token | Re-authenticate |
| Forbidden | 403 | User lacks write access | Request collaborator access |
| Issue not found | 404 | Issue or repo does not exist | Verify issue number and repo |
| Empty title | 422 | Title is blank after trimming | Provide non-empty title |
| Invalid state | 422 | State is not "open" or "closed" | Use valid state value |
| Unknown assignee | 422 | Username does not exist | Verify username spelling |
| Unknown label | 422 | Label not in repository | Create label first or check name |
| Unknown milestone | 422 | Milestone ID not in repository | Verify milestone exists and is open |
| Rate limited | 429 | Too many requests | Back off and retry after indicated period |
| Internal error | 500 | Database failure, unexpected exception | Retry; if persistent, check server health |

## Verification

### API Integration Tests

1. **Edit title only**: PATCH with `{ "title": "New title" }` → 200, title changed, all other fields unchanged.
2. **Edit body only**: PATCH with `{ "body": "New body" }` → 200, body changed, title/state/labels/assignees/milestone unchanged.
3. **Edit state to closed**: PATCH with `{ "state": "closed" }` → 200, state is "closed", `closed_at` is set, `updated_at` is refreshed.
4. **Edit state to open (reopen)**: Close issue first, then PATCH with `{ "state": "open" }` → 200, state is "open", `closed_at` is null.
5. **Edit state idempotent**: PATCH an already-open issue with `{ "state": "open" }` → 200, no error, `closed_at` remains null.
6. **Edit labels**: PATCH with `{ "labels": ["bug", "enhancement"] }` → 200, labels array matches exactly.
7. **Clear labels**: PATCH with `{ "labels": [] }` → 200, labels array is empty.
8. **Edit assignees**: PATCH with `{ "assignees": ["alice", "bob"] }` → 200, assignees match.
9. **Clear assignees**: PATCH with `{ "assignees": [] }` → 200, assignees array is empty.
10. **Set milestone**: PATCH with `{ "milestone": <valid_id> }` → 200, `milestone_id` is set.
11. **Clear milestone**: PATCH with `{ "milestone": null }` → 200, `milestone_id` is null.
12. **Milestone absent means no change**: PATCH with `{ "title": "x" }` (no milestone key) → 200, milestone unchanged from previous value.
13. **Edit multiple fields**: PATCH with title + body + state + labels + assignees + milestone → 200, all fields updated.
14. **Empty body payload**: PATCH with `{}` → 200, issue returned unchanged (no mutation).
15. **Empty title rejected**: PATCH with `{ "title": "" }` → 422 validation error.
16. **Whitespace-only title rejected**: PATCH with `{ "title": "   " }` → 422 validation error.
17. **Title at maximum length (255 chars)**: PATCH with a 255-character title → 200, title saved correctly.
18. **Title exceeding maximum length (256 chars)**: PATCH with a 256-character title → 422 validation error.
19. **Body at maximum length (262144 chars)**: PATCH with a 256 KiB body → 200, body saved correctly.
20. **Body exceeding maximum length (262145 chars)**: PATCH with a body > 256 KiB → 422 validation error.
21. **Body cleared to empty string**: PATCH with `{ "body": "" }` → 200, body is empty string.
22. **Invalid state value**: PATCH with `{ "state": "pending" }` → 422 validation error.
23. **State case insensitivity**: PATCH with `{ "state": "Closed" }` → 200, state is "closed".
24. **Unknown assignee username**: PATCH with `{ "assignees": ["nonexistent_user"] }` → 422.
25. **Unknown label name**: PATCH with `{ "labels": ["nonexistent_label"] }` → 422.
26. **Invalid milestone ID**: PATCH with `{ "milestone": 999999 }` → 422.
27. **Negative milestone ID**: PATCH with `{ "milestone": -1 }` → 422.
28. **Duplicate assignees deduplicated**: PATCH with `{ "assignees": ["alice", "alice"] }` → 200, one assignee returned.
29. **Duplicate labels deduplicated**: PATCH with `{ "labels": ["bug", "bug"] }` → 200, one label returned.
30. **Assignee case insensitivity**: PATCH with `{ "assignees": ["ALICE"] }` → 200, normalized to lowercase.
31. **Title with Unicode/emoji**: PATCH with `{ "title": "🐛 Fix für Büg #42" }` → 200, title preserved exactly.
32. **Body with markdown code fences**: PATCH with body containing triple backtick code blocks → 200, body preserved.
33. **Unauthenticated request**: PATCH without auth → 401.
34. **Read-only user**: PATCH from a read-only collaborator → 403.
35. **Nonexistent issue**: PATCH to issue #999999 → 404.
36. **Nonexistent repository**: PATCH to `nonexistent-owner/nonexistent-repo/issues/1` → 404.
37. **Invalid issue number in URL**: PATCH to `issues/abc` → 400.
38. **Negative issue number**: PATCH to `issues/-1` → 400.
39. **Malformed JSON body**: PATCH with invalid JSON → 400.
40. **Concurrent edits to different fields**: Two simultaneous PATCHes (one title, one labels) → both succeed, final state has both changes.
41. **Idempotent re-edit**: PATCH same title twice → both return 200, title unchanged after second.
42. **updated_at changes on edit**: Verify `updated_at` is strictly newer after a successful edit.
43. **Closed-issue counter on close**: Verify repository closed_issue_count increments when state transitions to closed.
44. **Closed-issue counter on reopen**: Verify repository closed_issue_count decrements when state transitions to open.
45. **Response shape validation**: Verify response contains all fields: id, number, title, body, state, author, assignees, labels, milestone_id, comment_count, closed_at, created_at, updated_at.

### CLI E2E Tests (Bun test runner)

46. **CLI edit title**: `codeplane issue edit <N> --title "New title" --repo OWNER/REPO --json` → JSON output with updated title.
47. **CLI edit body**: `codeplane issue edit <N> --body "New body" --repo OWNER/REPO --json` → JSON output with updated body.
48. **CLI edit assignee**: `codeplane issue edit <N> --assignee alice --repo OWNER/REPO --json` → JSON output with alice in assignees.
49. **CLI edit label**: `codeplane issue edit <N> --label bug --repo OWNER/REPO --json` → JSON output with bug in labels.
50. **CLI edit multiple flags**: `codeplane issue edit <N> --title "X" --label "bug" --repo OWNER/REPO --json` → both fields updated.
51. **CLI edit no flags**: `codeplane issue edit <N> --repo OWNER/REPO --json` → issue returned unchanged.
52. **CLI edit nonexistent issue**: `codeplane issue edit 999999 --title "X" --repo OWNER/REPO` → error message, nonzero exit code.
53. **CLI edit without auth**: Run without valid credentials → auth error message.
54. **CLI close then verify**: `codeplane issue close <N>` then `codeplane issue view <N> --json` → state is "closed".
55. **CLI reopen then verify**: `codeplane issue reopen <N>` then `codeplane issue view <N> --json` → state is "open".
56. **CLI human-friendly output**: `codeplane issue edit <N> --title "X" --repo OWNER/REPO` (no `--json`) → contains "Updated" and issue number.

### Playwright Web UI E2E Tests

57. **Inline title edit**: Navigate to issue detail, click title, type new title, press Enter → title updated on page, API call confirmed.
58. **Inline title edit cancel**: Click title, modify, press Escape → title reverts to original.
59. **Inline title edit empty rejected**: Click title, clear text, press Enter → validation error shown, title not saved.
60. **Body edit save**: Click edit on body, modify content, click Save → body updated, markdown rendered.
61. **Body edit cancel with changes**: Click edit on body, modify, click Cancel → confirmation dialog appears.
62. **Body edit cancel without changes**: Click edit on body, click Cancel immediately → no confirmation, returns to view.
63. **Labels sidebar edit**: Click labels gear icon, toggle labels, verify PATCH sent and UI updated.
64. **Assignees sidebar edit**: Click assignees gear icon, select assignee, verify PATCH sent and UI updated.
65. **Milestone sidebar edit**: Click milestone widget, select milestone, verify PATCH sent and UI updated.
66. **Milestone sidebar clear**: Click milestone widget, select "No milestone", verify milestone cleared.
67. **State toggle close**: Click "Close issue" button → state badge changes to "closed", button changes to "Reopen".
68. **State toggle reopen**: On closed issue, click "Reopen issue" → state changes to "open".
69. **Edit with insufficient permissions**: Log in as read-only user, navigate to issue → edit controls are hidden or disabled.
70. **Optimistic update revert on error**: Simulate server error during label edit → UI reverts to previous labels, error toast shown.

### TUI E2E Tests

71. **TUI edit form opens from detail**: Navigate to issue detail, press `e` → edit form opens with pre-populated fields.
72. **TUI edit form opens from list**: Focus issue in list, press `e` → edit form opens.
73. **TUI edit title and save**: Modify title, press Ctrl+S → form closes, detail view shows new title.
74. **TUI edit cancel with changes**: Modify title, press Esc → confirmation dialog appears.
75. **TUI edit cancel without changes**: Open form, press Esc immediately → form closes, no confirmation.
76. **TUI edit shows loading state**: Submit edit → "Saving…" appears on save button.
77. **TUI edit shows error inline**: Trigger validation error → red banner appears at top of form.

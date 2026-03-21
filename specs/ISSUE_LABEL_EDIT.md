# ISSUE_LABEL_EDIT

Specification for ISSUE_LABEL_EDIT.

## High-Level User POV

When working on an issue in Codeplane, a user may need to change which labels are applied to the issue — adding labels to signal new categorization, removing labels that no longer apply, or replacing the entire label set to reflect a change in triage. The Issue Label Edit feature provides a streamlined way to modify the labels attached to a specific issue across every Codeplane client surface.

From the web UI, a user viewing an issue detail page sees a labels section in the sidebar. Clicking the gear icon next to "Labels" opens a searchable, multi-select dropdown that shows every label defined in the repository. Each label is rendered with its assigned color. The user toggles labels on and off, and the changes are saved immediately — there is no separate "save" step. The issue detail view instantly reflects the updated label set, and the issue list view shows the new labels when the user navigates back.

From the CLI, a user runs a single command to set, add, or remove labels on an issue. They can replace the full label set, append new labels, or remove specific ones. The CLI confirms the update by printing the updated issue with its current labels.

From the TUI, the user presses a keyboard shortcut on an issue detail screen to open a label picker overlay. They navigate labels with keyboard controls, toggle selections, and confirm. The TUI applies the change optimistically and reverts if the server rejects it.

From editor integrations, users can invoke a command or use a picker to modify labels on an issue without leaving their code editor.

The feature supports both human-driven triage and agent-driven automation. Agents can programmatically set labels on issues they create or triage, and the same API contract applies regardless of whether the caller is human or machine.

## Acceptance Criteria

- [ ] A user with write access to a repository can modify the labels on any open or closed issue in that repository.
- [ ] The PATCH endpoint `PATCH /api/repos/:owner/:repo/issues/:number` accepts a `labels` field containing an array of label name strings.
- [ ] When `labels` is provided in the PATCH body, it **replaces** the entire label set on the issue (set-replace semantics, not additive).
- [ ] Providing `labels: []` (empty array) removes all labels from the issue.
- [ ] Omitting the `labels` field entirely from the PATCH body leaves existing labels unchanged.
- [ ] Each label name in the array must correspond to an existing label in the repository. If any name does not match an existing label, the request fails with a 422 Validation Failed error and no labels are changed.
- [ ] Duplicate label names in the request array are silently deduplicated — only one association is created per unique label name.
- [ ] Label name matching is exact (case-sensitive, after trimming).
- [ ] Label names are trimmed of leading and trailing whitespace before matching.
- [ ] A label name must be between 1 and 255 characters (after trimming).
- [ ] An empty string or whitespace-only string in the labels array results in a 422 error.
- [ ] The maximum number of labels on a single issue is 50.
- [ ] Attempting to set more than 50 labels on an issue returns a 422 error with a clear message.
- [ ] The response includes the full updated issue object with all labels resolved as label objects (id, name, color, description).
- [ ] The `updated_at` timestamp on the issue is updated when labels are changed.
- [ ] An unauthenticated request to edit labels returns 401 Unauthorized.
- [ ] An authenticated user without write access to the repository receives 403 Forbidden.
- [ ] Editing labels on a non-existent issue returns 404 Not Found.
- [ ] Editing labels on an issue in a non-existent repository returns 404 Not Found.
- [ ] Editing labels on an issue in an archived repository returns 403 Forbidden.
- [ ] The `POST /api/repos/:owner/:repo/issues/:number/labels` endpoint adds labels to an issue additively (without removing existing labels).
- [ ] The `DELETE /api/repos/:owner/:repo/issues/:number/labels/:name` endpoint removes a single named label from an issue.
- [ ] Attempting to add a label that is already on the issue via the POST endpoint returns 409 Conflict.
- [ ] Attempting to remove a label that is not on the issue returns 404 Not Found.
- [ ] The CLI `codeplane issue edit <number> --label <name>` adds a label to the issue.
- [ ] The CLI supports `--add-label` and `--remove-label` flags for granular label modification.
- [ ] The CLI outputs the updated issue with labels in JSON mode.
- [ ] The Web UI label picker is accessible via a gear icon in the labels sidebar on issue detail.
- [ ] The Web UI label picker supports search/filter by label name.
- [ ] The Web UI applies label changes immediately (no separate save action required).
- [ ] The Web UI shows an error toast if the label update fails, and reverts the display to the previous state.
- [ ] The TUI label picker is opened with the `l` key on the issue detail screen (requires write access).
- [ ] The TUI applies optimistic updates and reverts on server error.
- [ ] All client surfaces reflect the same API behavior and display the same label state for a given issue.

**Definition of Done**: The feature is complete when a user can add, remove, and replace labels on an issue from the API, CLI, Web UI, TUI, and editor integrations, with consistent behavior, proper validation, correct permission enforcement, and full test coverage across all surfaces.

## Design

### API Shape

**Set labels (full replace) — via issue PATCH:**

```
PATCH /api/repos/:owner/:repo/issues/:number
Content-Type: application/json
Authorization: Bearer <token>

{
  "labels": ["bug", "high-priority"]
}
```

Response: `200 OK` with the full issue object including resolved label objects.

**Add labels (additive):**

```
POST /api/repos/:owner/:repo/issues/:number/labels
Content-Type: application/json
Authorization: Bearer <token>

{
  "labels": ["enhancement", "needs-review"]
}
```

Response: `200 OK` with the full list of labels now on the issue.

**Remove a single label:**

```
DELETE /api/repos/:owner/:repo/issues/:number/labels/:name
Authorization: Bearer <token>
```

Response: `204 No Content`.

**Error responses:**

| Status | Condition |
|--------|----------|
| 400 | Malformed JSON body |
| 401 | No authentication provided |
| 403 | User lacks write access to repository |
| 404 | Repository, issue, or label-on-issue not found |
| 409 | Label already attached to issue (POST endpoint) |
| 422 | Label name validation failed, label does not exist in repo, or exceeds max labels per issue |

**Label object shape in responses:**

```json
{
  "id": 42,
  "repository_id": 7,
  "name": "bug",
  "color": "#d73a4a",
  "description": "Something isn't working",
  "created_at": "2026-01-15T10:30:00.000Z",
  "updated_at": "2026-01-15T10:30:00.000Z"
}
```

### SDK Shape

The `LabelService` exposes the following methods relevant to issue label editing:

- `addLabelsToIssue(actor, owner, repo, issueNumber, labelNames)` → `LabelResponse[]`
- `removeIssueLabelByName(actor, owner, repo, issueNumber, labelName)` → `void`
- `listIssueLabels(viewer, owner, repo, issueNumber, page, perPage)` → `{ items, total }`

The `IssueService` handles full label replacement as part of `updateIssue()` when the `labels` field is present.

### CLI Command

**Edit labels via issue edit:**

```bash
# Replace all labels on an issue
codeplane issue edit 42 --label bug --label urgent --repo OWNER/REPO

# Add a label
codeplane issue edit 42 --add-label "needs-review" --repo OWNER/REPO

# Remove a label
codeplane issue edit 42 --remove-label "wontfix" --repo OWNER/REPO

# Clear all labels
codeplane issue edit 42 --label "" --repo OWNER/REPO

# JSON output
codeplane issue edit 42 --add-label "bug" --repo OWNER/REPO --json
```

**Output (human-readable mode):**

```
Updated issue #42
Labels: bug, high-priority, needs-review
```

**Output (JSON mode):** Full issue JSON object with `labels` array containing resolved label objects.

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--label` | string (repeatable) | Set the label list (replaces all) |
| `--add-label` | string (repeatable) | Add a label without removing existing ones |
| `--remove-label` | string (repeatable) | Remove a specific label |
| `--repo` | string | Repository in OWNER/REPO format (optional if in a repo directory) |
| `--json` | boolean | Output as JSON |

### Web UI Design

**Issue Detail Page — Labels Sidebar Widget:**

The labels sidebar section is positioned in the right sidebar of the issue detail view. It consists of:

1. **Header row**: The text "Labels" with a gear icon (⚙) button aligned right. The gear icon is only visible to users with write access.
2. **Label badges**: Each assigned label renders as a colored pill/badge showing the label name with the label's hex color as background. Text color is automatically computed for contrast (white text on dark backgrounds, dark text on light backgrounds).
3. **Empty state**: When no labels are assigned, the text "None yet" appears in muted color.

**Label Picker Dropdown:**

Clicking the gear icon opens a dropdown/popover anchored to the sidebar widget:

1. **Search input**: A text input at the top filters the label list as the user types. Placeholder text: "Filter labels".
2. **Label list**: All repository labels appear as rows. Each row shows: a checkbox (checked if currently assigned), the label color as a dot or pill, the label name, and an optional description in muted text beneath the name.
3. **Toggle behavior**: Clicking a label row toggles its assignment. The PATCH request fires immediately on each toggle. The checkbox updates optimistically.
4. **Scroll**: If the repository has more labels than fit in the dropdown viewport (max height ~300px), the list is scrollable.
5. **Dismiss**: Clicking outside the dropdown or pressing Escape closes it.
6. **Error handling**: If a toggle fails, the checkbox reverts, and a toast notification appears: "Failed to update labels".
7. **Loading state**: While the label list is loading, a spinner or skeleton appears in the dropdown.

**Issue List Page — Label Display:**

In the issue list view, each issue row displays its assigned labels as inline colored badges after the issue title. If labels overflow the available width, a `+N` indicator shows how many additional labels exist.

### TUI UI

**Issue Detail Screen — Label Picker:**

1. **Trigger**: Press `l` (lowercase L) on the issue detail screen. This shortcut is only active for users with write access. For read-only users, `l` is a no-op and the shortcut does not appear in the help bar.
2. **Overlay**: A modal overlay appears centered on screen with:
   - Title bar: "Labels — :owner/:repo#:number"
   - Search input (focused by default): fuzzy-filters the label list as the user types
   - Scrollable label list: each row shows `[✓]` or `[ ]` toggle, colored bullet (●), label name, and truncated description
   - Footer: `Space: toggle  Enter: confirm  Esc: cancel  /: search`
3. **Navigation**: `j`/`k` or `↓`/`↑` navigate the list. `Space` toggles the focused label. `Enter` confirms and sends the PATCH. `Esc` cancels without changes.
4. **Optimistic update**: On `Enter`, the issue detail view immediately shows the new labels. If the API returns an error, the labels revert and an error message appears in the status bar.
5. **Color rendering**: Label colors map to the nearest terminal color based on capability (truecolor → ANSI 256 → ANSI 16 → no-color).

**Issue List Screen — Label Filter:**

1. **Trigger**: Press `L` (uppercase) to open the label filter overlay.
2. **Behavior**: Multi-select labels for AND-logic client-side filtering. Only issues matching ALL selected labels are shown.
3. **Active filter indicator**: When label filters are active, a "Labels: bug, ..." indicator appears in the filter bar.

### Neovim Plugin API

- `:CodeplaneIssueSetLabels <number>` — Opens a Telescope picker with all repository labels. Pre-selects currently assigned labels. Multi-select with `<Tab>`. Confirm with `<CR>` sends the PATCH.
- `:CodeplaneIssueAddLabel <number> <label>` — Adds a single label by name.
- `:CodeplaneIssueRemoveLabel <number> <label>` — Removes a single label by name.

### VS Code Extension

- "Codeplane: Edit Issue Labels" command in the command palette — prompts for issue number (or uses the issue under cursor in an issue webview), then shows a QuickPick multi-select with all repo labels.
- Issue detail webview includes a clickable labels section that opens the QuickPick.

### Documentation

The following end-user documentation should be written:

1. **"Managing Issue Labels"** guide covering:
   - How to add, remove, and replace labels on issues from each client (web, CLI, TUI, editors)
   - Screenshots/examples of the label picker in the web UI
   - CLI command reference with examples
   - Keyboard shortcuts for TUI label management
2. **CLI reference entry** for `issue edit --label`, `--add-label`, `--remove-label`
3. **API reference entry** for the issue PATCH endpoint's `labels` field, the POST labels endpoint, and the DELETE label endpoint

## Permissions & Security

### Authorization Roles

| Role | Can view labels | Can edit labels on issues | Can add/remove labels |
|------|----------------|--------------------------|----------------------|
| Repository Owner | ✅ | ✅ | ✅ |
| Organization Owner | ✅ | ✅ | ✅ |
| Admin collaborator | ✅ | ✅ | ✅ |
| Write collaborator | ✅ | ✅ | ✅ |
| Read collaborator | ✅ (public or private) | ❌ (403) | ❌ (403) |
| Authenticated, no access | ✅ (public repos only) | ❌ (403) | ❌ (403) |
| Anonymous | ✅ (public repos only) | ❌ (401) | ❌ (401) |

### Rate Limiting

- **Label mutation endpoints** (PATCH issue with labels, POST labels to issue, DELETE label from issue): 60 requests per minute per authenticated user.
- **Label list/read endpoints**: 120 requests per minute per user (authenticated or anonymous).
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy Constraints

- Label names and descriptions are user-generated content. They must not be indexed by external search engines on private repositories.
- Label names could theoretically contain PII (e.g., a label named after a person). No special PII scrubbing is applied, but label names should not appear in server logs at INFO level — only at DEBUG level.
- Webhook deliveries that include label data must only be sent to webhook URLs configured by repository administrators.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue_label_added` | A label is added to an issue (via PATCH replace, POST add, or CLI) | `repo_id`, `repo_owner`, `repo_name`, `issue_number`, `label_id`, `label_name`, `actor_id`, `actor_username`, `client` (web/cli/tui/api/editor), `method` (replace/add) |
| `issue_label_removed` | A label is removed from an issue (via PATCH replace, DELETE, or CLI) | `repo_id`, `repo_owner`, `repo_name`, `issue_number`, `label_id`, `label_name`, `actor_id`, `actor_username`, `client`, `method` (replace/remove) |
| `issue_labels_replaced` | The full label set on an issue is replaced via PATCH | `repo_id`, `issue_number`, `actor_id`, `labels_before_count`, `labels_after_count`, `labels_added`, `labels_removed`, `client` |
| `issue_label_edit_failed` | A label edit attempt fails (validation, permission, not found) | `repo_id`, `issue_number`, `actor_id`, `error_code`, `error_reason`, `client` |

### Funnel Metrics & Success Indicators

- **Adoption**: % of issues with at least one label (target: >40% of issues in active repositories).
- **Edit frequency**: Average label edits per issue over its lifetime (indicates active triage).
- **Client distribution**: Breakdown of label edits by client surface (web, CLI, TUI, editor) to inform where to invest UX improvements.
- **Error rate**: % of label edit attempts that fail (target: <2%).
- **Time-to-label**: Median time between issue creation and first label being applied (lower is better for triage efficiency).
- **Label diversity**: Average number of distinct labels used per repository (indicates label scheme health).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Label edit request received | DEBUG | `repo_id`, `issue_number`, `actor_id`, `label_count` | Entry point for label mutation |
| Label validation failure | WARN | `repo_id`, `issue_number`, `field`, `code`, `value_length` | Invalid label name or color |
| Label not found in repository | WARN | `repo_id`, `issue_number`, `label_name` | Requested label does not exist |
| Permission denied for label edit | WARN | `repo_id`, `issue_number`, `actor_id`, `permission` | User lacks write access |
| Label edit committed | INFO | `repo_id`, `issue_number`, `actor_id`, `labels_added`, `labels_removed`, `duration_ms` | Successful label mutation |
| Database error during label edit | ERROR | `repo_id`, `issue_number`, `error_type`, `error_message` | Unexpected DB failure |
| Unique constraint violation (conflict) | WARN | `repo_id`, `issue_number`, `label_name` | Duplicate label attachment attempt |

**Note**: Label names must NOT appear in INFO-level logs to avoid accidental PII exposure. They may appear at DEBUG level only.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_label_operations_total` | counter | `action` (added, removed, replaced), `status` (success, error), `client` | Total label operations |
| `codeplane_issue_label_operation_duration_seconds` | histogram | `action`, `status` | Latency of label operations |
| `codeplane_issue_label_validation_errors_total` | counter | `field` (name, color, labels), `code` (missing_field, invalid, not_found) | Validation failures |
| `codeplane_issue_label_permission_denied_total` | counter | `reason` (unauthenticated, forbidden) | Permission failures |
| `codeplane_issue_labels_per_issue` | histogram | — | Distribution of label count per issue (sampled on edit) |

### Alerts

**Alert 1: High label operation error rate**

- **Condition**: `rate(codeplane_issue_label_operations_total{status="error"}[5m]) / rate(codeplane_issue_label_operations_total[5m]) > 0.10`
- **Severity**: Warning
- **Runbook**:
  1. Check the error logs filtered by `issue_label` context for the last 15 minutes.
  2. Determine if errors are concentrated on a single repository (potential data corruption) or spread across many (potential service-level issue).
  3. Check database connectivity and query latency via `codeplane_issue_label_operation_duration_seconds`.
  4. If DB latency is elevated, check PostgreSQL connection pool saturation and slow query logs for the `labels`, `issue_labels`, and `issues` tables.
  5. If errors are 422s (validation), check if a client is sending malformed requests (inspect `client` label on the counter).
  6. If errors are 500s, check for recent deployments and consider rolling back.

**Alert 2: Label operation latency spike**

- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_label_operation_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check the `codeplane_issue_label_operation_duration_seconds` histogram for which `action` type is slow.
  2. Check PostgreSQL slow query logs for queries touching `issue_labels` and `labels` tables.
  3. Verify indexes exist on `issue_labels(issue_id, label_id)` and `labels(repository_id, name)`.
  4. Check if a specific repository has an unusually large number of labels (>1000) causing slow lookups.
  5. If the issue is write contention, check for long-running transactions holding locks on the `issue_labels` table.

**Alert 3: Sustained permission denied spike**

- **Condition**: `rate(codeplane_issue_label_permission_denied_total[5m]) > 50`
- **Severity**: Info
- **Runbook**:
  1. Check if a bot or integration is misconfigured and repeatedly attempting unauthorized label edits.
  2. Review the `actor_id` in WARN-level permission denied logs to identify the source.
  3. If it's a legitimate user, verify their repository permissions are configured correctly.
  4. If it appears to be an abuse pattern, consider rate-limiting the specific actor.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| No auth token/session | Return "authentication required" | 401 |
| User has read-only access | Return "permission denied" | 403 |
| Repository is archived | Return "permission denied" (archived) | 403 |
| Repository not found | Return "repository not found" | 404 |
| Issue not found | Return "issue not found" | 404 |
| Label name does not exist in repository | Return validation error with label name | 422 |
| Label name is empty string | Return validation error "missing_field" | 422 |
| Label name exceeds 255 characters | Return validation error "invalid" | 422 |
| More than 50 labels in request | Return validation error "too_many" | 422 |
| Label already on issue (POST additive) | Return "label already attached" | 409 |
| Label not on issue (DELETE) | Return "label not found on issue" | 404 |
| Database connection failure | Return internal server error, log ERROR | 500 |
| Request body is not valid JSON | Return "invalid request body" | 400 |
| Concurrent label edit race condition | Last write wins; no error (idempotent set-replace) | 200 |

## Verification

### API Integration Tests

1. **Add a single label to an issue via PATCH** — Create a repo, create a label "bug", create an issue, PATCH the issue with `labels: ["bug"]` → verify 200, verify response includes the label object with correct name, color, id.
2. **Add multiple labels to an issue via PATCH** — PATCH with `labels: ["bug", "enhancement", "urgent"]` → verify all three appear in response.
3. **Replace labels via PATCH** — Issue has labels ["bug", "enhancement"]. PATCH with `labels: ["urgent"]` → verify only "urgent" remains.
4. **Clear all labels via PATCH** — Issue has labels. PATCH with `labels: []` → verify response has empty labels array.
5. **Omit labels field in PATCH** — Issue has labels ["bug"]. PATCH with `{ "title": "new title" }` → verify labels are unchanged.
6. **Add labels via POST endpoint** — POST `/issues/:number/labels` with `{ "labels": ["bug"] }` → verify 200, verify label appears.
7. **Add multiple labels via POST** — POST with `{ "labels": ["bug", "enhancement"] }` → verify both appear.
8. **Remove label via DELETE** — DELETE `/issues/:number/labels/bug` → verify 204, verify label no longer on issue.
9. **Duplicate label names in request are deduplicated** — PATCH with `labels: ["bug", "bug", "bug"]` → verify only one "bug" label on issue.
10. **Label name with leading/trailing whitespace is trimmed** — PATCH with `labels: ["  bug  "]` → verify matches "bug" label.
11. **Non-existent label name returns 422** — PATCH with `labels: ["nonexistent-label"]` → verify 422 with validation error.
12. **Mix of valid and invalid label names returns 422 (atomic)** — PATCH with `labels: ["bug", "nonexistent"]` → verify 422, verify labels unchanged.
13. **Empty string in labels array returns 422** — PATCH with `labels: [""]` → verify 422.
14. **Label name at maximum length (255 chars)** — Create a label with a 255-character name, PATCH issue to use it → verify 200.
15. **Label name exceeding maximum length (256 chars) returns 422** — PATCH with a 256-character label name → verify 422.
16. **Maximum labels per issue (50)** — Create 50 labels, PATCH issue with all 50 → verify 200 and all 50 present.
17. **Exceeding maximum labels per issue (51) returns 422** — Create 51 labels, PATCH issue with all 51 → verify 422.
18. **Unauthenticated request returns 401** — PATCH without auth → verify 401.
19. **Read-only user returns 403** — Authenticate as read-only collaborator, PATCH → verify 403.
20. **Write-access user succeeds** — Authenticate as write collaborator, PATCH → verify 200.
21. **Admin user succeeds** — Authenticate as admin collaborator, PATCH → verify 200.
22. **Repository owner succeeds** — Authenticate as repo owner, PATCH → verify 200.
23. **Organization owner succeeds** — Authenticate as org owner on org repo, PATCH → verify 200.
24. **Non-existent repository returns 404** — PATCH on `/api/repos/nouser/norepo/issues/1` → verify 404.
25. **Non-existent issue returns 404** — PATCH on valid repo with issue number 99999 → verify 404.
26. **POST with already-attached label returns 409** — Issue has "bug", POST `{ "labels": ["bug"] }` → verify 409.
27. **DELETE label not on issue returns 404** — DELETE `/issues/:number/labels/not-attached` → verify 404.
28. **Labels on closed issue can be edited** — Close an issue, PATCH labels → verify 200.
29. **updated_at changes after label edit** — Record issue's `updated_at`, PATCH labels, verify `updated_at` is newer.
30. **Case sensitivity** — Create labels "Bug" and "bug" (if distinct), PATCH with `["Bug"]` → verify only "Bug" is applied.
31. **Special characters in label names** — Create labels with names containing spaces, hyphens, slashes, parentheses, Unicode, emoji → PATCH issue with each → verify 200.
32. **Empty request body returns 400** — PATCH with no JSON body → verify 400.
33. **Malformed JSON returns 400** — PATCH with `{labels:}` → verify 400.
34. **Concurrent label edits converge** — Two simultaneous PATCHes with different label sets → verify one wins cleanly (no 500).
35. **Archived repository returns 403** — Archive a repo, attempt label edit → verify 403.

### CLI E2E Tests

36. **`codeplane issue edit <N> --label bug --json`** — Verify JSON output includes "bug" in labels.
37. **`codeplane issue edit <N> --add-label enhancement --json`** — Verify "enhancement" added without removing existing labels.
38. **`codeplane issue edit <N> --remove-label bug --json`** — Verify "bug" removed, other labels retained.
39. **`codeplane issue edit <N> --label bug --label urgent --json`** — Verify both labels present.
40. **`codeplane issue edit <N> --label "" --json`** — Verify all labels cleared.
41. **CLI with invalid label name** — `--add-label nonexistent` → verify non-zero exit code and error message.
42. **CLI without auth** — Remove auth, attempt label edit → verify error message about authentication.
43. **CLI with `--repo` flag** — Specify explicit `--repo OWNER/REPO` → verify correct repo targeted.
44. **CLI human-readable output** — Edit labels without `--json` → verify human-readable confirmation message.

### Web UI Playwright Tests

45. **Open label picker from issue detail sidebar** — Click gear icon → verify dropdown appears with all repo labels.
46. **Search labels in picker** — Type in search input → verify label list filters.
47. **Toggle a label on** — Click unchecked label → verify checkbox checks, label badge appears in sidebar.
48. **Toggle a label off** — Click checked label → verify checkbox unchecks, label badge removed from sidebar.
49. **Close picker by clicking outside** — Click outside dropdown → verify it closes.
50. **Close picker with Escape** — Press Escape → verify it closes.
51. **Label colors render correctly** — Verify label badges have correct background color matching the label's hex color.
52. **Empty state displays "None yet"** — Issue with no labels → verify "None yet" text visible.
53. **Error toast on failure** — Mock API error → toggle label → verify error toast appears and checkbox reverts.
54. **Gear icon hidden for read-only users** — Sign in as read-only → verify gear icon is not visible.
55. **Labels display in issue list** — Navigate to issue list → verify label badges visible on issues.
56. **`+N` overflow indicator** — Issue with many labels → verify overflow indicator in list view.
57. **Multiple labels can be toggled in sequence** — Toggle on three labels rapidly → verify all three are applied.

### TUI E2E Tests

58. **`l` opens label picker on issue detail** — Navigate to issue detail, press `l` → verify picker overlay appears.
59. **Label picker shows all repo labels** — Verify all labels appear with correct names and colors.
60. **Navigate labels with `j`/`k`** — Press `j` → verify focus moves down. Press `k` → verify focus moves up.
61. **Toggle label with `Space`** — Focus a label, press `Space` → verify toggle state changes.
62. **Confirm with `Enter`** — Toggle labels, press `Enter` → verify overlay closes, labels updated on issue.
63. **Cancel with `Esc`** — Toggle labels, press `Esc` → verify overlay closes, labels unchanged.
64. **Fuzzy search in picker** — Type a partial label name → verify list filters to matching labels.
65. **`l` is no-op for read-only users** — Navigate as read-only user, press `l` → verify nothing happens.
66. **`L` opens label filter on issue list** — Press `L` on issue list → verify filter overlay appears.
67. **Label filter applies AND logic** — Select two labels in filter → verify only issues with both labels are shown.
68. **Optimistic update on error reverts** — Mock API error, confirm label toggle → verify labels revert and error shown in status bar.

### Editor Integration Tests

69. **VS Code: Edit Issue Labels command** — Invoke command palette, select "Edit Issue Labels" → verify QuickPick appears with labels.
70. **Neovim: `:CodeplaneIssueSetLabels`** — Run command → verify Telescope picker opens with labels.

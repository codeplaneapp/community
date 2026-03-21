# ISSUE_LABELS_REMOVE

Specification for ISSUE_LABELS_REMOVE.

## High-Level User POV

When triaging or managing issues in Codeplane, labels are a primary organizing tool — but labels don't stay relevant forever. A label like "needs-triage" should be removed once an issue has been triaged. A "wontfix" label may need to be taken off when a team decides to revisit a previously deferred problem. The Issue Labels Remove feature gives users a precise, targeted way to detach a single named label from an issue, across every Codeplane client surface.

From the web UI, a user viewing an issue's detail page can click the gear icon next to the "Labels" section in the sidebar to open the label picker. When they uncheck a currently-applied label, the label is immediately removed from the issue. The colored badge disappears from the sidebar, and if the removal fails for any reason, the badge reappears and an error toast is shown. The user never has to navigate away from the issue or perform a separate save step.

From the CLI, a user runs `codeplane issue edit <number> --remove-label <name>` to remove a specific label without touching any other labels on the issue. The CLI confirms the removal by printing the updated issue with its remaining label set. This is distinct from the `--label` flag, which replaces the entire set — `--remove-label` is a surgical operation.

From the TUI, the user presses `l` on an issue detail screen to open the label picker, deselects the label they want to remove using `Space`, and confirms with `Enter`. The label badge disappears immediately (optimistic update), and reverts if the server rejects the change.

From editor integrations, users can invoke a remove-label command or use a picker to detach a label from an issue without leaving their coding context.

This feature is equally accessible to human users and to AI agents. An agent that resolves an issue can programmatically remove a "needs-agent-review" label using the same API, and the same validation and authorization rules apply.

## Acceptance Criteria

- [ ] A user with write access to a repository can remove any label currently applied to any open or closed issue in that repository.
- [ ] The `DELETE /api/repos/:owner/:repo/issues/:number/labels/:name` endpoint removes a single named label from an issue.
- [ ] The label name in the URL path is matched exactly (case-sensitive) against labels on the issue, after trimming leading and trailing whitespace.
- [ ] A successful removal returns `204 No Content` with an empty body.
- [ ] Removing a label that is not currently applied to the issue returns `404 Not Found` with the message "label not found on issue".
- [ ] Removing a label from a non-existent issue returns `404 Not Found` with the message "issue not found".
- [ ] Removing a label from a non-existent repository returns `404 Not Found` with the message "repository not found".
- [ ] An unauthenticated request returns `401 Unauthorized`.
- [ ] An authenticated user without write access to the repository receives `403 Forbidden`.
- [ ] Removing a label from an issue in an archived repository returns `403 Forbidden`.
- [ ] An empty or whitespace-only label name returns `400 Bad Request` with the message "label name is required".
- [ ] The label name must be between 1 and 255 characters (after trimming). Names exceeding 255 characters result in a `400 Bad Request`.
- [ ] The issue number must be a positive integer. Zero, negative, or non-integer values result in a `400 Bad Request`.
- [ ] Label names containing special characters (hyphens, spaces, slashes, parentheses, Unicode, emoji) are supported and matched exactly.
- [ ] Removing a label from a closed issue succeeds (label removal is not gated on issue state).
- [ ] The `updated_at` timestamp on the issue is not changed by a label removal (only the `issue_labels` junction is modified).
- [ ] Removing the last label from an issue leaves the issue with an empty label set (no error or special behavior).
- [ ] Concurrent removal of the same label by two actors results in one `204` and one `404` — no `500` errors.
- [ ] After successful removal, subsequent GET requests for the issue no longer include the removed label in the `labels` array.
- [ ] The CLI `codeplane issue edit <number> --remove-label <name>` flag removes a specific label without affecting other labels on the issue.
- [ ] The CLI `--remove-label` flag can be repeated to remove multiple labels in a single command invocation.
- [ ] The Web UI label picker uncheck action triggers a label removal and updates the display immediately (optimistic UI).
- [ ] The TUI label picker allows deselecting labels and confirming removal with the `Enter` key.
- [ ] All client surfaces reflect the same API behavior and converge on consistent issue label state after removal.

**Definition of Done**: The feature is complete when a label can be surgically removed from an issue across the API, CLI, Web UI, TUI, and editor integrations, with correct validation, proper authorization enforcement, accurate error responses for all edge cases, and comprehensive test coverage across all surfaces.

## Design

### API Shape

**Remove a single label from an issue:**

```
DELETE /api/repos/:owner/:repo/issues/:number/labels/:name
Authorization: Bearer <token>
```

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization slug |
| `repo` | string | Repository name |
| `number` | integer | Issue number (positive integer) |
| `name` | string | Label name (exact match, case-sensitive, trimmed) |

**Success response:** `204 No Content` — empty body.

**Error responses:**

| Status | Condition | Message |
|--------|-----------|--------|
| 400 | Label name is empty or whitespace-only | `label name is required` |
| 400 | Issue number is not a valid positive integer | `invalid issue number` |
| 401 | No auth token or session provided | `authentication required` |
| 403 | Authenticated user lacks write access | `permission denied` |
| 403 | Repository is archived | `permission denied` |
| 404 | Repository not found | `repository not found` |
| 404 | Issue not found | `issue not found` |
| 404 | Label exists in repo but is not on the issue | `label not found on issue` |
| 429 | Rate limit exceeded | `rate limit exceeded` (with `Retry-After` header) |

**Notes:**
- The endpoint is idempotent-safe in that a `404` response for a non-attached label is the expected signal, not a server error.
- The label name is URL-encoded in the path. Clients must percent-encode special characters (spaces → `%20`, slashes → `%2F`, etc.).
- There is no request body. The `Content-Type` header is not required for DELETE requests.

### SDK Shape

The `LabelService` in `@codeplane/sdk` exposes the following method:

```typescript
removeIssueLabelByName(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  issueNumber: number,
  labelName: string,
): Promise<void>
```

**Behavior:**
1. Validates that `actor` is authenticated (throws 401 if null).
2. Validates `issueNumber > 0` (throws 400 if invalid).
3. Trims `labelName` and validates it is non-empty (throws 400 if empty).
4. Resolves the repository by owner and name (throws 404 if not found).
5. Checks that the actor has write access to the repository (throws 403 if denied, including for archived repos).
6. Verifies the issue exists by number (throws 404 if not found).
7. Executes the CTE-based delete query against the `issue_labels` junction table, joining on `issues` and `labels` to match by repository ID, issue number, and label name.
8. Checks the returned count — if 0, the label was not on the issue (throws 404).

### CLI Command

**Remove a single label:**

```bash
codeplane issue edit <number> --remove-label <name> [--repo OWNER/REPO] [--json]
```

**Remove multiple labels in one invocation:**

```bash
codeplane issue edit <number> --remove-label "bug" --remove-label "wontfix" [--repo OWNER/REPO]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--remove-label` | string (repeatable) | Remove a specific label by name. Each occurrence removes one label. |
| `--repo` | string | Repository in OWNER/REPO format (optional if in a repo directory) |
| `--json` | boolean | Output full issue JSON including remaining labels |

**Behavior:**
- For each `--remove-label` value, the CLI calls `DELETE /api/repos/:owner/:repo/issues/:number/labels/:name`.
- If any removal fails, the CLI prints the error for that label and continues attempting the remaining removals, then exits with a non-zero status code.
- Human-readable output confirms each removal: `Removed label "bug" from issue #42`.
- JSON output (`--json`) returns the updated issue object fetched after all removals.

**Note:** The current CLI `issue edit` command only has `--label` (which triggers PATCH set-replace semantics). The `--remove-label` flag needs to be added as a new option on the `issue edit` command.

### Web UI Design

**Issue Detail Page — Labels Sidebar Widget (removal flow):**

1. **Gear icon**: Clicking the gear icon (⚙) next to "Labels" in the right sidebar opens the label picker dropdown. The gear icon is only visible to users with write access.
2. **Currently applied labels**: Each label that is currently on the issue shows a checked checkbox in the picker.
3. **Uncheck to remove**: Clicking a checked label row unchecks it and immediately fires a `DELETE /api/repos/:owner/:repo/issues/:number/labels/:name` request.
4. **Optimistic update**: The label badge disappears from the sidebar immediately upon uncheck. If the API returns an error, the badge re-appears and an error toast is shown: "Failed to remove label".
5. **No confirmation dialog**: Removal is immediate on toggle — there is no "are you sure?" modal.
6. **Badge removal animation**: The label badge should fade out smoothly when removed (no abrupt jump).
7. **Empty state**: If all labels are removed, the sidebar shows "None yet" in muted text.

**Issue List Page:**

- After a label is removed, navigating back to the issue list should show the updated label set for that issue (standard data refresh on navigation).

### TUI UI

**Issue Detail Screen — Label Picker (removal flow):**

1. Press `l` on the issue detail screen to open the label picker overlay.
2. Labels currently applied to the issue are shown with a `[✓]` indicator.
3. Navigate to the label with `j`/`k` or arrow keys.
4. Press `Space` to toggle the label off (uncheck it).
5. Press `Enter` to confirm. For each newly-unchecked label, the TUI sends a `DELETE` request (or alternatively a PATCH with the new label set).
6. The label badge disappears from the issue detail view immediately (optimistic).
7. If the server rejects the change, the badge reappears and the status bar shows an error message.
8. Press `Esc` to cancel — any toggles made in the picker are discarded.

### Neovim Plugin API

- `:CodeplaneIssueRemoveLabel <number> <label>` — Removes a single named label from the specified issue. Prints confirmation or error in the command line area.
- The `:CodeplaneIssueSetLabels` Telescope picker also supports removal by deselecting currently-applied labels.

### VS Code Extension

- "Codeplane: Edit Issue Labels" command in the command palette supports removal by deselecting labels in the QuickPick multi-select.
- Issue detail webview supports clicking a label's `×` button to remove it.

### Documentation

The following end-user documentation should be written:

1. **"Removing Labels from Issues"** section within the "Managing Issue Labels" guide:
   - How to remove a label from the web UI (uncheck in label picker)
   - How to remove a label from the CLI (`--remove-label` flag)
   - How to remove a label from the TUI (picker toggle-off flow)
   - How to remove a label from Neovim (`:CodeplaneIssueRemoveLabel`)
   - How to remove a label from VS Code (QuickPick deselection or `×` button)
2. **CLI reference**: Document the `--remove-label` flag on `codeplane issue edit`, including repeatable usage for bulk removal.
3. **API reference**: Document the `DELETE /api/repos/:owner/:repo/issues/:number/labels/:name` endpoint with all path parameters, response codes, and error conditions.

## Permissions & Security

### Authorization Roles

| Role | Can remove labels from issues |
|------|-------------------------------|
| Repository Owner | ✅ |
| Organization Owner | ✅ |
| Admin collaborator | ✅ |
| Write collaborator | ✅ |
| Read collaborator | ❌ (403 Forbidden) |
| Authenticated, no access | ❌ (403 Forbidden) |
| Anonymous | ❌ (401 Unauthorized) |

### Rate Limiting

- **Label mutation endpoints** (including DELETE label from issue): 60 requests per minute per authenticated user.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header indicating seconds until the next allowed request.
- Burst allowance: up to 10 requests in a single second within the per-minute budget.

### Data Privacy Constraints

- Label names are user-generated content that could theoretically contain PII. Label names must not appear in INFO-level server logs — only at DEBUG level.
- Webhook deliveries triggered by label removal must only be sent to webhook URLs configured by repository administrators.
- On private repositories, label metadata (including removal events) must not be accessible to users without at least read access to the repository.
- Audit logs recording label removal should include the actor ID and label ID but should redact the label name at the stored log level unless explicitly configured for verbose auditing.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue_label_removed` | A label is removed from an issue via the DELETE endpoint | `repo_id`, `repo_owner`, `repo_name`, `issue_number`, `label_id`, `label_name`, `actor_id`, `actor_username`, `client` (web/cli/tui/api/editor), `method` ("delete") |
| `issue_label_remove_failed` | A label removal attempt fails (validation, permission, not found) | `repo_id`, `issue_number`, `actor_id`, `error_code` (400/401/403/404), `error_reason`, `client`, `label_name_provided` (boolean, not the actual name for privacy) |

### Funnel Metrics & Success Indicators

- **Removal frequency**: Number of label removals per day, per week — indicates triage activity and label lifecycle health.
- **Removal-to-addition ratio**: Ratio of `issue_label_removed` to `issue_label_added` events — a ratio significantly above 1.0 may indicate label churn or unclear label taxonomy.
- **Error rate**: Percentage of `issue_label_remove_failed` events out of total removal attempts (target: < 2%).
- **Client distribution**: Breakdown of label removals by client surface (web, CLI, TUI, editor, API) — informs where to invest removal UX improvements.
- **404 rate**: Percentage of removal attempts that return "label not found on issue" — a high rate may indicate stale UI state or missing real-time updates.
- **Time-from-add-to-remove**: Median time between a label being added and subsequently removed — indicates how long labels remain relevant.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Label removal request received | DEBUG | `repo_owner`, `repo_name`, `issue_number`, `actor_id`, `label_name` | Entry point for DELETE label route |
| Label name validation failed | WARN | `repo_owner`, `repo_name`, `issue_number`, `reason` | Empty or invalid label name |
| Issue number validation failed | WARN | `repo_owner`, `repo_name`, `raw_value`, `reason` | Non-integer or non-positive issue number |
| Permission denied for label removal | WARN | `repo_id`, `issue_number`, `actor_id`, `permission_level` | User lacks write access |
| Repository not found | WARN | `repo_owner`, `repo_name`, `actor_id` | Repository does not exist or is inaccessible |
| Issue not found | WARN | `repo_id`, `issue_number`, `actor_id` | Issue does not exist in the repository |
| Label not found on issue | INFO | `repo_id`, `issue_number`, `actor_id` | Label exists in repo but not attached to issue (expected user error, not system fault) |
| Label successfully removed | INFO | `repo_id`, `issue_number`, `actor_id`, `duration_ms` | Successful removal (label name at DEBUG only) |
| Database error during removal | ERROR | `repo_id`, `issue_number`, `error_type`, `error_message`, `duration_ms` | Unexpected database failure |

**Note**: Label names must NOT appear at INFO level to avoid accidental PII exposure. They may appear at DEBUG level only.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_label_operations_total` | counter | `action="removed"`, `status` (success/error), `client` | Total label removal operations |
| `codeplane_issue_label_operation_duration_seconds` | histogram | `action="removed"`, `status` | Latency of label removal operations (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_issue_label_permission_denied_total` | counter | `reason` (unauthenticated/forbidden), `action="removed"` | Permission failures on label removal |
| `codeplane_issue_label_not_found_total` | counter | `type` (repo/issue/label_on_issue) | 404 breakdowns for label removal |

### Alerts

**Alert 1: High label removal error rate**

- **Condition**: `rate(codeplane_issue_label_operations_total{action="removed",status="error"}[5m]) / rate(codeplane_issue_label_operations_total{action="removed"}[5m]) > 0.10`
- **Severity**: Warning
- **Runbook**:
  1. Check structured logs filtered by label removal context for the last 15 minutes: look for `ERROR` and `WARN` entries.
  2. Determine error distribution: are errors concentrated on 404s (stale UI state), 403s (misconfigured permissions), or 500s (infrastructure)?
  3. For 500 errors: check PostgreSQL connection pool metrics and slow query logs for queries touching `issue_labels`, `labels`, and `issues` tables.
  4. For 403 spikes: check if a recently-changed permission model or repository transfer is causing legitimate users to lose access.
  5. For 404 spikes: check if a client deploy pushed stale label data or if a bulk label deletion is causing race conditions.
  6. If errors are 500s correlated with a recent deploy, consider rolling back.

**Alert 2: Label removal latency spike**

- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_label_operation_duration_seconds_bucket{action="removed"}[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_label_operation_duration_seconds` histogram to identify the latency distribution shape.
  2. Check PostgreSQL slow query logs for the CTE-based delete query used by `removeIssueLabelByName`.
  3. Verify that indexes exist on `issue_labels(issue_id, label_id)`, `labels(repository_id, name)`, and `issues(repository_id, number)`.
  4. Check for lock contention on the `issue_labels` table — look for long-running transactions that may be holding row-level locks.
  5. If a specific repository has an abnormally large label set (>1000 labels), consider whether the query plan is degrading and whether targeted optimization is needed.
  6. Check overall database connection pool utilization and whether the server is experiencing connection starvation.

**Alert 3: Sustained 401/403 spike on label removal**

- **Condition**: `rate(codeplane_issue_label_permission_denied_total{action="removed"}[5m]) > 50`
- **Severity**: Info
- **Runbook**:
  1. Check WARN-level logs for `actor_id` values causing permission denied errors.
  2. Determine if a single actor (bot or integration) is repeatedly attempting unauthorized removals — this may indicate a misconfigured automation.
  3. If the spike correlates with a permission change (e.g., a collaborator being downgraded), verify the change was intentional.
  4. If the pattern appears abusive, consider rate-limiting the specific actor or flagging the account for review.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| No auth token/session | Return "authentication required" | 401 |
| User has read-only access | Return "permission denied" | 403 |
| Repository is archived | Return "permission denied" | 403 |
| Repository not found | Return "repository not found" | 404 |
| Issue not found (valid repo) | Return "issue not found" | 404 |
| Label exists in repo but not on issue | Return "label not found on issue" | 404 |
| Label does not exist in repo at all | Return "label not found on issue" | 404 |
| Label name is empty string or whitespace | Return "label name is required" | 400 |
| Issue number is zero or negative | Return "invalid issue number" | 400 |
| Issue number is not a valid integer | Return "invalid issue number" | 400 |
| Database connection failure | Return internal server error, log ERROR | 500 |
| Concurrent removal of same label | First request: 204, second request: 404 (race-safe) | 204 / 404 |
| Rate limit exceeded | Return "rate limit exceeded" with Retry-After | 429 |

## Verification

### API Integration Tests

1. **Remove a label that is on the issue** — Create repo, create label "bug", create issue, add "bug" to issue, `DELETE /issues/:number/labels/bug` → verify `204 No Content`, then `GET /issues/:number` → verify "bug" no longer in labels array.
2. **Remove label returns empty body** — `DELETE /issues/:number/labels/bug` → verify response body is empty/null (not JSON).
3. **Remove label not on issue returns 404** — Issue has label "bug" only, `DELETE /issues/:number/labels/enhancement` → verify `404` with message "label not found on issue".
4. **Remove label that does not exist in the repository at all** — `DELETE /issues/:number/labels/totally-made-up` → verify `404`.
5. **Remove from non-existent issue returns 404** — `DELETE /issues/99999/labels/bug` → verify `404` with message "issue not found".
6. **Remove from non-existent repository returns 404** — `DELETE /api/repos/nouser/norepo/issues/1/labels/bug` → verify `404`.
7. **Unauthenticated request returns 401** — `DELETE` without auth → verify `401`.
8. **Read-only user returns 403** — Authenticate as read-only collaborator, `DELETE` → verify `403`.
9. **Write-access user succeeds** — Authenticate as write collaborator, `DELETE` → verify `204`.
10. **Admin user succeeds** — Authenticate as admin collaborator, `DELETE` → verify `204`.
11. **Repository owner succeeds** — Authenticate as repo owner, `DELETE` → verify `204`.
12. **Organization owner succeeds** — Authenticate as org owner on org repo, `DELETE` → verify `204`.
13. **Archived repository returns 403** — Archive a repo, `DELETE /issues/:number/labels/bug` → verify `403`.
14. **Remove label from closed issue succeeds** — Close an issue, `DELETE /issues/:number/labels/bug` → verify `204`.
15. **Empty label name returns 400** — `DELETE /issues/:number/labels/` (empty path segment) → verify `400` or routing-level error.
16. **Whitespace-only label name returns 400** — `DELETE /issues/:number/labels/%20%20` → verify `400` with "label name is required".
17. **Label name with special characters** — Create label "bug/fix", add to issue, `DELETE /issues/:number/labels/bug%2Ffix` → verify `204`.
18. **Label name with spaces** — Create label "needs review", add to issue, `DELETE /issues/:number/labels/needs%20review` → verify `204`.
19. **Label name with Unicode characters** — Create label "バグ", add to issue, `DELETE /issues/:number/labels/バグ` → verify `204`.
20. **Label name with emoji** — Create label "🐛", add to issue, `DELETE /issues/:number/labels/🐛` → verify `204`.
21. **Label name at maximum length (255 chars)** — Create a label with a 255-character name, add to issue, `DELETE` by that name → verify `204`.
22. **Label name exceeding maximum length (256 chars)** — `DELETE /issues/:number/labels/<256-char-string>` → verify `400`.
23. **Case-sensitive matching** — Create labels "Bug" and "bug", add "Bug" to issue, `DELETE /issues/:number/labels/bug` → verify `404` (wrong case). Then `DELETE /issues/:number/labels/Bug` → verify `204`.
24. **Label name with leading/trailing whitespace is trimmed** — `DELETE /issues/:number/labels/%20bug%20` → should match the label named "bug" (after trimming) and return `204`.
25. **Issue number zero returns 400** — `DELETE /issues/0/labels/bug` → verify `400` with "invalid issue number".
26. **Issue number negative returns 400** — `DELETE /issues/-1/labels/bug` → verify `400` with "invalid issue number".
27. **Issue number non-integer returns 400** — `DELETE /issues/abc/labels/bug` → verify `400`.
28. **Removing the last label leaves empty label set** — Issue has one label "bug", `DELETE /issues/:number/labels/bug` → verify `204`, then `GET` → verify `labels: []`.
29. **Removing one label preserves others** — Issue has labels ["bug", "enhancement", "urgent"], `DELETE /issues/:number/labels/enhancement` → verify `204`, then `GET` → verify labels are ["bug", "urgent"] (order may vary).
30. **Concurrent removal of same label** — Two parallel `DELETE /issues/:number/labels/bug` requests → verify one returns `204` and the other returns `404`, no `500` errors.
31. **Subsequent GET reflects removal** — After successful `DELETE`, `GET /issues/:number` → verify removed label is absent. `GET /issues/:number/labels` (list endpoint) → verify removed label is absent.
32. **Idempotency behavior** — `DELETE /issues/:number/labels/bug` when "bug" is on issue → `204`. Same request again → `404`. This is expected non-idempotent behavior for a `DELETE` on a specific association.

### CLI E2E Tests

33. **`codeplane issue edit <N> --remove-label bug --json`** — Verify JSON output shows "bug" removed from labels, other labels retained.
34. **`codeplane issue edit <N> --remove-label nonexistent`** — Verify non-zero exit code and error message about label not found.
35. **`codeplane issue edit <N> --remove-label bug --remove-label wontfix --json`** — Verify both labels removed, remaining labels intact.
36. **CLI without auth, attempt removal** — Remove auth config, `--remove-label` → verify error message about authentication.
37. **CLI with `--repo` flag** — `--remove-label bug --repo OWNER/REPO` → verify correct repository targeted and label removed.
38. **CLI human-readable output** — `--remove-label bug` without `--json` → verify output contains `Removed label "bug" from issue #N`.
39. **CLI removal from closed issue** — Close issue first, then `--remove-label bug` → verify success.
40. **CLI removal of label with special characters** — `--remove-label "needs review"` → verify successful removal.

### Web UI Playwright Tests

41. **Toggle a label off in picker** — Open label picker on issue with labels, click a checked label → verify checkbox unchecks, label badge disappears from sidebar.
42. **Optimistic revert on failure** — Mock API `DELETE` to return `500`, click a checked label → verify checkbox reverts to checked, error toast appears with "Failed to remove label".
43. **Remove last label shows empty state** — Issue with one label, uncheck it → verify "None yet" text appears in sidebar.
44. **Gear icon hidden for read-only users** — Sign in as read-only → verify gear icon is not visible, no way to trigger removal.
45. **Removed label no longer appears in issue list** — Remove a label from issue detail, navigate to issue list → verify removed label badge is absent.
46. **Multiple labels can be removed in sequence** — Toggle off three labels sequentially → verify all three badges disappear.
47. **Removed label can be re-added** — Uncheck a label (removes it), then re-check it (adds it back) → verify label reappears.

### TUI E2E Tests

48. **Toggle label off and confirm** — Open label picker on issue with labels, navigate to a checked label, press `Space` to uncheck, press `Enter` → verify label removed from issue detail.
49. **Cancel preserves labels** — Open label picker, uncheck a label, press `Esc` → verify label is still on the issue (no removal sent).
50. **`l` is no-op for read-only users** — Navigate as read-only user, press `l` → verify nothing happens.
51. **Optimistic revert on error** — Mock API error, confirm label removal → verify label re-appears and error shown in status bar.
52. **Remove last label** — Issue with one label, uncheck and confirm → verify issue detail shows no labels.

### Editor Integration Tests

53. **VS Code: Remove label via QuickPick** — Open "Edit Issue Labels", deselect a label, confirm → verify label removed on server.
54. **Neovim: `:CodeplaneIssueRemoveLabel <N> bug`** — Run command → verify success message, verify label removed on subsequent view.

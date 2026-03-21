# ISSUE_REOPEN

Specification for ISSUE_REOPEN.

## High-Level User POV

When a user closes an issue prematurely — by accident, because new information surfaces, or because a previously resolved problem recurs — they need a fast, frictionless way to bring that issue back to active status. Reopening an issue is the inverse of closing it, and it should feel just as lightweight and immediate.

From any Codeplane surface — the web UI, CLI, TUI, VS Code, or Neovim — a user can reopen a closed issue with a single action. In the web UI, the "Close issue" button on a closed issue transforms into a "Reopen issue" button. Clicking it transitions the issue back to the open state, removes the closed timestamp, updates the repository's open/closed counters, and appends a timeline event recording who reopened it and when. On the issue list, the issue's state indicator returns to its open appearance and the issue reappears in default open-filtered views.

In the CLI, `codeplane issue reopen <number>` is a single command that returns the updated issue. In the TUI, pressing a keybinding on a closed issue flips it back to open with optimistic visual feedback. Editor integrations expose the same action through context menus and commands.

Reopening an issue also triggers downstream automation: workflow triggers listening for `issue.reopened` events fire, webhook subscriptions receive a delivery, and repository watchers and assignees receive notifications. The result is that reopening is not just a state toggle — it is a full product event that re-engages the team around work that still needs attention.

## Acceptance Criteria

### Core Behavior
- [ ] A closed issue can be reopened by sending `{ "state": "open" }` to the update endpoint.
- [ ] After reopening, `issue.state` equals `"open"` and `issue.closed_at` is `null`.
- [ ] After reopening, `issue.updated_at` reflects the time of the reopen action.
- [ ] The repository's `num_closed_issues` counter is decremented by exactly 1 on a closed→open transition.
- [ ] The repository's `num_closed_issues` counter is never decremented below zero.
- [ ] A timeline event of type `state_changed` is created with payload `{ "from_state": "closed", "to_state": "open" }` and the acting user's identity.

### Idempotency
- [ ] Reopening an already-open issue is a no-op: the response returns 200 with the current issue state, `closed_at` remains `null`, and no counter decrement or timeline event is created.
- [ ] Reopening an already-open issue does not fire workflow triggers, webhook deliveries, or notifications.

### Input Validation
- [ ] The `state` field accepts `"open"` (case-insensitive, trimmed). Values like `"Open"`, `" OPEN "`, and `"open"` all normalize to `"open"`.
- [ ] Invalid state values (e.g., `"reopened"`, `"active"`, `""`, `null`, numeric values) return a 400 validation error.
- [ ] The issue number must be a positive integer. Non-integer, negative, or zero values return 400.
- [ ] Request body must be valid JSON with `Content-Type: application/json`. Missing or malformed JSON returns 400.
- [ ] An empty JSON body `{}` is a valid no-op update (no state change, returns current issue).

### Edge Cases
- [ ] Reopening an issue in an archived repository returns 403 Forbidden.
- [ ] Reopening a non-existent issue number returns 404 Not Found.
- [ ] Reopening an issue in a non-existent repository returns 404 Not Found.
- [ ] Concurrent reopen requests for the same issue must not cause double-decrement of `num_closed_issues`.
- [ ] Reopening an issue preserves all existing labels, assignees, milestone associations, and comments.
- [ ] Reopening an issue preserves the original `created_at` timestamp.
- [ ] Issues with Unicode titles (emoji, CJK, RTL text) reopen without data corruption.
- [ ] Issues with very long bodies (up to the maximum allowed body length) reopen without truncation.
- [ ] If the `state` field is provided alongside other update fields (title, body, labels, assignees, milestone), all updates are applied atomically.

### Downstream Effects
- [ ] Workflow triggers subscribed to `on.issue.reopened` or `on.issues.types: ["reopened"]` fire exactly once per reopen transition.
- [ ] Webhook subscriptions listening for `issues` events receive a delivery with `action: "reopened"`.
- [ ] Repository watchers receive a notification for the reopen event.
- [ ] Issue assignees receive a notification for the reopen event.
- [ ] Notifications include the actor who performed the reopen, the issue number, and the repository.

### Definition of Done
- [ ] The reopen action works correctly across all surfaces: API, Web UI, CLI, TUI, VS Code, and Neovim.
- [ ] E2E tests validate the full lifecycle (create → close → reopen → verify) in both API and CLI.
- [ ] Webhook and workflow trigger tests confirm downstream event delivery.
- [ ] Idempotency and error-path tests pass.
- [ ] Counter integrity is verified under concurrent access.
- [ ] The feature is documented in user-facing CLI help text and web UI tooltips.

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/issues/:number`

**Request:**
```http
PATCH /api/repos/acme/widgets/issues/42 HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "state": "open"
}
```

**Success Response (200 OK):**
```json
{
  "id": "uuid-string",
  "number": 42,
  "title": "Widget rendering broken on Firefox",
  "body": "Steps to reproduce...",
  "state": "open",
  "author": {
    "id": "uuid-string",
    "login": "alice",
    "avatar_url": "https://..."
  },
  "assignees": [
    { "id": "uuid-string", "login": "bob" }
  ],
  "labels": [
    { "id": "uuid-string", "name": "bug", "color": "#d73a4a" }
  ],
  "milestone_id": null,
  "comment_count": 5,
  "closed_at": null,
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid state value, malformed JSON, or invalid issue number | `{ "error": "Invalid issue state. Must be 'open' or 'closed'." }` |
| 401 | No authentication provided | `{ "error": "Authentication required." }` |
| 403 | Insufficient permissions or archived repository | `{ "error": "You do not have permission to update this issue." }` |
| 404 | Issue or repository not found | `{ "error": "Issue not found." }` |
| 429 | Rate limit exceeded | `{ "error": "Rate limit exceeded.", "retry_after": 30 }` |

### SDK Shape

```typescript
interface UpdateIssueInput {
  state?: "open" | "closed";
  title?: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: string | null;
}

// IssueService method
async updateIssue(
  actor: AuthUser,
  owner: string,
  repo: string,
  number: number,
  input: UpdateIssueInput
): Promise<IssueResponse>
```

The SDK `updateIssue` method:
1. Validates authentication (throws 401 if missing).
2. Resolves the repository with write-access check (throws 403/404).
3. Fetches the current issue (throws 404 if not found).
4. Normalizes the `state` field via `normalizeIssueState()` (throws 400 for invalid values).
5. Detects the state transition direction:
   - If `closed → open`: sets `closed_at = null`, decrements `num_closed_issues`.
   - If `open → open`: no counter or timestamp change (idempotent).
6. Persists the update atomically.
7. Creates a `state_changed` timeline event (only on actual transition).
8. Returns the full updated `IssueResponse`.

### Web UI Design

**Issue Detail Page:**

- **State badge:** Transitions from a red `Closed` badge to a green `Open` badge upon reopen.
- **Action button:** When the issue is closed, the primary action button reads **"Reopen issue"** styled with a green/success variant. After clicking, it transitions back to **"Close issue"** with a red/danger variant.
- **Button loading state:** While the PATCH request is in flight, the button shows a spinner and is disabled to prevent double-clicks.
- **Timeline entry:** A new system event is appended to the timeline: *"@username reopened this just now"* with a green reopen icon.
- **Closed timestamp:** The "Closed on <date>" metadata line is removed from the issue header.
- **Comment + reopen:** If the user types a comment and clicks "Comment & reopen", the comment is posted first, then the state transition occurs. The button label is **"Comment & reopen issue"** when the comment textarea is non-empty and the issue is closed.

**Issue List Page:**

- **State icon:** The issue row's state icon changes from a red closed icon to a green open icon.
- **Filter tab counts:** The "Open" tab count increments by 1 and the "Closed" tab count decrements by 1.
- **Active filter:** If the user is viewing the "Closed" filter, the reopened issue remains visible in the current view until the next navigation or refresh. If viewing the "Open" filter, the issue appears in its sorted position.

### CLI Command

**Command:** `codeplane issue reopen <number>`

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<number>` | Yes | The issue number to reopen (positive integer) |

**Flags:**
| Flag | Short | Description |
|------|-------|-------------|
| `--repo` | `-R` | Repository in `owner/repo` format. Defaults to the repository detected from the current working directory. |
| `--json` | | Output the full issue response as JSON. |

**Usage examples:**
```bash
# Reopen issue 42 in the current repo
codeplane issue reopen 42

# Reopen issue 42 in a specific repo
codeplane issue reopen 42 --repo acme/widgets

# Reopen and get JSON output
codeplane issue reopen 42 --json
```

**Human-readable output:**
```
✓ Reopened issue #42: Widget rendering broken on Firefox
  State: open
  URL: https://codeplane.example.com/acme/widgets/issues/42
```

**Error output:**
```
✗ Failed to reopen issue #42: You do not have permission to update this issue.
```

### TUI UI

**Issue List Screen (keybinding: `x`):**
- Pressing `x` on a focused closed issue row sends the reopen PATCH request.
- **Optimistic update:** The state icon immediately changes from red closed (●) to green open (●).
- **In-flight guard:** The `x` key is disabled for that row while the request is in flight.
- **Success feedback:** Status bar shows `"Issue #N reopened"` in green for 3 seconds.
- **Error rollback:** On HTTP error, the icon reverts to red within one render frame and the status bar shows the error message (e.g., `"Permission denied"`, `"Issue not found"`, `"Rate limited. Retry in Ns."`).

**Issue Detail Screen (keybinding: `o`):**
- Pressing `o` toggles the issue state. On a closed issue, it sends the reopen request.
- **Optimistic update:** The state badge changes from `[closed]` (red) to `[open]` (green). A timeline entry `"→ @user changed state closed → open — just now"` is appended optimistically.
- **Success feedback:** Badge and timeline persist; status bar shows confirmation.
- **Error rollback:** Badge reverts to `[closed]`, optimistic timeline entry is removed, and error appears in the status bar.

**Retry:** The user can retry a failed reopen by pressing `x` / `o` again or pressing `R`.

### VS Code Extension

- **Issue Tree View:** Closed issues display a red icon. After reopen, the tree item icon changes to green and the tree view refreshes.
- **Context Menu:** Right-clicking a closed issue shows a **"Reopen Issue"** action.
- **Command Palette:** `Codeplane: Reopen Issue` command accepts an issue number.
- **Notification:** A VS Code information notification confirms `"Issue #N reopened"`.

### Neovim Plugin

- **Commands:** `:Codeplane issue reopen <number>` reopens the specified issue.
- **Telescope Picker:** Issue picker shows state. Selecting a closed issue and invoking the reopen action sends the request.
- **Status Feedback:** Success/error messages displayed via `vim.notify()`.

### Documentation

The following user-facing documentation should be provided:

- **CLI reference:** `codeplane issue reopen` command documentation with synopsis, arguments, flags, examples, and exit codes.
- **API reference:** `PATCH /api/repos/:owner/:repo/issues/:number` endpoint documentation covering the reopen use case, request/response examples, and error codes.
- **Web UI guide:** Brief explanation in the issues feature guide describing the reopen button behavior, the "Comment & reopen" flow, and timeline entry.
- **TUI keybinding reference:** Document `x` (list) and `o` (detail) as the state toggle keybindings and their optimistic behavior.
- **Webhook events reference:** Document the `issues` event with `action: "reopened"` including the full payload schema.
- **Workflow triggers reference:** Document `on.issue.reopened` / `on.issues.types: ["reopened"]` trigger configuration.

## Permissions & Security

### Authorization Matrix

| Role | Can Reopen? | Notes |
|------|-------------|-------|
| Repository Owner | ✅ Yes | Full control over all issues. |
| Organization Admin | ✅ Yes | Org-wide administrative authority. |
| Team Member (write) | ✅ Yes | Team must have write access to the repository. |
| Collaborator (write) | ✅ Yes | Explicitly granted write permission. |
| Issue Author | ✅ Yes | Authors can always reopen their own issues. |
| Read-Only Collaborator | ❌ No | Returns 403 Forbidden. |
| Anonymous / Unauthenticated | ❌ No | Returns 401 Unauthorized. |

### Archived Repository Enforcement
- Reopening an issue in an archived repository is forbidden (403). Archived repositories are read-only for all mutation operations.

### Rate Limiting
- **Per-user rate limit:** 60 issue state mutations per minute per authenticated user.
- **Burst allowance:** Up to 10 requests in a 1-second burst window.
- **429 response:** Includes `Retry-After` header with seconds until the limit resets.
- **Scope:** Rate limit applies to the combined total of all issue update operations (close, reopen, edit), not separately per action type.

### Data Privacy
- The reopen action creates a timeline event that records the actor's user ID and login. This is intentional product behavior (issue history transparency) and is visible to all users who can view the issue.
- No PII beyond the actor's public profile information (login, avatar URL) is exposed in the reopen response or timeline event.
- Webhook deliveries include the actor's public profile. Webhook endpoint URLs are controlled by repository administrators and are not exposed to other users.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.reopened` | Issue transitions from closed to open | `repo_id`, `repo_owner`, `repo_name`, `issue_id`, `issue_number`, `actor_id`, `actor_login`, `surface` (`"api"`, `"web"`, `"cli"`, `"tui"`, `"vscode"`, `"neovim"`), `time_closed_seconds` (duration the issue was closed), `reopen_count` (number of times this issue has been reopened) |
| `issue.reopen.idempotent` | Reopen requested on an already-open issue | `repo_id`, `issue_id`, `issue_number`, `actor_id`, `surface` |
| `issue.reopen.error` | Reopen request fails | `repo_id`, `issue_id`, `issue_number`, `actor_id`, `surface`, `error_code` (`400`, `403`, `404`, `429`), `error_message` |
| `issue.reopen.comment_and_reopen` | User uses the "Comment & reopen" flow | `repo_id`, `issue_id`, `issue_number`, `actor_id`, `surface`, `comment_length` |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Reopen success rate | `issue.reopened` / (`issue.reopened` + `issue.reopen.error`) | > 98% |
| Reopen-to-close cycle time | Median time between `issue.reopened` and subsequent `issue.closed` for the same issue | Decreasing over time indicates issues are being resolved more quickly on revisit |
| Idempotent reopen ratio | `issue.reopen.idempotent` / `issue.reopened` | < 5% (higher suggests UI confusion about current state) |
| Reopen frequency per issue | Distribution of `reopen_count` across issues | Most issues reopened ≤ 1 time; high-reopen issues may indicate process problems |
| Surface distribution | Breakdown of `issue.reopened` by `surface` | Validates multi-surface adoption |

## Observability

### Logging Requirements

| Log Entry | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Issue reopen initiated | `info` | `{ actor_id, repo_id, issue_number, current_state }` | On entering the `updateIssue` service method with state="open" |
| Issue state transition applied | `info` | `{ actor_id, repo_id, issue_number, from_state: "closed", to_state: "open", closed_duration_seconds }` | After successful DB update on state transition |
| Issue reopen idempotent | `debug` | `{ actor_id, repo_id, issue_number, state: "open" }` | When reopen is requested on an already-open issue |
| Issue reopen authorization failure | `warn` | `{ actor_id, repo_id, issue_number, reason }` | On 403 response |
| Issue reopen validation error | `warn` | `{ actor_id, repo_id, issue_number, invalid_state_value }` | On 400 response from invalid state value |
| Issue reopen not found | `info` | `{ actor_id, repo_id_or_owner, issue_number }` | On 404 response |
| Issue counter decrement | `debug` | `{ repo_id, new_count }` | After decrementing `num_closed_issues` |
| Issue reopen internal error | `error` | `{ actor_id, repo_id, issue_number, error_message, stack }` | On unexpected 500 error |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_reopen_total` | Counter | `repo`, `status` (`success`, `error`, `idempotent`) | Total reopen attempts |
| `codeplane_issue_reopen_duration_seconds` | Histogram | `repo` | Request-to-response latency for reopen operations. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 |
| `codeplane_issue_reopen_errors_total` | Counter | `repo`, `error_code` (`400`, `401`, `403`, `404`, `429`, `500`) | Reopen errors by HTTP status code |
| `codeplane_issue_state_transitions_total` | Counter | `repo`, `from_state`, `to_state` | All issue state transitions (shared with close) |
| `codeplane_repo_closed_issues_gauge` | Gauge | `repo` | Current count of closed issues per repository (updated on every transition) |

### Alerts and Runbooks

**ALERT: IssueReopenErrorRateHigh**
- **Condition:** `rate(codeplane_issue_reopen_errors_total{error_code="500"}[5m]) > 0.1`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `issue.reopen.internal_error` entries in the last 5 minutes.
  2. Identify whether errors are scoped to a single repository or global.
  3. Check database connectivity: run `SELECT 1` against the primary database.
  4. Check if the `issues` or `repositories` table has lock contention: query `pg_stat_activity` for long-running transactions.
  5. If database is healthy, check for recent deployments that may have introduced a regression in the `updateIssue` service method.
  6. If scoped to one repository, check for data integrity issues (e.g., `num_closed_issues` is already 0 but issues exist with `state = "closed"`).
  7. Escalate to the platform team if the root cause is not identifiable within 15 minutes.

**ALERT: IssueReopenLatencyHigh**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_issue_reopen_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check whether the latency spike correlates with overall database latency (`codeplane_db_query_duration_seconds`).
  2. Check for table bloat or missing indexes on the `issues` table (especially on `repository_id`, `number` composite index).
  3. Check if there is a workflow trigger storm: a large number of `on.issue.reopened` triggers executing simultaneously can cause back-pressure.
  4. Review recent changes to the `updateIssue` code path for unintended N+1 queries (e.g., label/assignee resolution).
  5. If localized to specific repositories, investigate repository size (number of issues, events).

**ALERT: IssueCounterDrift**
- **Condition:** Periodic reconciliation job detects `repositories.num_closed_issues != (SELECT COUNT(*) FROM issues WHERE repository_id = ? AND state = 'closed')`.
- **Severity:** Warning
- **Runbook:**
  1. Identify affected repositories from the reconciliation job output.
  2. Check for recent 500 errors in the `issue_reopen` or `issue_close` paths that may have caused partial transaction commits.
  3. Run the counter reconciliation repair: `UPDATE repositories SET num_closed_issues = (SELECT COUNT(*) FROM issues WHERE repository_id = repositories.id AND state = 'closed')` for affected repositories.
  4. Investigate whether the drift was caused by a race condition (concurrent close/reopen on the same issue) and verify that the counter operations use appropriate transaction isolation.

**ALERT: IssueReopenRateLimitSpike**
- **Condition:** `rate(codeplane_issue_reopen_errors_total{error_code="429"}[5m]) > 1.0`
- **Severity:** Info
- **Runbook:**
  1. Identify the user(s) hitting the rate limit from structured logs.
  2. Determine if this is legitimate bulk-reopen behavior (e.g., a triage session) or potential abuse.
  3. If legitimate, consider temporarily increasing the per-user limit or providing a bulk-reopen API endpoint.
  4. If abuse, review the user's activity and consider account-level rate limiting escalation.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Invalid state value | 400 | Request rejected, no side effects | Fix the request payload |
| Malformed JSON body | 400 | Request rejected | Fix the JSON syntax |
| Invalid issue number (non-integer) | 400 | Request rejected | Provide a valid positive integer |
| Unauthenticated request | 401 | Request rejected | Provide valid auth credentials |
| Insufficient permissions | 403 | Request rejected, logged as warning | Request write access from repo owner |
| Archived repository | 403 | Request rejected | Unarchive the repository first |
| Issue not found | 404 | Request rejected | Verify issue number and repository |
| Repository not found | 404 | Request rejected | Verify owner/repo path |
| Rate limit exceeded | 429 | Request rejected, `Retry-After` header included | Wait and retry after the specified interval |
| Database connection failure | 500 | Request fails, alert fires | Investigate database health |
| Counter decrement race | 500 (potential) | Counter may drift | Reconciliation job corrects drift |
| Partial transaction failure | 500 | Issue may be updated but event/counter may not | Reconciliation + manual review |

## Verification

### API Integration Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| API-REOPEN-001 | Reopen a closed issue | Create issue → close it → PATCH with `{ "state": "open" }` → verify `state: "open"`, `closed_at: null`, `updated_at` changed. |
| API-REOPEN-002 | Idempotent reopen on open issue | Create issue (state=open) → PATCH with `{ "state": "open" }` → verify 200, state unchanged, `closed_at: null`, no timeline event created. |
| API-REOPEN-003 | Reopen sets closed_at to null | Create issue → close → verify `closed_at` is set → reopen → verify `closed_at` is `null`. |
| API-REOPEN-004 | Reopen preserves created_at | Create issue → close → reopen → verify `created_at` is unchanged. |
| API-REOPEN-005 | Reopen preserves title and body | Create issue with specific title/body → close → reopen → verify title and body unchanged. |
| API-REOPEN-006 | Reopen preserves labels | Create issue → add 3 labels → close → reopen → verify all 3 labels present. |
| API-REOPEN-007 | Reopen preserves assignees | Create issue → assign 2 users → close → reopen → verify both assignees present. |
| API-REOPEN-008 | Reopen preserves milestone | Create issue → set milestone → close → reopen → verify milestone unchanged. |
| API-REOPEN-009 | Reopen preserves comments | Create issue → add 3 comments → close → reopen → verify `comment_count: 3`. |
| API-REOPEN-010 | State normalization: "Open" | PATCH with `{ "state": "Open" }` → verify 200, state normalized to `"open"`. |
| API-REOPEN-011 | State normalization: " OPEN " | PATCH with `{ "state": " OPEN " }` → verify 200, state normalized to `"open"`. |
| API-REOPEN-012 | Invalid state: "reopened" | PATCH with `{ "state": "reopened" }` → verify 400. |
| API-REOPEN-013 | Invalid state: empty string | PATCH with `{ "state": "" }` → verify 400. |
| API-REOPEN-014 | Invalid state: numeric | PATCH with `{ "state": 1 }` → verify 400. |
| API-REOPEN-015 | Invalid state: null | PATCH with `{ "state": null }` → verify 400. |
| API-REOPEN-016 | Empty body no-op | PATCH with `{}` → verify 200, issue unchanged. |
| API-REOPEN-017 | Malformed JSON body | PATCH with `"not json"` → verify 400. |
| API-REOPEN-018 | Invalid issue number: zero | PATCH `/issues/0` → verify 400. |
| API-REOPEN-019 | Invalid issue number: negative | PATCH `/issues/-1` → verify 400. |
| API-REOPEN-020 | Invalid issue number: non-integer | PATCH `/issues/abc` → verify 400. |
| API-REOPEN-021 | Nonexistent issue | PATCH on non-existent issue number → verify 404. |
| API-REOPEN-022 | Nonexistent repository | PATCH on non-existent repo → verify 404. |
| API-REOPEN-023 | Unauthenticated request | PATCH without auth → verify 401. |
| API-REOPEN-024 | Read-only user | PATCH as read-only collaborator → verify 403. |
| API-REOPEN-025 | Archived repository | Archive repo → PATCH to reopen issue → verify 403. |
| API-REOPEN-026 | Counter decrement on reopen | Create issue → close → verify counter incremented → reopen → verify counter decremented back. |
| API-REOPEN-027 | Counter unchanged on idempotent reopen | Create issue → PATCH with `{ "state": "open" }` → verify counter unchanged. |
| API-REOPEN-028 | Timeline event created on reopen | Create issue → close → reopen → list events → verify `state_changed` event with `to_state: "open"`. |
| API-REOPEN-029 | No timeline event on idempotent reopen | Create issue → PATCH with `{ "state": "open" }` → list events → verify no `state_changed` event. |
| API-REOPEN-030 | Reopen with simultaneous title update | PATCH with `{ "state": "open", "title": "New Title" }` → verify both state and title updated. |
| API-REOPEN-031 | Reopen with simultaneous label update | PATCH with `{ "state": "open", "labels": ["bug"] }` → verify both state and labels updated. |
| API-REOPEN-032 | Reopen with simultaneous milestone clear | PATCH with `{ "state": "open", "milestone": null }` → verify state open and milestone cleared. |
| API-REOPEN-033 | Unicode title preservation on reopen | Create issue with emoji/CJK title → close → reopen → verify title byte-identical. |
| API-REOPEN-034 | Maximum body length preserved on reopen | Create issue with body at maximum allowed length → close → reopen → verify body length preserved. |
| API-REOPEN-035 | Body exceeding maximum length on combined update | PATCH with `{ "state": "open", "body": "<body exceeding max>" }` → verify 400 for body length. |
| API-REOPEN-036 | Issue author can reopen own issue | Create issue as user A → close as admin → reopen as user A (no write access) → verify 200. |
| API-REOPEN-037 | Rate limiting enforcement | Send 61 reopen requests in 1 minute → verify the 61st returns 429 with `Retry-After` header. |

### CLI Integration Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| CLI-REOPEN-001 | Basic reopen | `codeplane issue reopen <N>` → verify exit code 0, output contains "Reopened", state is "open". |
| CLI-REOPEN-002 | Reopen with --repo flag | `codeplane issue reopen <N> --repo owner/repo` → verify success. |
| CLI-REOPEN-003 | Reopen with --json output | `codeplane issue reopen <N> --json` → verify valid JSON with `state: "open"`. |
| CLI-REOPEN-004 | Reopen nonexistent issue | `codeplane issue reopen 99999` → verify non-zero exit code and error message. |
| CLI-REOPEN-005 | Reopen already-open issue | Create issue → `codeplane issue reopen <N>` → verify idempotent success. |
| CLI-REOPEN-006 | Full lifecycle | Create → close → reopen → view → verify all fields preserved and state is "open". |
| CLI-REOPEN-007 | Invalid issue number | `codeplane issue reopen abc` → verify error message about invalid issue number. |
| CLI-REOPEN-008 | No issue number provided | `codeplane issue reopen` → verify usage/help displayed. |

### E2E Playwright (Web UI) Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| WEB-REOPEN-001 | Reopen button visible on closed issue | Navigate to closed issue detail → verify "Reopen issue" button is visible and styled green. |
| WEB-REOPEN-002 | Click reopen transitions state | Click "Reopen issue" → verify badge changes to "Open" (green), button changes to "Close issue", and timeline event appears. |
| WEB-REOPEN-003 | Reopen button hidden on open issue | Navigate to open issue → verify "Close issue" button is visible, not "Reopen issue". |
| WEB-REOPEN-004 | Closed_at removed after reopen | Close issue → verify closed timestamp visible → reopen → verify closed timestamp removed. |
| WEB-REOPEN-005 | Issue list state icon updates | Close issue → navigate to list → verify closed icon → reopen → verify open icon. |
| WEB-REOPEN-006 | Filter tab counts update | Note open/closed tab counts → reopen a closed issue → verify open count +1, closed count -1. |
| WEB-REOPEN-007 | Comment and reopen | Type comment in textarea → click "Comment & reopen issue" → verify comment posted AND state changed to open. |
| WEB-REOPEN-008 | Loading state on button | Click "Reopen issue" → verify button shows spinner and is disabled during request. |
| WEB-REOPEN-009 | Read-only user sees no reopen button | Log in as read-only user → navigate to closed issue → verify no "Reopen issue" button. |
| WEB-REOPEN-010 | Timeline event displays correctly | Reopen issue → verify timeline shows "@username reopened this" with timestamp. |

### TUI Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| TUI-REOPEN-001 | Press x on closed issue in list | Focus closed issue → press `x` → verify icon changes to open, status bar shows "Issue #N reopened". |
| TUI-REOPEN-002 | Press o on closed issue in detail | Open closed issue detail → press `o` → verify badge changes to "[open]", timeline entry appended. |
| TUI-REOPEN-003 | Optimistic rollback on 403 | Press `x` on issue without permission → verify icon reverts and status bar shows "Permission denied". |
| TUI-REOPEN-004 | In-flight guard prevents double reopen | Press `x` → immediately press `x` again → verify only one request sent. |
| TUI-REOPEN-005 | Retry after failure | Fail to reopen (network error) → press `x` again → verify request retried. |

### Webhook & Workflow Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| HOOK-REOPEN-001 | Webhook delivery on reopen | Subscribe to `issues` events → reopen issue → verify webhook delivery with `action: "reopened"`, `issue.state: "open"`, `sender`. |
| HOOK-REOPEN-002 | No webhook on idempotent reopen | Subscribe to `issues` events → reopen already-open issue → verify no delivery. |
| WF-REOPEN-001 | Workflow trigger on reopen | Define workflow with `on.issues.types: ["reopened"]` → reopen issue → verify workflow run created. |
| WF-REOPEN-002 | Workflow trigger not fired on close | Define workflow with `on.issues.types: ["reopened"]` → close issue → verify no workflow run. |
| WF-REOPEN-003 | No workflow trigger on idempotent reopen | Define workflow with `on.issues.types: ["reopened"]` → reopen already-open issue → verify no workflow run. |

### Notification Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| NOTIF-REOPEN-001 | Watcher notified on reopen | Watch repository → another user reopens issue → verify notification received. |
| NOTIF-REOPEN-002 | Assignee notified on reopen | Assign self to issue → another user reopens → verify notification received. |
| NOTIF-REOPEN-003 | No notification on idempotent reopen | Reopen already-open issue → verify no notification sent. |
| NOTIF-REOPEN-004 | Actor does not self-notify | Reopen own issue → verify no notification sent to self. |

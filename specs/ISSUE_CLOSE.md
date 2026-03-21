# ISSUE_CLOSE

Specification for ISSUE_CLOSE.

## High-Level User POV

When a developer finishes resolving an issue — whether by landing a fix, deciding the report is invalid, or determining the work is no longer needed — they need a fast, friction-free way to close it. The close action is the most common write operation in issue triage, and Codeplane makes it available from every product surface: the web UI, the CLI, the TUI, and editor integrations.

Closing an issue transitions it from "open" to "closed" and records the exact moment the closure happened. The issue remains fully visible and searchable — nothing is deleted. The closed issue appears in filtered views when the user selects "Closed" or "All" states, and its closure timestamp is prominently displayed so the team knows when it was resolved.

The action is intentionally forgiving. If a user closes an issue by mistake, they can immediately reopen it (covered by the companion ISSUE_REOPEN feature). There is no confirmation dialog; the product trusts the user's intent and makes recovery trivial. On the CLI, the user can optionally attach a closing comment in the same command — a natural workflow for explaining why an issue was closed.

Closing an issue also fires downstream automation. Workflow definitions that listen for the `issue.closed` event will trigger, webhooks subscribed to issue events will receive a delivery, and users watching the repository will receive a notification. This means closing an issue is not just a state toggle — it is a product event that can drive automation, reporting, and team awareness.

From the web UI, the close action lives on the issue detail page as a prominent button. From the CLI, it is a dedicated `codeplane issue close <number>` command. From the TUI, it is a single-key toggle (`x` on the issue list, `o` on the issue detail). Regardless of surface, the result is identical: the issue's state becomes "closed", its `closed_at` timestamp is set, the repository's closed-issue counter increments, and all downstream events fire.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access can close an open issue from the web UI, CLI, TUI, and API
- [ ] Closing an issue sets its state to `"closed"` and records a `closed_at` timestamp
- [ ] The repository's closed-issue counter increments by 1 upon close
- [ ] Closing an already-closed issue is idempotent — the state remains `"closed"` and `closed_at` is preserved (not overwritten)
- [ ] The closed issue remains visible in issue listings when filtered by "Closed" or "All" states
- [ ] A workflow trigger on `issue.closed` fires when an issue is closed
- [ ] Webhooks subscribed to issue events receive a delivery when an issue is closed
- [ ] Notification fanout sends a notification to repository watchers and mentioned users when an issue is closed
- [ ] An issue event record is created to capture the state change in the issue timeline
- [ ] The API returns the full updated issue response body including the new state and `closed_at` value

### Input Constraints

- [ ] Issue number must be a positive integer (1 to 2,147,483,647)
- [ ] Issue number must reference an existing issue in the specified repository
- [ ] State value sent to the API must be exactly `"closed"` (case-insensitive, trimmed)
- [ ] Invalid state values (e.g., `"done"`, `"resolved"`, `""`, `null`) return a 422 validation error
- [ ] The `owner` and `repo` path parameters must reference an existing repository

### Edge Cases

- [ ] Closing an already-closed issue returns 200 with current state (idempotent, no counter change)
- [ ] Closing an issue that was deleted concurrently returns 404
- [ ] Closing an issue on an archived repository returns 403 or appropriate error
- [ ] Closing an issue with a very high issue number (e.g., #99999) works correctly
- [ ] Closing an issue when the repository's `num_closed_issues` counter is at 0 and incrementing works
- [ ] Concurrent close requests from two users: both succeed or the second is idempotent
- [ ] Closing an issue with Unicode characters in the title does not corrupt the response
- [ ] Sending `{ "state": "closed" }` along with other update fields (title, body, labels) in the same PATCH request applies all changes atomically
- [ ] Empty request body (`{}`) returns 200 with unchanged issue (no-op update)
- [ ] Request body with unknown fields is ignored (no error for extra properties)
- [ ] Request body with `state: "CLOSED"` (uppercase) normalizes to `"closed"` (case-insensitive)
- [ ] Request body with `state: " closed "` (whitespace) normalizes to `"closed"` (trimmed)

### Boundary Constraints

- [ ] Maximum issue title length in response: preserved as stored (no truncation on close)
- [ ] Maximum issue body length in response: preserved as stored (no truncation on close)
- [ ] `closed_at` timestamp format: ISO 8601 with timezone
- [ ] `state` field in response: always lowercase `"closed"` after successful close

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/issues/:number`

**Request:**
```http
PATCH /api/repos/:owner/:repo/issues/:number
Content-Type: application/json
Authorization: token <token>

{
  "state": "closed"
}
```

**Successful Response (200 OK):**
```json
{
  "id": 42,
  "number": 7,
  "title": "Fix login timeout on slow networks",
  "body": "Users on 3G connections see a blank screen...",
  "state": "closed",
  "author": {
    "id": 1,
    "login": "alice"
  },
  "assignees": [
    { "id": 2, "login": "bob" }
  ],
  "labels": [
    { "id": 5, "name": "bug", "color": "#d73a4a", "description": "Something isn't working" }
  ],
  "milestone_id": 3,
  "comment_count": 5,
  "closed_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | No authentication | `{ "message": "Authentication required" }` |
| 403 | Authenticated but no write access | `{ "message": "Forbidden" }` |
| 404 | Issue or repository not found | `{ "message": "Not found" }` |
| 422 | Invalid state value | `{ "message": "Validation failed", "errors": [{ "resource": "Issue", "field": "state", "code": "invalid" }] }` |
| 429 | Rate limit exceeded | `{ "message": "Rate limit exceeded" }` with `Retry-After` header |

### Web UI Design

**Issue Detail Page — Close Button:**

The issue detail page displays a "Close issue" button at the bottom of the comment/reply area. The button is styled with a red/warning color to indicate it is a state-changing action (though reversible).

- **Button label:** "Close issue" (when issue is open)
- **Button label after close:** The button transforms to "Reopen issue" (green/success color) — this is the ISSUE_REOPEN feature
- **Close with comment:** The user can type a comment in the reply textarea and click "Close with comment" — a combined button variant that posts the comment and then closes the issue in one action
- **State badge:** The issue header shows an `Open` badge in green or `Closed` badge in red next to the issue number
- **Timeline event:** After closing, a timeline entry appears: "username closed this just now"
- **Metadata update:** The `closed_at` timestamp appears in the issue header metadata

**Issue List Page:**

- The issue list shows a state icon (colored dot) next to each issue: green for open, red for closed
- After closing an issue (from the detail page), returning to the list reflects the updated state
- The list page header shows counts: "N Open" and "N Closed" as filter tabs

### CLI Command

**Close an issue:**
```bash
codeplane issue close <number> [--repo OWNER/REPO] [--comment "Closing reason"]
```

**Arguments:**
- `<number>` — The issue number (required, must be a positive integer)

**Options:**
- `--repo OWNER/REPO` — Target repository (defaults to the repo inferred from the current working directory)
- `--comment "text"` — Optional comment to post before closing. The comment is created first, then the issue state is changed to closed

**Output (human-readable):**
```
Closed issue #42: Fix login timeout on slow networks
```

**Output (--json):**
Full `IssueResponse` JSON object.

**Error output:**
```
Error: Permission denied (403)
Error: Issue not found (404)
Error: Invalid issue number
```

### TUI UI

**Issue List Screen:**
- Keybinding: `x` on focused row toggles close/reopen
- State icon: green `●` (open) flips to red `●` (closed)
- Optimistic update: icon changes instantly, reverts on server error
- Status bar: "Issue #N closed" (success) or "Failed to close #N: reason" (error) for 3 seconds
- In-flight guard: key disabled during pending mutation

**Issue Detail Screen:**
- Keybinding: `o` toggles close/reopen
- State badge: `[open]` ↔ `[closed]` with color change (green ↔ red)
- Optimistic timeline event: "→ @user changed state open → closed — just now"
- `closed_at` timestamp shown after closing
- Status bar hints update: `o:close` ↔ `o:reopen`

### SDK Shape

The `IssueService.updateIssue()` method in `@codeplane/sdk` is the authoritative service method:

```typescript
updateIssue(
  actor: User,
  owner: string,
  repo: string,
  number: number,
  req: UpdateIssueInput
): Promise<Issue>
```

Where `UpdateIssueInput` includes an optional `state?: string` field. When `state` is `"closed"`:
1. The state is validated via `normalizeIssueState()`
2. `closed_at` is set to `new Date()` (if not already closed)
3. The repository's `num_closed_issues` counter is incremented
4. The database row is updated atomically

### Editor Integrations

**VS Code:**
- Issue browser tree view shows state icons (green/red)
- Closing an issue is available via command palette or context menu on an issue item
- State updates reflect in the tree view after refresh

**Neovim:**
- Issue commands support closing via `codeplane issue close <number>`
- Telescope picker shows issue state in the results list

### Documentation

The following end-user documentation should be written:

1. **Web UI Guide: "Closing and Reopening Issues"** — Walkthrough of the close button, close-with-comment pattern, and how to find closed issues in the list
2. **CLI Reference: `issue close`** — Command syntax, options, examples, and error messages
3. **TUI Reference: Issue Keyboard Shortcuts** — Document `x` and `o` keybindings for close/reopen
4. **API Reference: PATCH /api/repos/:owner/:repo/issues/:number** — Request/response schema, state values, error codes
5. **Workflows: Issue Event Triggers** — How to use `on.issue.closed()` in workflow definitions to trigger automation when issues are closed

## Permissions & Security

### Authorization Roles

| Role | Can Close Issue | Notes |
|------|----------------|-------|
| Repository Owner | ✅ | Full permissions |
| Org Admin | ✅ | Organization-level authority |
| Team Member (write) | ✅ | Team-assigned write permission |
| Collaborator (write) | ✅ | Explicitly added with write role |
| Collaborator (read-only) | ❌ | Returns 403 Forbidden |
| Authenticated (no repo access) | ❌ | Returns 403 Forbidden |
| Anonymous / Unauthenticated | ❌ | Returns 401 Unauthorized |

### Rate Limiting

- The `PATCH /api/repos/:owner/:repo/issues/:number` endpoint is rate-limited at **60 requests per minute** per authenticated user
- The in-flight guard in the TUI provides natural client-side rate limiting (max 1 in-flight request at a time)
- A 429 response includes a `Retry-After` header with the number of seconds to wait
- The CLI and TUI display the retry-after value to the user

### Data Privacy

- Issue close events do not expose PII beyond the actor's username (which is already public in the issue context)
- The `closed_at` timestamp is publicly visible to anyone who can view the issue
- Auth tokens are never logged, displayed in status bars, or included in telemetry events
- Webhook deliveries include the actor's username but not their auth credentials

### Input Sanitization

- The only user-controlled input is the `state` field, which is validated against a strict allowlist (`"open"` or `"closed"`)
- No free-form text injection is possible through the close action itself (the optional `--comment` in CLI goes through the separate comment creation path with its own sanitization)
- Issue numbers are validated as positive integers; non-numeric values are rejected before reaching the database

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.closed` | Issue state transitions from "open" to "closed" | `owner`, `repo`, `issue_number`, `actor_id`, `actor_login`, `surface` ("api" | "web" | "cli" | "tui" | "vscode" | "nvim"), `had_comment` (boolean, CLI close-with-comment), `issue_age_hours` (hours since creation), `comment_count` (at time of close), `label_count`, `assignee_count`, `milestone_id` (nullable), `duration_ms` (API response time) |
| `issue.close.error` | Close attempt fails | `owner`, `repo`, `issue_number`, `surface`, `http_status`, `error_type` ("permission_denied" | "not_found" | "rate_limited" | "validation_error" | "server_error" | "network_error"), `actor_id` |
| `issue.close.idempotent` | Close attempted on already-closed issue | `owner`, `repo`, `issue_number`, `surface`, `actor_id` |

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Close success rate | > 98% | Percentage of close attempts that succeed on first try |
| Permission error rate | < 3% | Percentage of close attempts resulting in 403 — high rates indicate UX confusion about permissions |
| Idempotent close rate | < 5% | Percentage of close attempts on already-closed issues — high rates indicate stale UI state |
| Median close latency | < 300ms | API response time for close operations |
| p99 close latency | < 2000ms | Tail latency for close operations |
| Close-to-reopen ratio | 3:1 to 10:1 | Healthy ratio; very low ratios may indicate accidental closes |
| Issue age at close (median) | Decreasing over time | Indicates team is resolving issues faster |
| Close-with-comment rate (CLI) | 20-40% | Indicates users are providing closure context |
| Surface distribution | Web 40-50%, CLI 25-35%, TUI 10-20%, Editor 5-10% | Healthy distribution across product surfaces |

## Observability

### Logging Requirements

| Log Level | Event | Structured Fields | Message |
|-----------|-------|-------------------|---------|
| `info` | Issue closed successfully | `owner`, `repo`, `issue_number`, `actor_id`, `closed_at`, `duration_ms` | `Issue closed [owner={o}] [repo={r}] [number={n}] [actor={a}] [duration={d}ms]` |
| `warn` | Close failed — permission denied | `owner`, `repo`, `issue_number`, `actor_id`, `http_status=403` | `Issue close denied [owner={o}] [repo={r}] [number={n}] [actor={a}]` |
| `warn` | Close failed — not found | `owner`, `repo`, `issue_number`, `http_status=404` | `Issue close not found [owner={o}] [repo={r}] [number={n}]` |
| `warn` | Close failed — validation error | `owner`, `repo`, `issue_number`, `state_value`, `http_status=422` | `Issue close validation failed [owner={o}] [repo={r}] [number={n}] [state={s}]` |
| `error` | Close failed — internal error | `owner`, `repo`, `issue_number`, `error`, `stack`, `http_status=500` | `Issue close internal error [owner={o}] [repo={r}] [number={n}] [error={e}]` |
| `debug` | Close request received | `owner`, `repo`, `issue_number`, `request_body` | `Issue close request [owner={o}] [repo={r}] [number={n}]` |
| `debug` | Idempotent close (already closed) | `owner`, `repo`, `issue_number` | `Issue close idempotent [owner={o}] [repo={r}] [number={n}]` |
| `debug` | Repository counter incremented | `repo_id`, `new_count` | `Repo closed issue count incremented [repo_id={id}] [count={c}]` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_close_total` | Counter | `owner`, `repo`, `status` (success, error), `error_type` | Total issue close attempts |
| `codeplane_issue_close_duration_seconds` | Histogram | `owner`, `repo` | Duration of close operations (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_issue_state_transitions_total` | Counter | `owner`, `repo`, `from_state`, `to_state` | State transitions (open→closed, closed→open) |
| `codeplane_repo_closed_issues` | Gauge | `owner`, `repo` | Current count of closed issues per repository |

### Alerts

**Alert: High Issue Close Error Rate**
- **Condition:** `rate(codeplane_issue_close_total{status="error"}[5m]) / rate(codeplane_issue_close_total[5m]) > 0.1` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_issue_close_total` by `error_type` label to identify the dominant error class
  2. If `error_type=server_error` dominates: check database connectivity (`pg_stat_activity`), check for table locks on `issues` or `repositories` tables, check server error logs for stack traces
  3. If `error_type=permission_denied` dominates: verify recent auth/permission changes, check if a deploy changed permission evaluation logic
  4. If `error_type=rate_limited` dominates: check if a single user or automated system is hammering the endpoint; consider per-user rate limit adjustments
  5. Escalate to on-call database engineer if the issue is persistence-layer related

**Alert: Issue Close Latency Spike**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_issue_close_duration_seconds_bucket[5m])) > 5` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check database query performance: `EXPLAIN ANALYZE` the UPDATE query on `issues` table
  2. Check for table bloat or missing indexes on `issues.id` or `issues.repository_id`
  3. Check if `dbIncrementRepoClosedIssueCount` is causing lock contention on the `repositories` table
  4. Check Bun process CPU and memory usage
  5. If contention is on the `repositories` table, consider batching counter updates or using an async counter update pattern

**Alert: Issue Close Endpoint Down**
- **Condition:** `rate(codeplane_issue_close_total[5m]) == 0` for 10 minutes during business hours (when baseline is > 0)
- **Severity:** Critical
- **Runbook:**
  1. Verify the API server is running and healthy (`/api/health`)
  2. Check if the issues route module is mounted (`/api/repos/:owner/:repo/issues/:number` responds to OPTIONS)
  3. Check server startup logs for route registration errors
  4. Check if a recent deploy broke the issues route file
  5. Restart the server process if the route is missing; investigate the root cause in the deploy pipeline

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|------------|-------------|---------------------|----------|
| User not authenticated | 401 | "Authentication required" | User logs in |
| User lacks write access | 403 | "Permission denied" | User requests write access from repo owner |
| Issue not found | 404 | "Issue not found" | User verifies issue number |
| Invalid state value | 422 | "Validation failed: invalid state" | Client sends correct state value |
| Rate limit exceeded | 429 | "Rate limit exceeded. Retry in Ns." | User waits and retries |
| Database connection failure | 500 | "Internal server error" | Ops investigates DB connectivity |
| Repository counter update fails | 500 | "Internal server error" | Counter may be inconsistent; reconciliation job corrects it |
| Concurrent modification race | 200 (idempotent) | No error — last write wins | No user action needed |
| Network timeout (client-side) | N/A | "Network error" | User retries |

## Verification

### API Integration Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| `API-CLOSE-001` | Close an open issue | `PATCH /issues/1` with `{ "state": "closed" }` | 200, `state: "closed"`, `closed_at` is non-null ISO timestamp |
| `API-CLOSE-002` | Close an already-closed issue (idempotent) | Close issue, then `PATCH` with `{ "state": "closed" }` again | 200, `state: "closed"`, `closed_at` preserved (not overwritten) |
| `API-CLOSE-003` | Close with no auth | `PATCH /issues/1` without Authorization header | 401 |
| `API-CLOSE-004` | Close with read-only access | Authenticate as read-only collaborator, `PATCH /issues/1` | 403 |
| `API-CLOSE-005` | Close non-existent issue | `PATCH /issues/99999` with `{ "state": "closed" }` | 404 |
| `API-CLOSE-006` | Close with invalid state value | `PATCH /issues/1` with `{ "state": "done" }` | 422 |
| `API-CLOSE-007` | Close with empty state value | `PATCH /issues/1` with `{ "state": "" }` | 422 |
| `API-CLOSE-008` | Close with null state value | `PATCH /issues/1` with `{ "state": null }` | 200 (no-op, state unchanged) or 422 |
| `API-CLOSE-009` | Close with uppercase state | `PATCH /issues/1` with `{ "state": "CLOSED" }` | 200, `state: "closed"` (normalized) |
| `API-CLOSE-010` | Close with whitespace-padded state | `PATCH /issues/1` with `{ "state": " closed " }` | 200, `state: "closed"` (trimmed) |
| `API-CLOSE-011` | Close with empty body | `PATCH /issues/1` with `{}` | 200, issue unchanged |
| `API-CLOSE-012` | Close and update title simultaneously | `PATCH /issues/1` with `{ "state": "closed", "title": "New title" }` | 200, both state and title updated |
| `API-CLOSE-013` | Verify `closed_at` format | Close issue, inspect `closed_at` | ISO 8601 format with timezone |
| `API-CLOSE-014` | Verify `updated_at` changes on close | Record `updated_at`, close issue, compare | `updated_at` is more recent than before |
| `API-CLOSE-015` | Verify repository closed count increments | Get repo before close (count=N), close issue, get repo after | `num_closed_issues` is N+1 |
| `API-CLOSE-016` | Verify closing already-closed issue does not change counter | Close issue (count=N+1), close again | `num_closed_issues` is still N+1 |
| `API-CLOSE-017` | Close issue with maximum valid issue number | Create issue at high number, close it | 200, issue closed successfully |
| `API-CLOSE-018` | Close with non-integer issue number | `PATCH /issues/abc` | 400 or 404 |
| `API-CLOSE-019` | Close with negative issue number | `PATCH /issues/-1` | 400 or 404 |
| `API-CLOSE-020` | Close with zero issue number | `PATCH /issues/0` | 400 or 404 |
| `API-CLOSE-021` | Close with very large issue number | `PATCH /issues/2147483648` | 404 (overflow) or 400 |
| `API-CLOSE-022` | Rate limit enforcement | Send 61 close requests in 60 seconds | 61st request returns 429 with `Retry-After` header |
| `API-CLOSE-023` | Verify issue event created on close | Close issue, `GET /issues/1/events` | Contains event with `event_type` indicating state change |
| `API-CLOSE-024` | Close issue as repo owner | Authenticate as owner, close | 200 |
| `API-CLOSE-025` | Close issue as org admin | Authenticate as org admin, close issue on org repo | 200 |
| `API-CLOSE-026` | Close issue as team member with write | Authenticate as team write member, close | 200 |
| `API-CLOSE-027` | Content-Type enforcement | `PATCH /issues/1` with `text/plain` content-type | 415 or 400 |

### CLI E2E Tests

| Test ID | Description | Command | Expected |
|---------|-------------|---------|----------|
| `CLI-CLOSE-001` | Close an open issue | `codeplane issue close 1 --repo owner/repo` | Exit 0, output contains "Closed issue #1" |
| `CLI-CLOSE-002` | Close with JSON output | `codeplane issue close 1 --repo owner/repo --json` | Exit 0, valid JSON with `state: "closed"` |
| `CLI-CLOSE-003` | Close with comment | `codeplane issue close 1 --repo owner/repo --comment "Fixed in change abc"` | Exit 0, comment created, issue closed |
| `CLI-CLOSE-004` | Close non-existent issue | `codeplane issue close 99999 --repo owner/repo` | Exit non-zero, error message contains "not found" |
| `CLI-CLOSE-005` | Close without auth | `codeplane issue close 1 --repo owner/repo` (no token) | Exit non-zero, error message contains authentication error |
| `CLI-CLOSE-006` | Close with invalid number | `codeplane issue close abc --repo owner/repo` | Exit non-zero, validation error |
| `CLI-CLOSE-007` | Close already-closed issue | Close issue, then close again | Exit 0, idempotent (issue remains closed) |
| `CLI-CLOSE-008` | Verify state after close via view | `codeplane issue close 1` then `codeplane issue view 1 --json` | `state: "closed"`, `closed_at` non-null |
| `CLI-CLOSE-009` | Close and verify in filtered list | `codeplane issue close 1` then `codeplane issue list --state closed --json` | Issue #1 appears in closed list |
| `CLI-CLOSE-010` | Close multiple issues sequentially | Close issues 1-5, then `codeplane issue list --state closed --json` | All 5 issues show `state: "closed"` |

### TUI E2E Tests

| Test ID | Description | Key Sequence | Expected |
|---------|-------------|-------------|----------|
| `TUI-CLOSE-001` | Close issue from list | Focus open issue → `x` | State icon turns red, status bar shows "Issue #N closed" |
| `TUI-CLOSE-002` | Reopen issue from list | Focus closed issue → `x` | State icon turns green, status bar shows "Issue #N reopened" |
| `TUI-CLOSE-003` | Close issue from detail | Navigate to open issue detail → `o` | Badge changes to `[closed]`, timeline event appears |
| `TUI-CLOSE-004` | Rapid double-press ignored | Focus issue → `x` `x` (< 100ms) | Only one API call made |
| `TUI-CLOSE-005` | Permission denied revert | Read-only user → `x` | Icon reverts, "Permission denied" in status bar |
| `TUI-CLOSE-006` | 404 revert | Deleted issue → `x` | Icon reverts, "Issue not found" in status bar |
| `TUI-CLOSE-007` | Error message auto-dismiss | `x` on 403 → wait 3s | Error message disappears |
| `TUI-CLOSE-008` | Close preserves focus | Focus 5th issue → `x` | 5th row still focused after action |
| `TUI-CLOSE-009` | Total count updates | List shows "Issues (10)" → close | Count becomes "Issues (9)" when filtered to "open" |
| `TUI-CLOSE-010` | Close from list, verify on detail | `x` on list → Enter → detail | Badge shows `[closed]` |
| `TUI-CLOSE-011` | Close at 80×24 | Set terminal to 80×24 → `x` | Truncated status message "#N closed" |
| `TUI-CLOSE-012` | Close at 200×60 | Set terminal to 200×60 → `x` | Extended status message "Issue #N closed successfully" |

### Web UI (Playwright) E2E Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `WEB-CLOSE-001` | Close issue via button | Navigate to open issue detail → click "Close issue" → state badge changes to `Closed`, timeline event appears |
| `WEB-CLOSE-002` | Close with comment | Type comment → click "Close with comment" → comment posted and issue closed |
| `WEB-CLOSE-003` | Closed issue appears in filtered list | Close issue → navigate to issue list → filter "Closed" → issue visible |
| `WEB-CLOSE-004` | Close button hidden for read-only user | Log in as read-only → navigate to issue detail → "Close issue" button not present or disabled |
| `WEB-CLOSE-005` | Closed badge styling | Close issue → verify badge text is "Closed" with correct color |
| `WEB-CLOSE-006` | `closed_at` timestamp displayed | Close issue → verify timestamp appears in issue metadata |
| `WEB-CLOSE-007` | Close issue and verify reopen button appears | Close issue → "Close issue" button replaced by "Reopen issue" button |
| `WEB-CLOSE-008` | Issue count updates in list tabs | Note open/closed counts → close issue → counts update (open -1, closed +1) |

### Workflow Trigger Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `WF-CLOSE-001` | `on.issue.closed()` trigger fires on close | Define workflow with `on.issue.closed()` → close issue → workflow run created |
| `WF-CLOSE-002` | `on.issue.closed()` does not fire on reopen | Define workflow with `on.issue.closed()` → reopen issue → no workflow run created |
| `WF-CLOSE-003` | Workflow receives correct issue context | Close issue → workflow receives issue number, repo, actor |

### Webhook Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `HOOK-CLOSE-001` | Webhook delivery on close | Subscribe to issue events → close issue → webhook delivery received with `action: "closed"` |
| `HOOK-CLOSE-002` | Webhook payload includes issue data | Close issue → webhook payload contains `issue.state: "closed"`, `issue.closed_at`, `sender` |

# ISSUE_PIN

Specification for ISSUE_PIN.

## High-Level User POV

When a repository has active issues that are especially important — a known outage, a critical bug blocking a release, an ongoing RFC that the team needs to reference daily — maintainers need a way to elevate those issues above the normal chronological list so that every visitor sees them immediately. Issue pinning gives repository maintainers the ability to promote a small number of issues to the top of the issue list, where they remain visible regardless of sorting, filtering, or pagination.

Pinning an issue is a lightweight, reversible action. A maintainer visits an issue and pins it; the issue immediately appears in a dedicated "Pinned" section at the top of the repository's issue list. Multiple issues can be pinned simultaneously, and maintainers can reorder pinned issues to reflect changing priorities — the most critical issue can always be first. When an issue is no longer urgent, the maintainer unpins it and the issue returns to its normal position in the list without losing any data or history.

Pinned issues are visible to everyone who can see the repository. Whether a developer is scanning the issue list on the web, running `codeplane issue list` from the terminal, browsing in the TUI, or checking the VS Code sidebar, pinned issues appear prominently at the top. This consistency ensures that the team's signal about what matters right now reaches every contributor regardless of their preferred tool.

The pin action also fires downstream automation. Workflow definitions listening for issue pin events will trigger, webhooks subscribed to issue events receive a delivery, and the issue's timeline records who pinned or unpinned it and when. This means pinning is not just a visual affordance — it is a product event that can drive alerts, dashboards, and agent-driven triage workflows.

From the web UI, pinning is a one-click action in the issue detail sidebar or via the issue's context menu on the list. From the CLI, it is `codeplane issue pin <number>` and `codeplane issue unpin <number>`. From the TUI, it is a single keypress on a focused issue. Regardless of surface, the result is identical: the issue joins the pinned set, its position is tracked, and all downstream events fire.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access can pin an open or closed issue from the web UI, CLI, TUI, and API
- [ ] A user with write access can unpin a pinned issue from the web UI, CLI, TUI, and API
- [ ] Pinned issues appear in a dedicated "Pinned" section at the top of the issue list on all client surfaces
- [ ] Pinned issues retain their position ordering; maintainers can reorder them
- [ ] The pin action records which user performed it and when
- [ ] Pinning an already-pinned issue is idempotent — returns success without creating a duplicate
- [ ] Unpinning an already-unpinned issue is idempotent — returns success without error
- [ ] A repository may have at most **6** pinned issues at any time
- [ ] An issue event record is created to capture the pin/unpin action in the issue timeline
- [ ] A workflow trigger on `issue.pinned` fires when an issue is pinned
- [ ] A workflow trigger on `issue.unpinned` fires when an issue is unpinned
- [ ] Webhooks subscribed to issue events receive a delivery when an issue is pinned or unpinned
- [ ] Notification fanout sends a notification to repository watchers when an issue is pinned
- [ ] The API returns the full updated issue response body including the `pinned` boolean after pin/unpin
- [ ] The pinned issues list endpoint returns issues ordered by their pin position
- [ ] Deleting a pinned issue automatically removes it from the pinned set
- [ ] Transferring or archiving a repository preserves the pinned issue set

### Input Constraints

- [ ] Issue number must be a positive integer (1 to 2,147,483,647)
- [ ] Issue number must reference an existing issue in the specified repository
- [ ] The `owner` and `repo` path parameters must reference an existing, non-archived repository
- [ ] Pin position (when provided for reorder) must be a positive integer between 1 and 6 inclusive
- [ ] Pin position values must be unique within the repository's pinned set — the server normalizes positions on reorder

### Edge Cases

- [ ] Pinning an already-pinned issue returns 200 with current state (idempotent, no duplicate row, position unchanged)
- [ ] Unpinning an issue that is not pinned returns 200 with current state (idempotent)
- [ ] Pinning a 7th issue when 6 are already pinned returns 422 with a clear error message: "Maximum of 6 pinned issues per repository"
- [ ] Pinning a deleted or concurrently-deleted issue returns 404
- [ ] Pinning an issue on an archived repository returns 403
- [ ] Unpinning one issue from a full set of 6 then pinning a new one succeeds
- [ ] Pinning both open and closed issues is allowed (closed issues can be pinned)
- [ ] Reordering pinned issues with a position that exceeds the current count clamps to the last position
- [ ] Reordering with position 0 or negative returns 422
- [ ] Concurrent pin requests for the same issue from two users: one succeeds, the other is idempotent
- [ ] Concurrent pin requests for different issues that would exceed the 6-limit: one succeeds, the other returns 422
- [ ] Pinning an issue with Unicode characters in the title does not corrupt the response
- [ ] Request body with unknown fields is ignored (no error for extra properties)
- [ ] Empty request body on the pin endpoint is accepted (no body required)
- [ ] Deleting a pinned issue causes subsequent list-pinned calls to exclude it (no dangling references)
- [ ] After unpinning an issue, the remaining pinned issues' positions are compacted (no gaps)

### Boundary Constraints

- [ ] Maximum pinned issues per repository: **6**
- [ ] Minimum pinned issues per repository: **0**
- [ ] Position field: integer, 1-indexed, range 1–6
- [ ] `pinned_at` timestamp format: ISO 8601 with timezone
- [ ] `pinned` boolean field on issue response: `true` when pinned, `false` when not pinned
- [ ] `pin_position` field on issue response: integer when pinned, `null` when not pinned
- [ ] The `pinned_by` field on pinned issue entries: `{ id, login }` object or `null` if the pinning user has been deleted

## Design

### API Shape

**Pin an Issue**

```
POST /api/repos/:owner/:repo/issues/:number/pin
```

No request body required.

Response `200 OK`:
```json
{
  "id": 12345,
  "number": 42,
  "title": "Known issue: SSE reconnections failing on eu-west",
  "body": "...",
  "state": "open",
  "pinned": true,
  "pin_position": 3,
  "author": { "id": 1, "login": "alice" },
  "assignees": [],
  "labels": [{ "id": 10, "name": "incident", "color": "d73a4a", "description": "Active incident" }],
  "milestone_id": null,
  "comment_count": 12,
  "closed_at": null,
  "created_at": "2026-03-20T10:30:00Z",
  "updated_at": "2026-03-22T14:15:00Z"
}
```

Error Responses:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | No authentication | `{ "message": "Authentication required" }` |
| 403 | Authenticated but no write access | `{ "message": "Forbidden" }` |
| 403 | Repository is archived | `{ "message": "Repository is archived" }` |
| 404 | Issue or repository not found | `{ "message": "Not found" }` |
| 422 | Maximum pinned issues reached | `{ "message": "Validation failed", "errors": [{ "resource": "Issue", "field": "pinned", "code": "limit_reached", "message": "Maximum of 6 pinned issues per repository" }] }` |
| 429 | Rate limit exceeded | `{ "message": "Rate limit exceeded" }` with `Retry-After` header |

**Unpin an Issue**

```
POST /api/repos/:owner/:repo/issues/:number/unpin
```

No request body required.

Response `200 OK`: Full `IssueResponse` with `"pinned": false` and `"pin_position": null`.

Error Responses:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | No authentication | `{ "message": "Authentication required" }` |
| 403 | No write access or archived repo | `{ "message": "Forbidden" }` |
| 404 | Issue or repository not found | `{ "message": "Not found" }` |
| 429 | Rate limit exceeded | `{ "message": "Rate limit exceeded" }` with `Retry-After` header |

**List Pinned Issues**

```
GET /api/repos/:owner/:repo/issues/pinned
```

Response `200 OK`:
```json
[
  {
    "id": 12345,
    "number": 42,
    "title": "Known issue: SSE reconnections failing on eu-west",
    "state": "open",
    "pinned": true,
    "pin_position": 1,
    "author": { "id": 1, "login": "alice" },
    "labels": [{ "id": 10, "name": "incident", "color": "d73a4a", "description": "Active incident" }],
    "comment_count": 12,
    "created_at": "2026-03-20T10:30:00Z",
    "updated_at": "2026-03-22T14:15:00Z"
  }
]
```

Always returns an array ordered by `pin_position` ascending. Empty array `[]` when no issues are pinned.

**Reorder Pinned Issues**

```
PATCH /api/repos/:owner/:repo/issues/pinned
Content-Type: application/json

{ "issues": [42, 55, 10] }
```

The `issues` array contains issue numbers in the desired display order. Server assigns positions 1, 2, 3, ... based on array index. All provided issue numbers must be currently pinned. Pinned issues not in the array retain relative ordering after specified issues.

Response `200 OK`: Array of pinned issues in new order.

Error Responses:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | No authentication | `{ "message": "Authentication required" }` |
| 403 | No write access | `{ "message": "Forbidden" }` |
| 422 | Issue not in pinned set | `{ "message": "Validation failed", "errors": [{ "resource": "Issue", "field": "issues", "code": "invalid", "message": "Issue #N is not pinned" }] }` |
| 422 | Empty issues array | `{ "message": "Validation failed", "errors": [{ "resource": "Issue", "field": "issues", "code": "invalid", "message": "Issues array must not be empty" }] }` |
| 422 | Duplicate issue numbers | `{ "message": "Validation failed", "errors": [{ "resource": "Issue", "field": "issues", "code": "invalid", "message": "Duplicate issue numbers" }] }` |

### SDK Shape

The `IssueService` in `@codeplane/sdk` provides the authoritative service methods:

```typescript
pinIssue(actor: User, owner: string, repo: string, number: number): Promise<Issue>
```

When called:
1. Resolve the repository by owner/name; 404 if not found
2. Verify the actor has write access; 403 if denied
3. Verify the repository is not archived; 403 if archived
4. Resolve the issue by number; 404 if not found
5. Check if the issue is already pinned; if so, return current state (idempotent)
6. Count current pinned issues for this repo; 422 if count >= 6
7. Assign position = current count + 1
8. Insert into `pinned_issues` with `repository_id`, `issue_id`, `pinned_by_id`, `position`
9. Create an issue event (`pinned`) for the timeline
10. Emit downstream events (workflow trigger, webhook, notification)
11. Return the full issue with `pinned: true` and `pin_position`

```typescript
unpinIssue(actor: User, owner: string, repo: string, number: number): Promise<Issue>
```

When called:
1. Resolve repository and issue; 404 if not found
2. Verify write access; 403 if denied
3. Check if the issue is pinned; if not, return current state (idempotent)
4. Delete the `pinned_issues` row
5. Compact remaining positions (close gaps)
6. Create an issue event (`unpinned`) for the timeline
7. Emit downstream events
8. Return the full issue with `pinned: false` and `pin_position: null`

```typescript
listPinnedIssues(actor: User | null, owner: string, repo: string): Promise<Issue[]>
reorderPinnedIssues(actor: User, owner: string, repo: string, issueNumbers: number[]): Promise<Issue[]>
```

### Web UI Design

**Issue List Page — Pinned Section:**

When a repository has pinned issues, a "Pinned" section appears at the top of the issue list page, above the filter bar and issue rows.

- Displays pinned issues as compact cards showing: issue number, title (truncated to one line), state badge (open/closed), label chips (up to 3, with "+N more" overflow), and comment count icon
- Cards ordered by pin position (1 = first/left, ascending)
- Small pin icon appears on each card
- On hover, each card shows a subtle "Unpin" action (write-access users only)
- Section header reads "Pinned" with count badge (e.g., "Pinned · 3")
- When no issues are pinned, section is hidden entirely
- On mobile/narrow viewports, pinned cards stack vertically

**Issue List Page — Pinned Issues in Main List:**

Pinned issues also appear in the normal issue list at their chronological position. They show a small pin icon next to the issue number.

**Issue Detail Page — Pin Action:**

- Sidebar includes "Pin issue" / "Unpin issue" action (write-access only)
- When pinned, a pin badge appears in issue header: "📌 Pinned #2"
- Pin/unpin available in "..." dropdown menu
- Timeline event: "@username pinned this just now" / "@username unpinned this just now"

**Drag-and-Drop Reorder:**

- Users with write access can drag pinned cards to reorder
- Drag handle appears on hover
- Drop-target indicator shows new position
- Optimistic reorder; reverts on error
- Toast confirms "Pinned issues reordered" or shows error

### CLI Command

**Pin:**
```bash
codeplane issue pin <number> [--repo OWNER/REPO]
```
Output: `Pinned issue #42: Known issue: SSE reconnections failing on eu-west`
JSON output (`--json`): Full `IssueResponse` with `pinned: true`.

**Unpin:**
```bash
codeplane issue unpin <number> [--repo OWNER/REPO]
```
Output: `Unpinned issue #42: Known issue: SSE reconnections failing on eu-west`

**List pinned:**
```bash
codeplane issue list --pinned [--repo OWNER/REPO]
```
Output: Formatted list of pinned issues with position, number, title, state, and labels.

**Error output:**
```
Error: Maximum of 6 pinned issues per repository (422)
Error: Permission denied (403)
Error: Issue not found (404)
Error: Invalid issue number
```

### TUI UI

**Issue List Screen:**
- Keybinding: `p` toggles pin/unpin
- Pin indicator: `📌` prefix on pinned issues
- Pinned issues grouped at top under separator
- Optimistic update with revert on error
- Status bar: "Pinned issue #N" / "Unpinned issue #N" / "Max 6 pinned issues" for 3 seconds
- In-flight guard: key disabled during pending mutation

**Issue Detail Screen:**
- Keybinding: `p` toggles pin/unpin
- Pin badge: `[pinned #2]` in header
- Timeline event on pin/unpin
- Hints: `p:pin` ↔ `p:unpin`

### Editor Integrations

**VS Code:**
- Pin icon in issue browser tree view for pinned issues
- Collapsible "Pinned" section at top of issue tree
- Pin/unpin via right-click context menu and command palette
- State updates on tree refresh

**Neovim:**
- `CodeplaneIssuePin <number>` and `CodeplaneIssueUnpin <number>` commands
- Telescope picker shows `📌` prefix for pinned issues
- Pinned issues first in Telescope results

### Documentation

1. **Web UI Guide: "Pinning Important Issues"** — Walkthrough of pin action, pinned section, drag-reorder, and unpinning with screenshots
2. **CLI Reference: `issue pin`** — Syntax, options, examples, errors
3. **CLI Reference: `issue unpin`** — Syntax, options, examples, errors
4. **CLI Reference: `issue list --pinned`** — Filtering for pinned issues
5. **TUI Reference: Issue Keyboard Shortcuts** — `p` keybinding documentation
6. **API Reference: POST /api/repos/:owner/:repo/issues/:number/pin** — Full request/response/error schema
7. **API Reference: POST /api/repos/:owner/:repo/issues/:number/unpin** — Full request/response/error schema
8. **API Reference: GET /api/repos/:owner/:repo/issues/pinned** — Response schema and ordering
9. **API Reference: PATCH /api/repos/:owner/:repo/issues/pinned** — Reorder request/response schema
10. **Workflows: Issue Pin Event Triggers** — `on.issue.pinned()` and `on.issue.unpinned()` usage

## Permissions & Security

### Authorization Roles

| Role | Can Pin/Unpin | Can Reorder | Can View Pinned | Notes |
|------|--------------|-------------|-----------------|-------|
| Repository Owner | ✅ | ✅ | ✅ | Full permissions |
| Org Admin | ✅ | ✅ | ✅ | Organization-level authority |
| Team Member (write) | ✅ | ✅ | ✅ | Team-assigned write permission |
| Collaborator (write) | ✅ | ✅ | ✅ | Explicitly added with write role |
| Collaborator (read-only) | ❌ | ❌ | ✅ | Can view pinned issues but cannot modify. Pin/unpin returns 403 |
| Authenticated (no repo access) | ❌ | ❌ | ✅ (public repos) | Can see pinned issues on public repos. Pin/unpin returns 403 |
| Anonymous / Unauthenticated | ❌ | ❌ | ✅ (public repos) | Can see pinned on public repos. Pin/unpin returns 401 |

### Rate Limiting

- The `POST /api/repos/:owner/:repo/issues/:number/pin` endpoint is rate-limited at **30 requests per minute** per authenticated user (lower than general issue mutations because pin is an administrative action)
- The `POST /api/repos/:owner/:repo/issues/:number/unpin` endpoint shares the same 30/min rate limit bucket
- The `PATCH /api/repos/:owner/:repo/issues/pinned` (reorder) endpoint is rate-limited at **20 requests per minute** per authenticated user
- The `GET /api/repos/:owner/:repo/issues/pinned` (list) endpoint follows the standard read rate limit (300/min)
- A 429 response includes a `Retry-After` header with the number of seconds to wait
- The in-flight guard in the TUI provides natural client-side rate limiting (max 1 in-flight request at a time)
- The CLI and TUI display the retry-after value to the user on 429

### Data Privacy

- Pin/unpin events do not expose PII beyond the actor's username (which is already public in the issue context)
- The `pinned_by` user is visible to anyone who can view the issue — this is intentional, as pinning is an administrative action and its provenance should be transparent
- The `pinned_at` timestamp is publicly visible to anyone who can view the issue
- Auth tokens are never logged, displayed in status bars, or included in telemetry events
- Webhook deliveries include the actor's username but not their auth credentials

### Input Sanitization

- The pin and unpin endpoints accept no user-controlled text input (no body required)
- Issue numbers are validated as positive integers; non-numeric values are rejected before reaching the database
- The reorder endpoint validates that the `issues` array contains only positive integers, has no duplicates, is non-empty, and has length ≤ 6
- The reorder endpoint validates all provided issue numbers are currently in the pinned set before modifying positions

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.pinned` | Issue transitions from unpinned to pinned | `owner`, `repo`, `issue_number`, `issue_state` ("open"/"closed"), `actor_id`, `actor_login`, `surface` ("api" | "web" | "cli" | "tui" | "vscode" | "nvim"), `pin_position`, `total_pinned_count` (after pin), `issue_age_hours` (hours since creation), `label_count`, `duration_ms` |
| `issue.unpinned` | Issue transitions from pinned to unpinned | `owner`, `repo`, `issue_number`, `issue_state`, `actor_id`, `actor_login`, `surface`, `previous_position`, `total_pinned_count` (after unpin), `pin_duration_hours` (how long it was pinned), `duration_ms` |
| `issue.pin.reordered` | Pinned issues reordered | `owner`, `repo`, `actor_id`, `actor_login`, `surface`, `total_pinned_count`, `positions_changed` (number of issues that moved), `duration_ms` |
| `issue.pin.error` | Pin/unpin attempt fails | `owner`, `repo`, `issue_number`, `surface`, `http_status`, `error_type` ("permission_denied" | "not_found" | "rate_limited" | "limit_reached" | "server_error" | "network_error"), `actor_id` |
| `issue.pin.idempotent` | Pin/unpin attempted on issue already in target state | `owner`, `repo`, `issue_number`, `surface`, `actor_id`, `action` ("pin" | "unpin") |

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Pin success rate | > 97% | Percentage of pin attempts that succeed on first try |
| Unpin success rate | > 99% | Percentage of unpin attempts that succeed (no limit constraint) |
| Limit-reached error rate | < 8% | Percentage of pin attempts hitting the 6-issue cap — very high rates suggest the limit is too low |
| Permission error rate | < 3% | Percentage of pin attempts resulting in 403 — high rates indicate UX confusion about who can pin |
| Idempotent pin rate | < 10% | Percentage of pin attempts on already-pinned issues — high rates indicate stale UI state |
| Median pin latency | < 200ms | API response time for pin operations |
| p99 pin latency | < 1500ms | Tail latency for pin operations |
| Average pinned issues per active repo | 1.5 – 3.0 | Healthy adoption; very low indicates underuse, very high indicates overuse |
| Median pin duration (hours) | 24 – 168 | Healthy churn; very short may indicate misuse, very long may indicate stale pins |
| Repos with ≥1 pinned issue (% of active repos) | > 15% after 90 days | Adoption breadth target |
| Reorder frequency per pin/unpin | 0.1 – 0.5 | Low reorder-to-pin ratio is healthy |
| Surface distribution | Web 50-60%, CLI 20-30%, TUI 5-15%, Editor 5-10% | Web-heavy because pinning is often a visual triage action |

## Observability

### Logging Requirements

| Log Level | Event | Structured Fields | Message |
|-----------|-------|-------------------|--------|
| `info` | Issue pinned successfully | `owner`, `repo`, `issue_number`, `actor_id`, `pin_position`, `total_pinned`, `duration_ms` | `Issue pinned [owner={o}] [repo={r}] [number={n}] [actor={a}] [position={p}] [total={t}] [duration={d}ms]` |
| `info` | Issue unpinned successfully | `owner`, `repo`, `issue_number`, `actor_id`, `previous_position`, `total_pinned`, `duration_ms` | `Issue unpinned [owner={o}] [repo={r}] [number={n}] [actor={a}] [prev_position={p}] [total={t}] [duration={d}ms]` |
| `info` | Pinned issues reordered | `owner`, `repo`, `actor_id`, `positions_changed`, `duration_ms` | `Pinned issues reordered [owner={o}] [repo={r}] [actor={a}] [changed={c}] [duration={d}ms]` |
| `warn` | Pin failed — permission denied | `owner`, `repo`, `issue_number`, `actor_id`, `http_status=403` | `Issue pin denied [owner={o}] [repo={r}] [number={n}] [actor={a}]` |
| `warn` | Pin failed — limit reached | `owner`, `repo`, `issue_number`, `actor_id`, `current_count=6`, `http_status=422` | `Issue pin limit reached [owner={o}] [repo={r}] [number={n}] [actor={a}] [current=6]` |
| `warn` | Pin failed — not found | `owner`, `repo`, `issue_number`, `http_status=404` | `Issue pin not found [owner={o}] [repo={r}] [number={n}]` |
| `error` | Pin failed — internal error | `owner`, `repo`, `issue_number`, `error`, `stack`, `http_status=500` | `Issue pin internal error [owner={o}] [repo={r}] [number={n}] [error={e}]` |
| `debug` | Pin request received | `owner`, `repo`, `issue_number` | `Issue pin request [owner={o}] [repo={r}] [number={n}]` |
| `debug` | Idempotent pin (already pinned) | `owner`, `repo`, `issue_number` | `Issue pin idempotent [owner={o}] [repo={r}] [number={n}]` |
| `debug` | Idempotent unpin (not pinned) | `owner`, `repo`, `issue_number` | `Issue unpin idempotent [owner={o}] [repo={r}] [number={n}]` |
| `debug` | Position compaction after unpin | `repo_id`, `compacted_count` | `Pinned positions compacted [repo_id={id}] [compacted={c}]` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_pin_total` | Counter | `owner`, `repo`, `action` (pin, unpin, reorder), `status` (success, error), `error_type` | Total issue pin/unpin/reorder attempts |
| `codeplane_issue_pin_duration_seconds` | Histogram | `owner`, `repo`, `action` | Duration of pin/unpin/reorder operations (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_repo_pinned_issues` | Gauge | `owner`, `repo` | Current count of pinned issues per repository |
| `codeplane_issue_pin_limit_rejections_total` | Counter | `owner`, `repo` | Total pin attempts rejected due to the 6-issue limit |

### Alerts

**Alert: High Issue Pin Error Rate**
- **Condition:** `rate(codeplane_issue_pin_total{status="error"}[5m]) / rate(codeplane_issue_pin_total[5m]) > 0.15` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_issue_pin_total` by `error_type` label to identify the dominant error class
  2. If `error_type=server_error` dominates: check database connectivity (`pg_stat_activity`), check for table locks on `pinned_issues` table, check server error logs for stack traces with `grep "Issue pin internal error"` in structured logs
  3. If `error_type=limit_reached` dominates: this is user-facing and not an infrastructure problem — verify the limit is correctly enforced as 6, consider whether product needs to increase the limit
  4. If `error_type=permission_denied` dominates: verify recent auth/permission changes, check if a deploy changed write-access evaluation logic
  5. Check if the error rate is concentrated in a single repository or user — may indicate a targeted abuse pattern
  6. Escalate to on-call database engineer if the issue is persistence-layer related

**Alert: Issue Pin Latency Spike**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_issue_pin_duration_seconds_bucket[5m])) > 3` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check database query performance: `EXPLAIN ANALYZE` the INSERT/DELETE queries on `pinned_issues` table
  2. Check for missing indexes on `pinned_issues(repository_id, issue_id)` — there should be a composite primary key or unique index
  3. Check if position compaction (gap-closing after unpin) is causing sequential updates — verify it uses a single UPDATE with a window function rather than N individual updates
  4. Check for lock contention on the `pinned_issues` table from concurrent pin/unpin operations
  5. Check Bun process CPU and memory usage
  6. If the compaction step is the bottleneck, consider deferring compaction to an async background task

**Alert: Pinned Issues Gauge Anomaly**
- **Condition:** `codeplane_repo_pinned_issues > 6` for any repository for 1 minute
- **Severity:** Critical
- **Runbook:**
  1. This indicates a constraint violation — more than 6 issues are pinned for a single repo
  2. Query the `pinned_issues` table directly: `SELECT repository_id, COUNT(*) FROM pinned_issues GROUP BY repository_id HAVING COUNT(*) > 6`
  3. Identify the offending repository and check recent pin operations in logs
  4. Check for a race condition in the pin endpoint — the count-then-insert pattern may not be properly serialized
  5. Manually unpin excess issues to restore the invariant
  6. File a P1 bug to add a database-level CHECK constraint or use a serializable transaction for the pin operation

**Alert: Issue Pin Endpoint Down**
- **Condition:** `rate(codeplane_issue_pin_total[5m]) == 0` for 10 minutes during business hours (when baseline is > 0)
- **Severity:** Critical
- **Runbook:**
  1. Verify the API server is running and healthy (`/api/health`)
  2. Check if the issues route module is mounted (test with `curl -X POST /api/repos/test/test/issues/1/pin`)
  3. Check server startup logs for route registration errors
  4. Check if a recent deploy removed or broke the pin route handlers
  5. Restart the server process if the route is missing; investigate the root cause in the deploy pipeline

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|------------|-------------|---------------------|----------|
| User not authenticated | 401 | "Authentication required" | User logs in |
| User lacks write access | 403 | "Permission denied" | User requests write access from repo owner |
| Repository is archived | 403 | "Repository is archived" | User unarchives the repo or contacts admin |
| Issue not found | 404 | "Issue not found" | User verifies issue number |
| Repository not found | 404 | "Not found" | User verifies owner/repo path |
| Maximum pinned issues (6) | 422 | "Maximum of 6 pinned issues per repository" | User unpins an existing issue before pinning a new one |
| Invalid issue number in reorder | 422 | "Issue #N is not pinned" | User provides only currently-pinned issue numbers |
| Empty reorder array | 422 | "Issues array must not be empty" | User provides at least one issue number |
| Duplicate numbers in reorder | 422 | "Duplicate issue numbers" | User removes duplicates |
| Rate limit exceeded | 429 | "Rate limit exceeded. Retry in Ns." | User waits and retries |
| Database connection failure | 500 | "Internal server error" | Ops investigates DB connectivity |
| Unique constraint violation (race) | 200 (idempotent) | No error — treated as already-pinned | No user action needed |
| Network timeout (client-side) | N/A | "Network error" | User retries |

## Verification

### API Integration Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| `API-PIN-001` | Pin an unpinned issue | `POST /issues/1/pin` | 200, `pinned: true`, `pin_position` is integer ≥ 1 |
| `API-PIN-002` | Pin an already-pinned issue (idempotent) | Pin issue 1, then `POST /issues/1/pin` again | 200, `pinned: true`, `pin_position` unchanged |
| `API-PIN-003` | Pin with no auth | `POST /issues/1/pin` without Authorization header | 401 |
| `API-PIN-004` | Pin with read-only access | Authenticate as read-only collaborator, `POST /issues/1/pin` | 403 |
| `API-PIN-005` | Pin non-existent issue | `POST /issues/99999/pin` | 404 |
| `API-PIN-006` | Pin issue on non-existent repo | `POST /nonexistent/repo/issues/1/pin` | 404 |
| `API-PIN-007` | Pin issue on archived repo | Archive repo, then `POST /issues/1/pin` | 403 |
| `API-PIN-008` | Pin 6 issues (max limit) | Pin issues 1 through 6 sequentially | All return 200, all pinned |
| `API-PIN-009` | Pin 7th issue (exceeds limit) | Pin 6 issues, then `POST /issues/7/pin` | 422 with "Maximum of 6 pinned issues" message |
| `API-PIN-010` | Pin, unpin one, pin new (limit recovery) | Pin 6, unpin issue 3, pin issue 7 | Unpin returns 200, new pin returns 200 |
| `API-PIN-011` | Pin a closed issue | Close issue 1, then `POST /issues/1/pin` | 200, `pinned: true`, `state: "closed"` |
| `API-PIN-012` | Verify position assignment is sequential | Pin issues 1, 2, 3 in order | Positions are 1, 2, 3 respectively |
| `API-PIN-013` | Pin with non-integer issue number | `POST /issues/abc/pin` | 400 or 404 |
| `API-PIN-014` | Pin with negative issue number | `POST /issues/-1/pin` | 400 or 404 |
| `API-PIN-015` | Pin with zero issue number | `POST /issues/0/pin` | 400 or 404 |
| `API-PIN-016` | Pin with very large issue number | `POST /issues/2147483648/pin` | 404 or 400 |
| `API-PIN-017` | Pin as repo owner | Authenticate as owner, pin | 200 |
| `API-PIN-018` | Pin as org admin | Authenticate as org admin, pin issue on org repo | 200 |
| `API-PIN-019` | Pin as team member with write | Authenticate as team write member, pin | 200 |
| `API-PIN-020` | Verify `updated_at` changes on pin | Record `updated_at`, pin issue, compare | `updated_at` is more recent |
| `API-PIN-021` | Rate limit enforcement | Send 31 pin requests in 60 seconds | 31st request returns 429 with `Retry-After` header |
| `API-PIN-022` | Pin with request body (ignored) | `POST /issues/1/pin` with body `{ "position": 99 }` | 200, body ignored, position assigned normally |
| `API-PIN-023` | Pin issue with Unicode title | Create issue with title "修复 SSE 重连 🐛", pin it | 200, title preserved correctly |
| `API-PIN-024` | Content-Type not required for pin | `POST /issues/1/pin` without Content-Type header | 200 (no body needed) |
| `API-PIN-025` | Verify issue event created on pin | Pin issue, `GET /issues/1/events` | Contains event with `event_type: "pinned"` |

### API Unpin Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| `API-UNPIN-001` | Unpin a pinned issue | `POST /issues/1/unpin` | 200, `pinned: false`, `pin_position: null` |
| `API-UNPIN-002` | Unpin an already-unpinned issue (idempotent) | `POST /issues/1/unpin` on unpinned issue | 200, `pinned: false` |
| `API-UNPIN-003` | Unpin with no auth | `POST /issues/1/unpin` without Authorization header | 401 |
| `API-UNPIN-004` | Unpin with read-only access | Authenticate as read-only, `POST /issues/1/unpin` | 403 |
| `API-UNPIN-005` | Unpin non-existent issue | `POST /issues/99999/unpin` | 404 |
| `API-UNPIN-006` | Unpin causes position compaction | Pin issues 1,2,3 (positions 1,2,3). Unpin issue 2. List pinned. | Issues 1 and 3 now at positions 1 and 2 (no gap) |
| `API-UNPIN-007` | Unpin last remaining pinned issue | Pin 1 issue, unpin it, list pinned | Empty array `[]` |
| `API-UNPIN-008` | Unpin with non-integer issue number | `POST /issues/abc/unpin` | 400 or 404 |
| `API-UNPIN-009` | Verify issue event created on unpin | Unpin issue, `GET /issues/1/events` | Contains event with `event_type: "unpinned"` |

### API List Pinned Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| `API-LIST-PIN-001` | List pinned when none pinned | `GET /issues/pinned` | 200, empty array `[]` |
| `API-LIST-PIN-002` | List pinned returns correct issues | Pin 3 issues, `GET /issues/pinned` | 200, array of 3 issues, all with `pinned: true` |
| `API-LIST-PIN-003` | List pinned respects position order | Pin issues in order A, B, C | Array order matches position: A(1), B(2), C(3) |
| `API-LIST-PIN-004` | List pinned excludes unpinned issues | Pin 3, unpin 1, list | 200, array of 2 issues |
| `API-LIST-PIN-005` | List pinned on public repo without auth | `GET /issues/pinned` without Authorization | 200, returns pinned issues |
| `API-LIST-PIN-006` | List pinned on private repo without auth | `GET /issues/pinned` without Authorization | 401 |
| `API-LIST-PIN-007` | List pinned returns issues with all expected fields | Pin issue, list | Each issue has: `id`, `number`, `title`, `state`, `pinned`, `pin_position`, `author`, `labels`, `comment_count`, `created_at`, `updated_at` |
| `API-LIST-PIN-008` | List pinned after deleting a pinned issue | Pin issue, delete issue, list | Deleted issue not in list |

### API Reorder Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| `API-REORDER-001` | Reorder 3 pinned issues | Pin 1,2,3. `PATCH /issues/pinned` with `{ "issues": [3, 1, 2] }` | 200, array in order: 3(pos 1), 1(pos 2), 2(pos 3) |
| `API-REORDER-002` | Reorder with non-pinned issue number | `PATCH /issues/pinned` with unpinned issue number | 422 |
| `API-REORDER-003` | Reorder with empty array | `PATCH /issues/pinned` with `{ "issues": [] }` | 422 |
| `API-REORDER-004` | Reorder with duplicate issue numbers | `PATCH /issues/pinned` with `{ "issues": [1, 1, 2] }` | 422 |
| `API-REORDER-005` | Reorder with no auth | `PATCH /issues/pinned` without Authorization | 401 |
| `API-REORDER-006` | Reorder with read-only access | `PATCH /issues/pinned` as read-only | 403 |
| `API-REORDER-007` | Reorder partial set | Pin 1,2,3. Reorder with `{ "issues": [3, 1] }` | 200, issue 3 at pos 1, issue 1 at pos 2, issue 2 at pos 3 |
| `API-REORDER-008` | Reorder single issue (no-op) | `PATCH /issues/pinned` with `{ "issues": [1] }` | 200, no change |

### CLI E2E Tests

| Test ID | Description | Command | Expected |
|---------|-------------|---------|----------|
| `CLI-PIN-001` | Pin an issue | `codeplane issue pin 1 --repo owner/repo` | Exit 0, output contains "Pinned issue #1" |
| `CLI-PIN-002` | Pin with JSON output | `codeplane issue pin 1 --repo owner/repo --json` | Exit 0, valid JSON with `pinned: true` |
| `CLI-PIN-003` | Pin non-existent issue | `codeplane issue pin 99999 --repo owner/repo` | Exit non-zero, error contains "not found" |
| `CLI-PIN-004` | Pin without auth | `codeplane issue pin 1 --repo owner/repo` (no token) | Exit non-zero, auth error |
| `CLI-PIN-005` | Pin with invalid number | `codeplane issue pin abc --repo owner/repo` | Exit non-zero, validation error |
| `CLI-PIN-006` | Pin already-pinned issue (idempotent) | Pin issue, then pin again | Exit 0, issue remains pinned |
| `CLI-PIN-007` | Pin 7th issue exceeds limit | Pin 6 issues, then pin 7th | Exit non-zero, error contains "Maximum of 6" |
| `CLI-PIN-008` | Unpin an issue | `codeplane issue unpin 1 --repo owner/repo` | Exit 0, output contains "Unpinned issue #1" |
| `CLI-PIN-009` | Unpin with JSON output | `codeplane issue unpin 1 --repo owner/repo --json` | Exit 0, valid JSON with `pinned: false` |
| `CLI-PIN-010` | Unpin not-pinned issue (idempotent) | `codeplane issue unpin 1` on unpinned issue | Exit 0 |
| `CLI-PIN-011` | List pinned issues | `codeplane issue list --pinned --repo owner/repo` | Exit 0, shows only pinned issues |
| `CLI-PIN-012` | List pinned with JSON output | `codeplane issue list --pinned --repo owner/repo --json` | Exit 0, valid JSON array |
| `CLI-PIN-013` | List pinned when none pinned | `codeplane issue list --pinned --repo owner/repo` | Exit 0, shows empty or "No pinned issues" |
| `CLI-PIN-014` | Verify pin state via issue view | `codeplane issue pin 1` then `codeplane issue view 1 --json` | `pinned: true` in output |
| `CLI-PIN-015` | Pin and unpin lifecycle | Pin, verify, unpin, verify, list pinned | Each step produces expected state |
| `CLI-PIN-016` | Pin issue inferred from cwd repo | `cd` into repo, `codeplane issue pin 1` (no --repo) | Exit 0, pins on inferred repo |

### TUI E2E Tests

| Test ID | Description | Key Sequence | Expected |
|---------|-------------|-------------|----------|
| `TUI-PIN-001` | Pin issue from list | Focus unpinned issue → `p` | Pin icon appears, status bar shows "Pinned issue #N" |
| `TUI-PIN-002` | Unpin issue from list | Focus pinned issue → `p` | Pin icon disappears, status bar shows "Unpinned issue #N" |
| `TUI-PIN-003` | Pin issue from detail | Navigate to issue detail → `p` | Pin badge appears, timeline event |
| `TUI-PIN-004` | Rapid double-press ignored | Focus issue → `p` `p` (< 100ms) | Only one API call made |
| `TUI-PIN-005` | Permission denied revert | Read-only user → `p` | Icon reverts, "Permission denied" in status bar |
| `TUI-PIN-006` | Limit reached error | Pin 6, focus 7th → `p` | Status bar shows "Max 6 pinned issues", no pin icon |
| `TUI-PIN-007` | Error message auto-dismiss | `p` on 403 → wait 3s | Error message disappears |
| `TUI-PIN-008` | Pin preserves focus | Focus 5th issue → `p` | 5th row still focused |
| `TUI-PIN-009` | Pinned issues grouped at top | Pin 2 issues → return to list | Pinned issues at top under separator |
| `TUI-PIN-010` | Status bar hint updates | Focus unpinned: `p:pin`. Focus pinned: `p:unpin` | Correct hints |

### Web UI (Playwright) E2E Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `WEB-PIN-001` | Pin from detail sidebar | Navigate to issue → click "Pin issue" → pin badge appears, timeline event |
| `WEB-PIN-002` | Unpin from detail sidebar | Navigate to pinned issue → click "Unpin issue" → badge disappears, timeline event |
| `WEB-PIN-003` | Pinned section on issue list | Pin 2 issues → issue list → "Pinned" section visible with 2 cards |
| `WEB-PIN-004` | Pinned section hidden when empty | Unpin all → issue list → no "Pinned" section |
| `WEB-PIN-005` | Pin button hidden for read-only | Read-only user → issue detail → no "Pin issue" action |
| `WEB-PIN-006` | 6-issue limit error | Pin 6 → try 7th → error toast |
| `WEB-PIN-007` | Drag-and-drop reorder | Pin 3 → drag first to third → order updates |
| `WEB-PIN-008` | Pin icon in main list | Pin issue → scroll to it in list → pin icon visible |
| `WEB-PIN-009` | Pin closed issue | Close issue → pin → appears in pinned section with closed badge |
| `WEB-PIN-010` | Card metadata | Pin issue with labels → card shows title, state, labels, comment count |
| `WEB-PIN-011` | Pin from list context menu | Issue row "..." menu → "Pin issue" → appears in pinned section |

### Workflow Trigger Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `WF-PIN-001` | `on.issue.pinned()` fires on pin | Define workflow → pin issue → run created |
| `WF-PIN-002` | `on.issue.pinned()` does not fire on unpin | Unpin issue → no run for pinned trigger |
| `WF-PIN-003` | `on.issue.unpinned()` fires on unpin | Define workflow → unpin → run created |
| `WF-PIN-004` | Workflow receives correct context | Pin → workflow receives issue number, repo, actor, pin_position |
| `WF-PIN-005` | Idempotent pin does not fire trigger | Pin already-pinned → no new workflow run |

### Webhook Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `HOOK-PIN-001` | Delivery on pin | Subscribe → pin → delivery with `action: "pinned"` |
| `HOOK-PIN-002` | Delivery on unpin | Subscribe → unpin → delivery with `action: "unpinned"` |
| `HOOK-PIN-003` | Payload includes data | Pin → payload has `issue.number`, `issue.pinned: true`, `sender` |
| `HOOK-PIN-004` | Idempotent pin no delivery | Pin already-pinned → no webhook delivery |

# ISSUE_LOCK

Specification for ISSUE_LOCK.

## High-Level User POV

When a discussion on an issue becomes unproductive — whether because of off-topic tangents, heated arguments, resolved conclusions, or spam — a repository administrator or owner needs a way to lock the issue so that regular contributors can no longer add new comments. Locking is a moderation tool that preserves the existing conversation record while preventing further noise.

Locking an issue does not hide or delete any existing comments or data. The issue remains fully visible, searchable, and browsable. The only behavioral change is that new comments are restricted to repository administrators and owners. This means the team's moderators can still leave administrative notes ("This has been resolved in v2.1") even after a lock is in place.

When an issue is locked, a clear visual indicator appears on the issue detail page, in issue lists, and in the TUI. All clients surface the lock reason — `off-topic`, `too heated`, `resolved`, or `spam` — so that other team members understand why the conversation was closed. The lock reason is optional; locking without a reason is allowed when the moderator doesn't want to categorize the action.

Unlocking is equally straightforward. An admin or owner clicks "Unlock conversation" (web), runs `codeplane issue unlock <number>` (CLI), or presses the unlock keybinding (TUI), and commenting is re-enabled for all users with write access. There is no cooldown period; the moderator has full discretion.

Locking and unlocking both generate timeline events on the issue, so the history of moderation actions is transparent. Workflow triggers, webhooks, and notifications fire on lock/unlock events, enabling downstream automation — for example, a workflow that auto-labels locked issues with `moderation:locked` or a webhook that posts to Slack when a heated discussion is locked.

The lock feature is available from every Codeplane client surface: the web UI, CLI, TUI, and editor integrations. Agents operating via the API can also lock and unlock issues when they have the appropriate permissions, supporting automated moderation workflows.

## Acceptance Criteria

### Definition of Done

- [ ] A user with admin or owner permission can lock an open or closed issue from the web UI, CLI, TUI, and API
- [ ] A user with admin or owner permission can unlock a locked issue from the web UI, CLI, TUI, and API
- [ ] Locking an issue accepts an optional `reason` field with values: `off-topic`, `too heated`, `resolved`, `spam`
- [ ] Locking an issue without a reason is permitted (reason defaults to `null`)
- [ ] Locking an already-locked issue is idempotent — returns success and preserves the existing lock state (reason may be updated if a new reason is provided)
- [ ] Unlocking an already-unlocked issue is idempotent — returns success with no change
- [ ] A locked issue rejects new comment creation from users without admin or owner permission, returning 403
- [ ] A locked issue allows new comment creation from admin and owner users
- [ ] The issue response body includes `is_locked: boolean` and `lock_reason: string | null` fields
- [ ] An issue event record is created in the timeline when an issue is locked or unlocked
- [ ] The lock event includes the actor and the lock reason
- [ ] The unlock event includes the actor
- [ ] A workflow trigger on `issue.locked` fires when an issue is locked
- [ ] A workflow trigger on `issue.unlocked` fires when an issue is unlocked
- [ ] Webhooks subscribed to issue events receive a delivery on lock and unlock actions
- [ ] Notification fanout sends a notification to repository watchers when an issue is locked or unlocked
- [ ] The lock/unlock actions are visible in the issue timeline across all clients
- [ ] Locking and unlocking do not change the issue's `state` (open/closed) or any other metadata

### Input Constraints

- [ ] Issue number must be a positive integer (1 to 2,147,483,647)
- [ ] Issue number must reference an existing issue in the specified repository
- [ ] The `owner` and `repo` path parameters must reference an existing repository
- [ ] The `reason` field, if provided, must be one of: `"off-topic"`, `"too heated"`, `"resolved"`, `"spam"` (case-insensitive, trimmed)
- [ ] Invalid reason values (e.g., `"other"`, `"custom reason"`, `""`, numbers) return a 422 validation error
- [ ] The `reason` field accepts null to clear or omit the reason

### Edge Cases

- [ ] Locking an already-locked issue returns 200 with current lock state (idempotent)
- [ ] Locking an already-locked issue with a different reason updates the reason and returns 200
- [ ] Locking an already-locked issue with the same reason returns 200 with no change
- [ ] Unlocking an already-unlocked issue returns 200 (idempotent)
- [ ] Locking a deleted/nonexistent issue returns 404
- [ ] Locking an issue on an archived repository returns 403
- [ ] Locking an issue with a very high issue number (e.g., #99999) works correctly if the issue exists
- [ ] Attempting to comment on a locked issue as a write-level collaborator returns 403 with a clear error message indicating the issue is locked
- [ ] Attempting to comment on a locked issue as a read-only collaborator returns 403
- [ ] Commenting on a locked issue as an admin returns 201 (success)
- [ ] Commenting on a locked issue as the repo owner returns 201 (success)
- [ ] Locking does not affect existing comments — they remain visible and editable by their authors
- [ ] Locking does not change the issue's open/closed state
- [ ] Locking does not affect label, assignee, or milestone management (those still require write access, not admin)
- [ ] Locking does not affect reactions — users can still add reactions to existing comments on a locked issue
- [ ] Concurrent lock/unlock requests from two admins: both succeed, last write wins
- [ ] The `reason` field with leading/trailing whitespace is trimmed (e.g., `" resolved "` → `"resolved"`)
- [ ] The `reason` field with mixed case is normalized (e.g., `"Too Heated"` → `"too heated"`)
- [ ] Empty request body on lock endpoint (`{}`) locks with no reason
- [ ] Request body with unknown fields is ignored (no error for extra properties)
- [ ] Unlocking a locked issue and then re-locking creates two distinct timeline events

### Boundary Constraints

- [ ] `is_locked` field in response: always `true` or `false`
- [ ] `lock_reason` field in response: `null`, `"off-topic"`, `"too heated"`, `"resolved"`, or `"spam"` — no other values
- [ ] Lock reason maximum string length: 20 characters (the longest valid value `"too heated"` is 10 characters)
- [ ] `locked_at` timestamp format: ISO 8601 with timezone
- [ ] `locked_by` in timeline event: user object with `id` and `login`

## Design

### API Shape

**Lock an issue:**

```
PUT /api/repos/:owner/:repo/issues/:number/lock
Content-Type: application/json
Authorization: token <token>

{
  "reason": "resolved"
}
```

The `reason` field is optional. Valid values: `"off-topic"`, `"too heated"`, `"resolved"`, `"spam"`. Omitting `reason` or sending `null` locks the issue without a stated reason.

**Successful Response (200 OK):**

```json
{
  "id": 42,
  "number": 7,
  "title": "Fix login timeout on slow networks",
  "body": "Users on 3G connections see a blank screen...",
  "state": "open",
  "is_locked": true,
  "lock_reason": "resolved",
  "author": { "id": 1, "login": "alice" },
  "assignees": [{ "id": 2, "login": "bob" }],
  "labels": [{ "id": 5, "name": "bug", "color": "#d73a4a", "description": "Something isn't working" }],
  "milestone_id": 3,
  "comment_count": 5,
  "closed_at": null,
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Unlock an issue:**

```
DELETE /api/repos/:owner/:repo/issues/:number/lock
Authorization: token <token>
```

**Successful Response (200 OK):** Full `IssueResponse` with `is_locked: false` and `lock_reason: null`.

**Error Responses (both endpoints):**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | No authentication | `{ "message": "Authentication required" }` |
| 403 | Authenticated but not admin/owner | `{ "message": "Forbidden: admin or owner permission required" }` |
| 404 | Issue or repository not found | `{ "message": "Not found" }` |
| 422 | Invalid lock reason | `{ "message": "Validation failed", "errors": [{ "resource": "Issue", "field": "reason", "code": "invalid" }] }` |
| 429 | Rate limit exceeded | `{ "message": "Rate limit exceeded" }` with `Retry-After` header |

**Comment creation on a locked issue (non-admin):**

```
POST /api/repos/:owner/:repo/issues/:number/comments
→ 403 Forbidden
{ "message": "Issue is locked. Only administrators and the repository owner can comment." }
```

### Web UI Design

**Issue Detail Page — Lock Indicator:**

When an issue is locked, a lock icon (🔒) and label appear in the issue header area next to the state badge. The lock reason, if present, is shown as a tooltip or inline text: "This conversation was locked as **resolved**."

**Lock/Unlock Action:**

- The lock action is available in a "..." overflow menu or sidebar action area on the issue detail page, visible only to admins and owners.
- **Menu item (unlocked state):** "Lock conversation" — opens a small modal or inline form with an optional reason selector (dropdown with `off-topic`, `too heated`, `resolved`, `spam`, and a "No reason" default).
- **Menu item (locked state):** "Unlock conversation" — immediately unlocks on click (no confirmation modal needed, since unlocking is non-destructive).
- After locking, the comment composer area is replaced with a message: "This conversation has been locked. Only repository administrators can comment." for non-admin users.
- Admin/owner users continue to see the comment composer with a subtle indicator: "This issue is locked. You can comment because you are an administrator."

**Issue List Page:**

- Locked issues show a small lock icon (🔒) inline with the issue title or as part of the metadata row.
- The lock icon is a visual indicator only; it does not affect issue list filtering (no dedicated "locked" filter is required for this feature, though it may be added later).

**Timeline Event:**

- Lock event: "🔒 @admin locked this conversation as **resolved** — just now"
- Unlock event: "🔓 @admin unlocked this conversation — just now"
- Both events appear in the chronological timeline alongside comments and other system events.

### CLI Command

**Lock an issue:**

```bash
codeplane issue lock <number> [--reason <reason>] [--repo OWNER/REPO] [--json]
```

**Arguments:**
- `<number>` — The issue number (required, must be a positive integer)

**Options:**
- `--reason <reason>` — Optional lock reason. Must be one of: `off-topic`, `too-heated`, `resolved`, `spam`. If omitted, locks without a reason.
- `--repo OWNER/REPO` — Target repository (defaults to repo inferred from current working directory)
- `--json` — Output full `IssueResponse` JSON

**Output (human-readable):**
```
Locked issue #42: Fix login timeout on slow networks (reason: resolved)
```

Or without reason:
```
Locked issue #42: Fix login timeout on slow networks
```

**Unlock an issue:**

```bash
codeplane issue unlock <number> [--repo OWNER/REPO] [--json]
```

**Output (human-readable):**
```
Unlocked issue #42: Fix login timeout on slow networks
```

**Error output:**
```
Error: Permission denied — admin or owner permission required (403)
Error: Issue not found (404)
Error: Invalid lock reason "other" — must be one of: off-topic, too-heated, resolved, spam (422)
Error: Invalid issue number
```

### TUI UI

**Issue Detail Screen:**

- **Lock indicator:** When locked, display `[locked: resolved]` or `[locked]` next to the state badge in the header.
- **Keybinding:** `L` (uppercase) toggles lock/unlock.
  - If issue is unlocked: pressing `L` opens a reason selector overlay (arrow keys to pick, Enter to confirm, Esc to cancel). Selecting "No reason" or pressing Enter on the default locks without a reason.
  - If issue is locked: pressing `L` immediately unlocks (no confirmation).
- **Comment composer:** When locked and user is not admin/owner, the comment composer is replaced with: "🔒 Conversation locked — admin access required to comment"
- **Timeline events:** Lock/unlock events render inline: "→ @admin locked this as resolved — 5m ago" / "→ @admin unlocked this — 2m ago"
- **Status bar:** "Issue #N locked" (success) or "Failed to lock #N: reason" (error) for 3 seconds.
- **Optimistic update:** Lock badge appears immediately, reverts on server error.
- **In-flight guard:** `L` key disabled during pending mutation.

**Issue List Screen:**

- Locked issues show a lock icon `🔒` after the state indicator.
- No dedicated keybinding for lock/unlock from the list — user must enter detail screen.

### SDK Shape

The `@codeplane/sdk` `IssueService` adds:

```typescript
lockIssue(
  actor: AuthUser,
  owner: string,
  repo: string,
  number: number,
  reason?: "off-topic" | "too heated" | "resolved" | "spam" | null
): Promise<IssueResponse>

unlockIssue(
  actor: AuthUser,
  owner: string,
  repo: string,
  number: number
): Promise<IssueResponse>
```

The `IssueResponse` type adds:

```typescript
interface IssueResponse {
  // ... existing fields
  is_locked: boolean;
  lock_reason: "off-topic" | "too heated" | "resolved" | "spam" | null;
}
```

The `@codeplane/ui-core` package adds shared hooks:

```typescript
useLockIssue(owner: string, repo: string, number: number) → mutation hook
useUnlockIssue(owner: string, repo: string, number: number) → mutation hook
```

### Neovim Plugin API

```
:Codeplane issue lock <number> [reason]
:Codeplane issue unlock <number>
```

- Lock/unlock commands with optional reason argument.
- Telescope issue picker shows lock icon `🔒` next to locked issues.
- Statusline shows lock state when viewing a locked issue buffer.

### VS Code Extension

- Issue tree view items show a lock icon overlay for locked issues.
- Context menu on issue items: "Lock Conversation..." (opens quick-pick for reason) and "Unlock Conversation".
- Webview detail panel shows lock indicator and disables comment input for non-admins.

### Documentation

The following end-user documentation should be written:

1. **Web UI Guide: "Locking and Unlocking Issue Conversations"** — How to lock an issue from the overflow menu, select a reason, what the lock indicator looks like, how to unlock, and what happens to the comment area for regular users.
2. **CLI Reference: `issue lock` and `issue unlock`** — Command syntax, `--reason` option, valid reason values, examples, error messages.
3. **TUI Reference: Issue Lock Keybinding** — Document `L` keybinding on issue detail screen, reason selector overlay, and lock/unlock behavior.
4. **API Reference: `PUT /api/repos/:owner/:repo/issues/:number/lock`** — Request/response schema, valid reason values, error codes. `DELETE /api/repos/:owner/:repo/issues/:number/lock` — Unlock request/response.
5. **Moderation Guide: "Managing Heated Discussions"** — When and why to lock issues, guidance on choosing the appropriate reason, how locked issues interact with agents and workflows.
6. **Workflows: Issue Lock Event Triggers** — How to use `on.issue.locked()` and `on.issue.unlocked()` in workflow definitions.

## Permissions & Security

### Authorization Roles

| Role | Can Lock/Unlock | Can Comment on Locked Issue | Notes |
|------|----------------|----------------------------|-------|
| Repository Owner | ✅ | ✅ | Full permissions |
| Org Admin | ✅ | ✅ | Organization-level authority |
| Team Member (admin) | ✅ | ✅ | Team-assigned admin permission |
| Team Member (write) | ❌ | ❌ | Write permission insufficient for lock — returns 403 |
| Collaborator (admin) | ✅ | ✅ | Explicitly added with admin role |
| Collaborator (write) | ❌ | ❌ | Write permission insufficient for lock — returns 403 |
| Collaborator (read-only) | ❌ | ❌ | Returns 403 Forbidden |
| Authenticated (no repo access) | ❌ | ❌ | Returns 403 Forbidden |
| Anonymous / Unauthenticated | ❌ | ❌ | Returns 401 Unauthorized |

### Rate Limiting

- The `PUT /api/repos/:owner/:repo/issues/:number/lock` endpoint is rate-limited at **30 requests per minute** per authenticated user (lower than general issue mutations because lock/unlock is a moderation action, not a high-frequency workflow)
- The `DELETE /api/repos/:owner/:repo/issues/:number/lock` endpoint shares the same rate limit
- A 429 response includes a `Retry-After` header with the number of seconds to wait
- The CLI and TUI display the retry-after value to the user

### Data Privacy

- Lock/unlock events expose only the actor's username (public in the issue context already)
- The `lock_reason` is publicly visible to anyone who can view the issue
- No PII beyond existing issue metadata is exposed by locking
- Auth tokens are never logged, displayed, or included in telemetry
- Webhook deliveries include the actor's username and lock reason but not credentials

### Input Sanitization

- The `reason` field is validated against a strict allowlist of four values; arbitrary strings are rejected
- Issue numbers are validated as positive integers; non-numeric values are rejected before reaching the database
- Path parameters (`owner`, `repo`) are validated against existing entities
- No free-form text injection is possible through the lock action

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.locked` | Issue is locked (state transitions from unlocked to locked) | `owner`, `repo`, `issue_number`, `actor_id`, `actor_login`, `lock_reason` (nullable), `surface` (`"api"` | `"web"` | `"cli"` | `"tui"` | `"vscode"` | `"nvim"`), `issue_state` (`"open"` | `"closed"`), `issue_age_hours`, `comment_count`, `duration_ms` |
| `issue.unlocked` | Issue is unlocked (state transitions from locked to unlocked) | `owner`, `repo`, `issue_number`, `actor_id`, `actor_login`, `lock_duration_hours` (how long the issue was locked), `surface`, `issue_state`, `duration_ms` |
| `issue.lock.error` | Lock/unlock attempt fails | `owner`, `repo`, `issue_number`, `surface`, `http_status`, `error_type` (`"permission_denied"` | `"not_found"` | `"rate_limited"` | `"validation_error"` | `"server_error"`), `actor_id` |
| `issue.lock.idempotent` | Lock attempted on already-locked issue (no state change) | `owner`, `repo`, `issue_number`, `surface`, `actor_id`, `reason_changed` (boolean) |
| `issue.comment.rejected_locked` | Comment creation rejected because issue is locked | `owner`, `repo`, `issue_number`, `surface`, `actor_id`, `actor_role` |

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Lock success rate | > 98% | Percentage of lock attempts that succeed on first try |
| Permission error rate on lock | < 5% | Percentage resulting in 403 — high rates indicate UX confusion about who can lock |
| Locked issue unlock rate | 30-60% within 30 days | Healthy — most locks should eventually be unlocked; very low rates may indicate forgotten locks |
| Median lock duration | 24-168 hours | How long issues stay locked before being unlocked |
| Lock reason distribution | No single reason > 70% | Healthy distribution; spam-dominant might indicate a moderation problem |
| Comment rejection rate on locked issues | < 2% of total comment attempts | Users should understand the lock and not repeatedly try to comment |
| Lock-to-close correlation | Track | How often locking precedes closing — may inform product decisions |
| Surface distribution | Web 50-60%, CLI 20-30%, TUI 5-15%, Editor 2-5% | Expected distribution for a moderation action |

## Observability

### Logging Requirements

| Log Level | Event | Structured Fields | Message |
|-----------|-------|-------------------|--------|
| `info` | Issue locked successfully | `owner`, `repo`, `issue_number`, `actor_id`, `lock_reason`, `duration_ms` | `Issue locked [owner={o}] [repo={r}] [number={n}] [actor={a}] [reason={reason}] [duration={d}ms]` |
| `info` | Issue unlocked successfully | `owner`, `repo`, `issue_number`, `actor_id`, `lock_duration_hours`, `duration_ms` | `Issue unlocked [owner={o}] [repo={r}] [number={n}] [actor={a}] [locked_for={h}h] [duration={d}ms]` |
| `warn` | Lock/unlock failed — permission denied | `owner`, `repo`, `issue_number`, `actor_id`, `actor_role`, `http_status=403` | `Issue lock denied [owner={o}] [repo={r}] [number={n}] [actor={a}] [role={role}]` |
| `warn` | Lock/unlock failed — not found | `owner`, `repo`, `issue_number`, `http_status=404` | `Issue lock not found [owner={o}] [repo={r}] [number={n}]` |
| `warn` | Lock failed — invalid reason | `owner`, `repo`, `issue_number`, `reason_value`, `http_status=422` | `Issue lock validation failed [owner={o}] [repo={r}] [number={n}] [reason={r}]` |
| `warn` | Comment rejected on locked issue | `owner`, `repo`, `issue_number`, `actor_id`, `actor_role` | `Comment rejected on locked issue [owner={o}] [repo={r}] [number={n}] [actor={a}]` |
| `error` | Lock/unlock failed — internal error | `owner`, `repo`, `issue_number`, `error`, `stack`, `http_status=500` | `Issue lock internal error [owner={o}] [repo={r}] [number={n}] [error={e}]` |
| `debug` | Lock request received | `owner`, `repo`, `issue_number`, `request_body` | `Issue lock request [owner={o}] [repo={r}] [number={n}]` |
| `debug` | Idempotent lock (already locked) | `owner`, `repo`, `issue_number`, `reason_changed` | `Issue lock idempotent [owner={o}] [repo={r}] [number={n}] [reason_changed={c}]` |
| `debug` | Idempotent unlock (already unlocked) | `owner`, `repo`, `issue_number` | `Issue unlock idempotent [owner={o}] [repo={r}] [number={n}]` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_lock_total` | Counter | `owner`, `repo`, `action` (lock, unlock), `status` (success, error), `error_type` | Total lock/unlock attempts |
| `codeplane_issue_lock_duration_seconds` | Histogram | `owner`, `repo`, `action` | Duration of lock/unlock API operations (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_issue_lock_reason_total` | Counter | `owner`, `repo`, `reason` (off-topic, too_heated, resolved, spam, none) | Distribution of lock reasons |
| `codeplane_issue_locked_active` | Gauge | `owner`, `repo` | Current count of locked issues per repository |
| `codeplane_issue_comment_rejected_locked_total` | Counter | `owner`, `repo` | Total comment creation attempts rejected due to issue lock |

### Alerts

**Alert: High Issue Lock Error Rate**
- **Condition:** `rate(codeplane_issue_lock_total{status="error"}[5m]) / rate(codeplane_issue_lock_total[5m]) > 0.15` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_issue_lock_total` by `error_type` label to identify the dominant error class.
  2. If `error_type=server_error` dominates: check database connectivity, look for missing columns or migration failures on the issues table (`is_locked`, `lock_reason` columns), check server error logs for stack traces.
  3. If `error_type=permission_denied` dominates: verify the permission evaluation logic is correctly checking admin/owner-level access. Check if a recent deploy changed the `requireAdminAccess()` method. Review if the role hierarchy is resolving correctly for org-owned repos.
  4. If `error_type=validation_error` dominates: check if clients are sending unexpected reason values. Verify the allowlist is correctly defined in the route handler.
  5. If `error_type=rate_limited` dominates: check if a single user or bot is hitting the lock endpoint repeatedly. Inspect rate limit logs for the offending actor.
  6. Escalate to on-call database engineer if the issue is persistence-layer related.

**Alert: Spike in Locked-Issue Comment Rejections**
- **Condition:** `rate(codeplane_issue_comment_rejected_locked_total[10m]) > 5` sustained for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check which repositories are generating rejections: query `codeplane_issue_comment_rejected_locked_total` by `owner` and `repo` labels.
  2. If rejections are concentrated on one repository: check if a large number of issues were recently locked (mass-lock action or automation). Verify the lock indicator is visible in the UI — high rejection rates may indicate the lock badge is not rendering.
  3. If rejections are distributed: check if a recent deploy broke the comment composer lock-state check in the web UI or TUI, causing users to attempt comments they shouldn't be able to submit.
  4. Check if agent sessions are attempting to comment on locked issues — if so, the agent tooling needs to check lock state before attempting comments.
  5. No immediate action required if rejections are low-volume and distributed — this may simply be users discovering the lock.

**Alert: Issue Lock Latency Spike**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_issue_lock_duration_seconds_bucket[5m])) > 5` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check database query performance for the UPDATE on the issues table (`is_locked`, `lock_reason` columns).
  2. Verify indexes exist on `issues.repository_id` and `issues.number` for efficient lookups.
  3. Check for table-level lock contention on the `issues` table.
  4. Check if the issue event creation (timeline record) is causing additional latency.
  5. Check Bun process CPU and memory usage.
  6. If the issue is in the event creation path, consider making event creation asynchronous.

**Alert: Issue Lock Endpoint Down**
- **Condition:** No `codeplane_issue_lock_total` increments for 15 minutes during business hours (when baseline is > 0)
- **Severity:** Critical
- **Runbook:**
  1. Verify the API server is running and healthy (`/api/health`).
  2. Check if the lock route is mounted by sending an OPTIONS request to `/api/repos/:owner/:repo/issues/:number/lock`.
  3. Check server startup logs for route registration errors.
  4. Verify a recent deploy did not accidentally remove the lock route from the issues route family.
  5. Restart the server process if the route is missing; investigate root cause in the deploy pipeline.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|------------|-------------|---------------------|----------|
| User not authenticated | 401 | "Authentication required" | User logs in |
| User lacks admin/owner access | 403 | "Permission denied: admin or owner access required" | User requests elevated access from repo owner |
| Issue not found | 404 | "Issue not found" | User verifies issue number and repository |
| Invalid lock reason | 422 | "Invalid lock reason. Must be one of: off-topic, too heated, resolved, spam" | User selects a valid reason |
| Rate limit exceeded | 429 | "Rate limit exceeded. Retry in Ns." | User waits and retries |
| Database connection failure | 500 | "Internal server error" | Ops investigates DB connectivity |
| Database migration missing (column not found) | 500 | "Internal server error" | Ops runs pending migrations |
| Comment rejected on locked issue | 403 | "Issue is locked. Only administrators and the repository owner can comment." | User contacts an admin to unlock or to post on their behalf |
| Concurrent lock/unlock race | 200 | No error — last write wins | No user action needed |
| Network timeout (client-side) | N/A | "Network error" | User retries |

## Verification

### API Integration Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| `API-LOCK-001` | Lock an unlocked issue | `PUT /issues/1/lock` with `{ "reason": "resolved" }` | 200, `is_locked: true`, `lock_reason: "resolved"` |
| `API-LOCK-002` | Lock an unlocked issue without reason | `PUT /issues/1/lock` with `{}` | 200, `is_locked: true`, `lock_reason: null` |
| `API-LOCK-003` | Lock with each valid reason | `PUT /issues/1/lock` with `"off-topic"`, `"too heated"`, `"resolved"`, `"spam"` sequentially | 200 for each, `lock_reason` matches |
| `API-LOCK-004` | Lock an already-locked issue (idempotent) | Lock issue, then `PUT /issues/1/lock` again | 200, `is_locked: true`, no error |
| `API-LOCK-005` | Lock with new reason updates reason | Lock with `"spam"`, then lock with `"resolved"` | 200, `lock_reason: "resolved"` |
| `API-LOCK-006` | Unlock a locked issue | Lock issue, then `DELETE /issues/1/lock` | 200, `is_locked: false`, `lock_reason: null` |
| `API-LOCK-007` | Unlock an already-unlocked issue (idempotent) | `DELETE /issues/1/lock` on unlocked issue | 200, `is_locked: false` |
| `API-LOCK-008` | Lock with no auth | `PUT /issues/1/lock` without Authorization | 401 |
| `API-LOCK-009` | Lock with read-only access | Auth as read-only, `PUT /issues/1/lock` | 403 |
| `API-LOCK-010` | Lock with write access (non-admin) | Auth as write collaborator, `PUT /issues/1/lock` | 403 |
| `API-LOCK-011` | Lock as repo owner | Auth as owner, `PUT /issues/1/lock` | 200 |
| `API-LOCK-012` | Lock as org admin | Auth as org admin, `PUT /issues/1/lock` on org repo | 200 |
| `API-LOCK-013` | Lock as team admin | Auth as team admin member, `PUT /issues/1/lock` | 200 |
| `API-LOCK-014` | Unlock with no auth | `DELETE /issues/1/lock` without Authorization | 401 |
| `API-LOCK-015` | Unlock with write access (non-admin) | Auth as write collaborator, `DELETE /issues/1/lock` | 403 |
| `API-LOCK-016` | Lock non-existent issue | `PUT /issues/99999/lock` | 404 |
| `API-LOCK-017` | Lock with invalid reason | `PUT /issues/1/lock` with `{ "reason": "custom" }` | 422 |
| `API-LOCK-018` | Lock with empty string reason | `PUT /issues/1/lock` with `{ "reason": "" }` | 422 |
| `API-LOCK-019` | Lock with numeric reason | `PUT /issues/1/lock` with `{ "reason": 42 }` | 422 |
| `API-LOCK-020` | Lock with uppercase reason | `PUT /issues/1/lock` with `{ "reason": "RESOLVED" }` | 200, `lock_reason: "resolved"` (normalized) |
| `API-LOCK-021` | Lock with whitespace-padded reason | `PUT /issues/1/lock` with `{ "reason": " spam " }` | 200, `lock_reason: "spam"` (trimmed) |
| `API-LOCK-022` | Lock with mixed-case reason | `PUT /issues/1/lock` with `{ "reason": "Too Heated" }` | 200, `lock_reason: "too heated"` (normalized) |
| `API-LOCK-023` | Lock with null reason | `PUT /issues/1/lock` with `{ "reason": null }` | 200, `lock_reason: null` |
| `API-LOCK-024` | Lock with extra unknown fields | `PUT /issues/1/lock` with `{ "reason": "spam", "foo": "bar" }` | 200, extra field ignored |
| `API-LOCK-025` | Comment on locked issue as non-admin | Lock issue, auth as write user, `POST /issues/1/comments` | 403 with lock-specific error message |
| `API-LOCK-026` | Comment on locked issue as admin | Lock issue, auth as admin, `POST /issues/1/comments` | 201, comment created |
| `API-LOCK-027` | Comment on locked issue as owner | Lock issue, auth as owner, `POST /issues/1/comments` | 201, comment created |
| `API-LOCK-028` | Comment on locked issue as read-only | Lock issue, auth as read-only, `POST /issues/1/comments` | 403 |
| `API-LOCK-029` | Verify issue event created on lock | Lock issue, `GET /issues/1/events` | Contains event with `event_type: "locked"`, actor, reason |
| `API-LOCK-030` | Verify issue event created on unlock | Lock then unlock, `GET /issues/1/events` | Contains event with `event_type: "unlocked"`, actor |
| `API-LOCK-031` | Verify `is_locked` in issue detail response | Lock issue, `GET /issues/1` | `is_locked: true`, `lock_reason` present |
| `API-LOCK-032` | Verify `is_locked` in issue list response | Lock issue, `GET /issues` | Issue in list has `is_locked: true` |
| `API-LOCK-033` | Lock a closed issue | Close issue, then `PUT /issues/1/lock` | 200, `state: "closed"`, `is_locked: true` |
| `API-LOCK-034` | Lock does not change issue state | Open issue, lock it, verify state | `state: "open"` unchanged |
| `API-LOCK-035` | Unlock does not change issue state | Closed+locked issue, unlock, verify state | `state: "closed"` unchanged |
| `API-LOCK-036` | Lock with non-integer issue number | `PUT /issues/abc/lock` | 400 or 404 |
| `API-LOCK-037` | Lock with negative issue number | `PUT /issues/-1/lock` | 400 or 404 |
| `API-LOCK-038` | Lock with zero issue number | `PUT /issues/0/lock` | 400 or 404 |
| `API-LOCK-039` | Lock with very large issue number | `PUT /issues/2147483648/lock` | 404 or 400 (overflow) |
| `API-LOCK-040` | Lock with maximum valid issue number | Create issue at high number, lock it | 200 |
| `API-LOCK-041` | Rate limit enforcement on lock | Send 31 lock requests in 60 seconds | 31st returns 429 with `Retry-After` |
| `API-LOCK-042` | Content-Type enforcement on lock | `PUT /issues/1/lock` with `text/plain` content-type | 415 or 400 |
| `API-LOCK-043` | Locking does not affect label management | Lock issue, auth as write user, `POST /issues/1/labels` | 200, labels added (write access sufficient) |
| `API-LOCK-044` | Locking does not affect assignee management | Lock issue, auth as write user, `PATCH /issues/1` with assignees | 200, assignees updated |
| `API-LOCK-045` | Locking does not affect reactions | Lock issue, auth as read-only user, `POST /issues/1/reactions` | 200, reaction added |
| `API-LOCK-046` | Lock and unlock round-trip | Lock, verify locked, unlock, verify unlocked, comment as write user | Comment succeeds after unlock |
| `API-LOCK-047` | Lock preserves `updated_at` | Record `updated_at`, lock issue, compare | `updated_at` is more recent |
| `API-LOCK-048` | Lock on archived repository | Archive repo, then `PUT /issues/1/lock` | 403 |

### CLI E2E Tests

| Test ID | Description | Command | Expected |
|---------|-------------|---------|----------|
| `CLI-LOCK-001` | Lock an open issue | `codeplane issue lock 1 --repo owner/repo` | Exit 0, output contains "Locked issue #1" |
| `CLI-LOCK-002` | Lock with reason | `codeplane issue lock 1 --reason resolved --repo owner/repo` | Exit 0, output contains "reason: resolved" |
| `CLI-LOCK-003` | Lock with JSON output | `codeplane issue lock 1 --repo owner/repo --json` | Exit 0, valid JSON with `is_locked: true` |
| `CLI-LOCK-004` | Unlock a locked issue | `codeplane issue unlock 1 --repo owner/repo` | Exit 0, output contains "Unlocked issue #1" |
| `CLI-LOCK-005` | Unlock with JSON output | `codeplane issue unlock 1 --repo owner/repo --json` | Exit 0, valid JSON with `is_locked: false` |
| `CLI-LOCK-006` | Lock with invalid reason | `codeplane issue lock 1 --reason other --repo owner/repo` | Exit non-zero, error mentions valid reasons |
| `CLI-LOCK-007` | Lock non-existent issue | `codeplane issue lock 99999 --repo owner/repo` | Exit non-zero, error contains "not found" |
| `CLI-LOCK-008` | Lock without auth | `codeplane issue lock 1 --repo owner/repo` (no token) | Exit non-zero, authentication error |
| `CLI-LOCK-009` | Lock with insufficient permission | Auth as write user, `codeplane issue lock 1` | Exit non-zero, permission error |
| `CLI-LOCK-010` | Lock with invalid number | `codeplane issue lock abc --repo owner/repo` | Exit non-zero, validation error |
| `CLI-LOCK-011` | Lock already-locked issue | Lock, then lock again | Exit 0, idempotent |
| `CLI-LOCK-012` | Lock then view shows locked state | `codeplane issue lock 1` then `codeplane issue view 1 --json` | `is_locked: true` in output |
| `CLI-LOCK-013` | Unlock then comment succeeds | Unlock issue, then `codeplane issue comment 1 --body "test"` | Exit 0, comment created |
| `CLI-LOCK-014` | Lock with each valid reason | Lock with `off-topic`, `too-heated`, `resolved`, `spam` | All exit 0 |

### TUI E2E Tests

| Test ID | Description | Key Sequence | Expected |
|---------|-------------|-------------|----------|
| `TUI-LOCK-001` | Lock issue from detail | Navigate to issue detail → `L` → select reason → Enter | Lock badge appears, status bar shows "Issue #N locked" |
| `TUI-LOCK-002` | Unlock issue from detail | Navigate to locked issue detail → `L` | Lock badge removed, status bar shows "Issue #N unlocked" |
| `TUI-LOCK-003` | Lock reason selector offers all options | `L` on unlocked issue | Overlay shows "No reason", "off-topic", "too heated", "resolved", "spam" |
| `TUI-LOCK-004` | Cancel reason selector | `L` → Esc | No lock applied, no API call |
| `TUI-LOCK-005` | Comment composer disabled when locked | Navigate to locked issue (non-admin) | Comment area shows locked message |
| `TUI-LOCK-006` | Comment composer enabled for admin on locked issue | Navigate to locked issue (admin) | Comment area functional with admin indicator |
| `TUI-LOCK-007` | Permission denied revert | Write user → `L` | Badge reverts, status bar shows "Permission denied" |
| `TUI-LOCK-008` | Lock icon in issue list | Lock an issue, navigate to list | Lock icon visible next to locked issue |
| `TUI-LOCK-009` | Rapid double-press ignored | `L` `L` (< 100ms) | Only one API call made |
| `TUI-LOCK-010` | Timeline event appears after lock | `L` on unlocked issue → scroll to timeline | Lock event visible |
| `TUI-LOCK-011` | Error message auto-dismiss | `L` on 403 → wait 3s | Error message disappears |
| `TUI-LOCK-012` | Lock at 80×24 terminal | Set terminal to 80×24 → `L` | Truncated status message fits |

### Web UI (Playwright) E2E Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `WEB-LOCK-001` | Lock issue via overflow menu | Navigate to issue → click "..." → "Lock conversation" → select "resolved" → confirm | Lock icon appears, comment area shows locked message for non-admins |
| `WEB-LOCK-002` | Unlock issue via overflow menu | Navigate to locked issue → click "..." → "Unlock conversation" | Lock icon removed, comment area re-enabled |
| `WEB-LOCK-003` | Lock indicator visible on issue detail | Lock issue → verify lock icon and reason text visible in header | 🔒 icon and "This conversation was locked as resolved" |
| `WEB-LOCK-004` | Lock indicator visible in issue list | Lock issue → navigate to list → verify lock icon | 🔒 icon next to issue |
| `WEB-LOCK-005` | Comment area disabled for non-admin on locked issue | Log in as write user → navigate to locked issue | Comment textarea replaced with locked message |
| `WEB-LOCK-006` | Comment area enabled for admin on locked issue | Log in as admin → navigate to locked issue | Comment textarea present with admin indicator |
| `WEB-LOCK-007` | Lock/unlock menu hidden for non-admin users | Log in as write user → click "..." on issue | No "Lock conversation" option in menu |
| `WEB-LOCK-008` | Timeline event after lock | Lock issue → scroll to timeline | "🔒 @admin locked this conversation as resolved" event |
| `WEB-LOCK-009` | Timeline event after unlock | Unlock issue → scroll to timeline | "🔓 @admin unlocked this conversation" event |
| `WEB-LOCK-010` | Lock without reason | Lock via menu → skip reason → confirm | `lock_reason: null`, indicator says "This conversation has been locked" (no reason text) |
| `WEB-LOCK-011` | Lock preserves issue state badge | Lock open issue → state badge still shows "Open" | State badge unchanged |

### Workflow Trigger Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `WF-LOCK-001` | `on.issue.locked()` trigger fires on lock | Define workflow with `on.issue.locked()` → lock issue → workflow run created |
| `WF-LOCK-002` | `on.issue.unlocked()` trigger fires on unlock | Define workflow with `on.issue.unlocked()` → unlock issue → workflow run created |
| `WF-LOCK-003` | `on.issue.locked()` does not fire on unlock | Define workflow with `on.issue.locked()` → unlock issue → no workflow run created |
| `WF-LOCK-004` | Workflow receives correct issue context | Lock issue → workflow receives `issue_number`, `repo`, `actor`, `lock_reason` |

### Webhook Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `HOOK-LOCK-001` | Webhook delivery on lock | Subscribe to issue events → lock issue → webhook delivery with `action: "locked"` |
| `HOOK-LOCK-002` | Webhook payload includes lock data | Lock issue → payload contains `issue.is_locked: true`, `issue.lock_reason`, `sender` |
| `HOOK-LOCK-003` | Webhook delivery on unlock | Subscribe to issue events → unlock issue → webhook delivery with `action: "unlocked"` |
| `HOOK-LOCK-004` | Webhook payload on unlock | Unlock issue → payload contains `issue.is_locked: false`, `issue.lock_reason: null` |

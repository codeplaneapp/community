# ISSUE_ASSIGNEE_EDIT

Specification for ISSUE_ASSIGNEE_EDIT.

## High-Level User POV

When a Codeplane user needs to change who is responsible for an issue, they edit the issue's assignees. Assignee editing is a fundamental collaboration action that connects people to work — it turns an abstract tracked item into someone's responsibility. The ability to quickly add, remove, or replace assignees directly affects how teams coordinate, how agents pick up work, and how individuals manage their task queues.

Today, a user who wants to add a single person to an existing issue must send the complete replacement list of all assignees, which means they first need to know who is already assigned. This specification defines dedicated add-assignee and remove-assignee operations — alongside the existing full-replacement behavior — so that users can make surgical changes without fetching the current state first. This is especially important for agents and automation, which frequently need to assign themselves to issues without disturbing other existing assignments.

From any Codeplane surface — the web UI sidebar on an issue detail page, a CLI command, a TUI overlay, or an editor integration — a user selects one or more collaborators to add as assignees, or removes specific existing assignees. The change takes effect immediately, the issue's assignee list updates in real time, and any configured webhooks or notification rules fire to alert the affected parties. The user who was just assigned sees the issue appear in their notification inbox and in any "assigned to me" filtered views.

Assignee edits are lightweight, frequent operations. A team lead triaging a backlog might reassign a dozen issues in rapid succession. An agent resolving an issue assigns itself when it starts work and may reassign back to a human for review. The experience must be fast, forgiving of minor input mistakes (like casing differences in usernames), and consistent across all product surfaces.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access can add one or more assignees to an issue via a dedicated `POST` endpoint and receive a `200` response containing the updated full assignee list.
- [ ] An authenticated user with write access can remove a specific assignee from an issue via a dedicated `DELETE` endpoint and receive a `204` response.
- [ ] The existing `PATCH /api/repos/:owner/:repo/issues/:number` full-replacement behavior for the `assignees` field continues to work unchanged.
- [ ] The dedicated add endpoint is additive — it appends to the existing assignee set without removing any current assignees.
- [ ] The dedicated remove endpoint is subtractive — it removes only the specified assignee.
- [ ] The CLI supports `--add-assignee` and `--remove-assignee` flags on `issue edit`, and dedicated `issue assign` / `issue unassign` subcommands.
- [ ] The Web UI issue detail page provides an assignee sidebar section with inline add/remove controls.
- [ ] The TUI issue edit form's assignee overlay correctly toggles individual assignees using the add/remove endpoints.
- [ ] Webhook events fire for the `issues` event type with action `assigned` / `unassigned` upon assignee changes.
- [ ] Notifications are sent to newly assigned users.
- [ ] All clients (Web UI, CLI, TUI, VS Code, Neovim) can trigger assignee edits through their respective interfaces.

### Required Field Constraints

- [ ] Usernames in the add request must be non-empty after trimming.
- [ ] Usernames are case-insensitive. `"Alice"` and `"alice"` resolve to the same user.
- [ ] Each username must resolve to a valid, existing Codeplane user. Invalid usernames must be rejected with a `422` validation error: `{ resource: "Issue", field: "assignees", code: "invalid" }`.
- [ ] Usernames must be valid Codeplane usernames (alphanumeric, hyphens, underscores, 1–39 characters). Usernames containing other characters must be rejected with `422`.

### Boundary Constraints

- [ ] Maximum assignees per issue: 10. Attempting to add an assignee that would exceed this limit must return `422`: `{ resource: "Issue", field: "assignees", code: "too_many", message: "issues cannot have more than 10 assignees" }`.
- [ ] Maximum usernames in a single add request: 10.
- [ ] An empty `assignees` array in the add request must return `422`: `{ resource: "Issue", field: "assignees", code: "missing_field" }`.
- [ ] Duplicate usernames within a single add request must be silently deduplicated before processing.

### Edge Cases

- [ ] Adding an assignee who is already assigned must be a no-op for that user (idempotent). The response still returns `200` with the full assignee list. No duplicate entry is created.
- [ ] Removing an assignee who is not currently assigned must return `204` (idempotent, not an error).
- [ ] Adding assignees to a closed issue must succeed. Assignees are orthogonal to issue state.
- [ ] Adding assignees to a locked issue must succeed for users with write access. Lock restricts comments, not metadata edits.
- [ ] Removing the last assignee from an issue must succeed, leaving the assignee list empty.
- [ ] The add operation must be atomic: if one username in the batch is invalid, the entire request is rejected and no assignees are added.
- [ ] Self-assignment must be allowed — a user can assign themselves.
- [ ] Assigning a user who is not a repository collaborator must succeed — any valid Codeplane user can be assigned.
- [ ] The `PATCH` full-replacement path with `assignees: []` must clear all assignees.
- [ ] Concurrent add requests for the same issue must not produce duplicate assignees.
- [ ] The assignee list in all responses must be ordered alphabetically by username (ASC).

### Authentication & Authorization Boundaries

- [ ] Unauthenticated requests must return `401 Unauthorized`.
- [ ] Authenticated users without write access to the repository must return `403 Forbidden`.
- [ ] Requests targeting a non-existent repository must return `404 Not Found`.
- [ ] Requests targeting a non-existent issue number must return `404 Not Found`.
- [ ] Requests targeting a non-existent owner must return `404 Not Found`.
- [ ] PAT-based authentication must work identically to session-based authentication.

## Design

### API Shape

#### Add Assignees

**Endpoint:** `POST /api/repos/:owner/:repo/issues/:number/assignees`

**Authentication:** Required. Session cookie, PAT via `Authorization: Bearer <token>`, or OAuth2 token.

**Content-Type:** `application/json`

**Request Body:**
```typescript
interface AddAssigneesRequest {
  assignees: string[];  // Required. 1–10 valid usernames.
}
```

**Success Response:** `200 OK`
```typescript
interface AssigneeListResponse {
  assignees: Array<{
    id: number;
    login: string;
    avatar_url: string;
  }>;
}
```

The response returns the **complete** current assignee list after the addition, not just the newly added assignees.

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Malformed JSON / missing body | `{ message: "invalid request body" }` |
| 401 | Not authenticated | `{ message: "authentication required" }` |
| 403 | No write access | `{ message: "permission denied" }` |
| 404 | Repository or issue not found | `{ message: "not found" }` |
| 422 | Validation failure (invalid username, too many, etc.) | `{ message: "validation failed", errors: [{ resource, field, code }] }` |
| 429 | Rate limited | `{ message: "rate limit exceeded" }` with `Retry-After` header |

#### Remove Assignee

**Endpoint:** `DELETE /api/repos/:owner/:repo/issues/:number/assignees/:username`

**Authentication:** Required.

**Success Response:** `204 No Content`

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 401 | Not authenticated | `{ message: "authentication required" }` |
| 403 | No write access | `{ message: "permission denied" }` |
| 404 | Repository or issue not found | `{ message: "not found" }` |
| 429 | Rate limited | `{ message: "rate limit exceeded" }` with `Retry-After` header |

Removing an assignee who is not assigned returns `204` (idempotent).

#### List Assignees

**Endpoint:** `GET /api/repos/:owner/:repo/issues/:number/assignees`

**Authentication:** Optional (respects repository visibility).

**Success Response:** `200 OK`
```typescript
{
  assignees: Array<{
    id: number;
    login: string;
    avatar_url: string;
  }>;
}
```

This is a convenience endpoint. Assignees are also returned in the standard issue GET response.

### SDK Shape

The `IssueService` gains three new public methods:

```typescript
class IssueService {
  // Existing
  async updateIssue(actor, owner, repo, number, { assignees, ... }): Promise<IssueResponse>;

  // New
  async addAssignees(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    usernames: string[],
  ): Promise<AssigneeListResponse>;

  async removeAssignee(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    username: string,
  ): Promise<void>;

  async listAssignees(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<AssigneeListResponse>;
}
```

`addAssignees` validates all usernames, checks the 10-assignee cap (current count + new unique usernames ≤ 10), adds non-duplicate entries, and returns the full assignee list. `removeAssignee` removes a single assignee row by username lookup. `listAssignees` returns the current assignee list.

### CLI Command

#### Dedicated Commands

```
codeplane issue assign <number> <username> [<username>...] [--repo <owner/repo>] [--json]
codeplane issue unassign <number> <username> [--repo <owner/repo>] [--json]
```

**`issue assign`:**

| Argument/Flag | Required | Description |
|---------------|----------|-------------|
| `<number>` | Yes | Issue number (positional) |
| `<username>` | Yes (1+) | Username(s) to assign (positional, repeatable) |
| `--repo` / `-R` | No | Repository in `owner/repo` format |
| `--json` | No | Output raw JSON response |

**Output (default):** `Assigned alice, bob to issue #42`

**Output (--json):** Full `AssigneeListResponse` JSON.

**`issue unassign`:**

| Argument/Flag | Required | Description |
|---------------|----------|-------------|
| `<number>` | Yes | Issue number (positional) |
| `<username>` | Yes | Username to unassign (positional) |
| `--repo` / `-R` | No | Repository in `owner/repo` format |
| `--json` | No | Output raw JSON response |

**Output (default):** `Unassigned alice from issue #42`

#### Existing `issue edit` Enhancements

```
codeplane issue edit <number> --add-assignee <username> [--add-assignee <username>...] [--remove-assignee <username>] [--repo <owner/repo>] [--json]
```

| Flag | Description |
|------|-------------|
| `--add-assignee` | Add assignee(s). Repeatable. Uses `POST .../assignees`. |
| `--remove-assignee` | Remove assignee(s). Repeatable. Uses `DELETE .../assignees/:username`. |
| `--assignee` | Full replacement (existing behavior). Uses `PATCH .../issues/:number`. |

When `--add-assignee` and `--remove-assignee` are both provided in the same command, removals are processed first, then additions.

### Web UI Design

**Issue Detail Page — Assignee Sidebar Section:**

The issue detail page at `/:owner/:repo/issues/:number` includes an "Assignees" section in the right sidebar.

| Element | Behavior |
|---------|----------|
| Section header | "Assignees" with a gear icon (⚙) button visible only to users with write access |
| Current assignees | List of avatar + username, each with an `×` remove button on hover (write access only) |
| Empty state | "No one assigned" text with a "assign yourself" link (write access only) |
| Gear icon click | Opens a searchable dropdown overlay listing repository collaborators |
| Dropdown overlay | Typeahead search. Checkmarks next to currently assigned users. Click toggles assignment. Clicking an unchecked user calls the add endpoint. Clicking a checked user calls the remove endpoint. |
| "assign yourself" link | Calls the add endpoint with the current user's username. Updates inline immediately. |
| Remove `×` button | Calls the remove endpoint. Removes the user inline with optimistic UI. |

**Optimistic UI behavior:**
- Adding: the user avatar appears immediately in the assignee list. If the API call fails, the avatar is removed and an error toast is shown.
- Removing: the user avatar disappears immediately. If the API call fails, it reappears and an error toast is shown.

### TUI UI

The TUI issue edit form's assignee overlay (already specified in `TUI_ISSUE_EDIT_FORM`) uses the dedicated add/remove endpoints under the hood. When a user toggles an assignee in the multi-select overlay:

- Selecting (checking) a user calls `POST .../assignees` with that single username.
- Deselecting (unchecking) a user calls `DELETE .../assignees/:username`.

This replaces the current full-replacement PATCH approach for assignees in the TUI, enabling granular changes without race conditions when multiple users are editing the same issue concurrently.

The issue detail view in the TUI also shows the current assignees and supports `a` as a shortcut to open the assignee overlay directly from the detail view.

### VS Code Extension

The VS Code extension adds:

- **Context menu action** on issue tree items: "Assign User..." opens a QuickPick with collaborators.
- **Context menu action** on issue tree items: "Unassign User..." opens a QuickPick showing current assignees.
- **Command:** `Codeplane: Assign Issue` — prompts for issue number and username.
- **Command:** `Codeplane: Unassign Issue` — prompts for issue number and shows current assignees to remove.
- On success: information notification "Assigned alice to #42" or "Unassigned bob from #42".

### Neovim Plugin

The Neovim plugin adds:

- **Command:** `:CodeplaneIssueAssign <number> <username>` — adds an assignee.
- **Command:** `:CodeplaneIssueUnassign <number> <username>` — removes an assignee.
- Telescope integration: `:CodeplaneIssueAssign` without args opens a Telescope picker for the issue, then a second picker for collaborators.
- On success: echoes "Assigned alice to #42".

### Documentation

End-user documentation must include:

- **Issues guide update**: Add a section on "Managing assignees" covering add, remove, self-assign, and bulk assignment workflows across Web, CLI, and TUI.
- **API reference**: Document `POST /api/repos/:owner/:repo/issues/:number/assignees`, `DELETE /api/repos/:owner/:repo/issues/:number/assignees/:username`, and `GET /api/repos/:owner/:repo/issues/:number/assignees` with full request/response examples and error codes.
- **CLI reference**: Document `codeplane issue assign`, `codeplane issue unassign`, and the `--add-assignee` / `--remove-assignee` flags on `issue edit`.
- **TUI reference**: Document the `a` shortcut for assignee overlay and the toggle behavior.
- **Editor integration guides**: Document the VS Code commands and Neovim commands for assignee management.
- **Permissions guide**: Clarify that write access is required for assignee changes, and that any valid user (not just collaborators) can be assigned.

## Permissions & Security

### Authorization Matrix

| Role | Can Add Assignees? | Can Remove Assignees? | Can List Assignees? |
|------|--------------------|-----------------------|---------------------|
| Repository Owner | ✅ Yes | ✅ Yes | ✅ Yes |
| Organization Owner (for org repos) | ✅ Yes | ✅ Yes | ✅ Yes |
| Admin Collaborator | ✅ Yes | ✅ Yes | ✅ Yes |
| Write Collaborator | ✅ Yes | ✅ Yes | ✅ Yes |
| Read Collaborator | ❌ No (403) | ❌ No (403) | ✅ Yes |
| Non-collaborator on public repo | ❌ No (403) | ❌ No (403) | ✅ Yes |
| Non-collaborator on private repo | ❌ No (404) | ❌ No (404) | ❌ No (404) |
| Unauthenticated on public repo | ❌ No (401) | ❌ No (401) | ✅ Yes |
| Unauthenticated on private repo | ❌ No (401) | ❌ No (401) | ❌ No (404) |
| AI Agent (with valid PAT + write access) | ✅ Yes | ✅ Yes | ✅ Yes |
| Deploy Key | ❌ No | ❌ No | ❌ No |

### Rate Limiting

- **Add assignees:** 60 requests per hour per user per repository.
- **Remove assignee:** 60 requests per hour per user per repository.
- **List assignees:** Standard API read rate limit (no special limit).
- **Global per-user:** 300 assignee mutation requests per hour across all repositories.
- Rate limit responses return `429 Too Many Requests` with `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- Rate limit state keyed on `user_id`.

### Data Privacy & PII

- Assignee usernames and avatar URLs are public information for public repos and visible to all collaborators on private repos.
- Assignee validation does not leak user existence — if a username is invalid, the error says "invalid" not "user not found", preventing user enumeration.
- The remove endpoint uses `204` for both "was assigned and removed" and "was not assigned" to prevent information leakage about current assignment state to unauthorized callers (though the authorization check runs first).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.assignee.added` | Assignee(s) successfully added (200 response on POST) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `actor_login`, `added_usernames[]`, `added_count`, `total_assignee_count`, `is_self_assign` (bool), `client_surface` ("api" \| "web" \| "cli" \| "tui" \| "vscode" \| "nvim" \| "agent"), `timestamp` |
| `issue.assignee.removed` | Assignee successfully removed (204 response on DELETE) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `actor_login`, `removed_username`, `total_assignee_count`, `is_self_unassign` (bool), `client_surface`, `timestamp` |
| `issue.assignee.replaced` | Assignees replaced via PATCH (existing behavior) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `previous_count`, `new_count`, `added_usernames[]`, `removed_usernames[]`, `client_surface`, `timestamp` |
| `issue.assignee.add_failed` | Add assignee request rejected (4xx) | `repo_owner`, `repo_name`, `error_code`, `error_field`, `attempted_usernames[]`, `client_surface`, `timestamp` |
| `issue.assignee.remove_failed` | Remove assignee request rejected (4xx) | `repo_owner`, `repo_name`, `error_code`, `attempted_username`, `client_surface`, `timestamp` |

### Funnel Metrics & Success Indicators

1. **Self-Assign Rate:** Percentage of assignee-add events where `is_self_assign=true`. High self-assign indicates healthy ownership culture. Target: >30% of add events.
2. **Assignee Attachment Rate:** Percentage of open issues with at least one assignee. Target: >50%.
3. **Add vs. Replace Ratio:** Percentage of assignee changes using the dedicated add/remove endpoints vs. the full-replacement PATCH. Target: >70% using dedicated endpoints after launch (indicates adoption).
4. **Agent Assignment Rate:** Percentage of assignee-add events from `client_surface="agent"`. Measures agent adoption of the feature.
5. **Error Rate:** `issue.assignee.add_failed / (issue.assignee.added + issue.assignee.add_failed)`. Target: <5%.
6. **Median Assignee Count per Issue:** Tracks team collaboration patterns. Expected: 1–2.

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Assignees added to issue | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `actor_id`, `added_usernames`, `total_count`, `duration_ms` | After successful add |
| Assignee removed from issue | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `actor_id`, `removed_username`, `total_count`, `duration_ms` | After successful removal |
| Assignee add validation failure | `warn` | `repo_name`, `owner`, `field`, `code`, `actor_id`, `attempted_usernames` | When service throws `validationFailed` |
| Assignee add auth failure | `warn` | `repo_name`, `owner`, `reason` ("unauthenticated" \| "forbidden"), `actor_id` | When 401 or 403 returned |
| Assignee cap exceeded | `warn` | `repo_id`, `issue_number`, `current_count`, `attempted_add_count`, `actor_id` | When add would exceed 10-assignee cap |
| Assignee username resolution failure | `warn` | `repo_id`, `issue_number`, `username`, `actor_id` | When username doesn't resolve to a user |
| Assignee add internal error | `error` | `repo_id`, `owner`, `repo_name`, `issue_number`, `actor_id`, `error_message`, `stack_trace` | When DB operation fails |
| Assignee remove internal error | `error` | `repo_id`, `owner`, `repo_name`, `issue_number`, `username`, `actor_id`, `error_message`, `stack_trace` | When DB delete fails |
| Duplicate assignee skipped | `debug` | `repo_id`, `issue_number`, `username` | When add encounters existing assignment (no-op) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_assignees_added_total` | Counter | `owner`, `repo` | Total assignees added via dedicated endpoint |
| `codeplane_issue_assignees_removed_total` | Counter | `owner`, `repo` | Total assignees removed via dedicated endpoint |
| `codeplane_issue_assignee_add_duration_seconds` | Histogram | `status` (success/error) | Latency of add-assignee operation |
| `codeplane_issue_assignee_remove_duration_seconds` | Histogram | `status` (success/error) | Latency of remove-assignee operation |
| `codeplane_issue_assignee_errors_total` | Counter | `error_type` (validation/auth/not_found/internal/rate_limit/too_many), `operation` (add/remove) | Assignee operation failures by type |
| `codeplane_issue_assignee_count_gauge` | Gauge | `repo_id` | Average assignee count per issue (sampled periodically) |
| `codeplane_issue_assignee_cap_rejections_total` | Counter | `owner`, `repo` | Times the 10-assignee cap was hit |

### Alerts & Runbooks

#### Alert: `IssueAssigneeErrorRateHigh`

**Condition:** `rate(codeplane_issue_assignee_errors_total{error_type="internal"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server logs for `assignee add/remove internal error` entries. Look for `error_message` and `stack_trace`.
2. Check database connectivity: run `SELECT 1` against the primary DB. If unreachable, escalate to database on-call.
3. Check if the `issue_assignees` table is experiencing lock contention. Query: `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%issue_assignees%'`.
4. Check for recent deployments that may have introduced a regression in the assignee service.
5. Verify the `issue_assignees` table schema hasn't been corrupted — check that the unique constraint on `(issue_id, user_id)` exists.
6. If specific to one repository, check for an unusually large number of concurrent assignee operations.

#### Alert: `IssueAssigneeLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_issue_assignee_add_duration_seconds_bucket[5m])) > 1.0`

**Severity:** Warning

**Runbook:**
1. Check database query latency for `issue_assignees` table operations via `pg_stat_statements`.
2. Check if username resolution is slow — each username requires a `users` table lookup. If many usernames are being added per request, this is O(n) lookups.
3. Check for lock contention on the `issue_assignees` table from concurrent writes.
4. Check if the notification fanout triggered by assignee changes is blocking the response (it should be async).
5. Profile a sample request to identify the slow component.

#### Alert: `IssueAssigneeCapFrequentlyHit`

**Condition:** `rate(codeplane_issue_assignee_cap_rejections_total[1h]) > 5`

**Severity:** Info

**Runbook:**
1. Identify which repositories are hitting the cap via logs.
2. Determine if this represents a legitimate use case (large teams) or misuse (automation bug).
3. If legitimate and widespread, consider raising the cap from 10 to 20 in a future release.
4. If automation-related, contact the user/team to understand their workflow.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Failure Mode | Recovery |
|------------|-------------|--------------|----------|
| Empty assignees array in add request | 422 | Predictable validation | User provides usernames |
| Username doesn't exist | 422 | Predictable validation | User corrects username |
| Mix of valid and invalid usernames | 422 | Atomic rejection — no partial apply | User fixes invalid usernames |
| Exceeds 10-assignee cap | 422 | Predictable cap enforcement | User removes assignees first |
| More than 10 usernames in single request | 422 | Predictable input limit | User splits into smaller batches |
| Username in remove endpoint is empty | 400 | Bad request | User provides username |
| Adding already-assigned user | 200 | Idempotent no-op | None needed |
| Removing not-assigned user | 204 | Idempotent no-op | None needed |
| Issue not found | 404 | Expected resolution failure | User corrects issue number |
| Repository not found | 404 | Expected resolution failure | User corrects owner/repo |
| Unauthenticated | 401 | Expected auth boundary | User authenticates |
| No write permission | 403 | Expected auth boundary | User requests access |
| Rate limited | 429 | Expected throttle | User waits for `Retry-After` |
| DB connection lost | 500 | Infrastructure failure | Alert fires, on-call investigates |
| Unique constraint race condition | 200 | Handled gracefully (skip duplicate) | None needed |
| Malformed JSON body | 400 | Client error | User fixes request format |

## Verification

### API Integration Tests

```
POST /api/repos/:owner/:repo/issues/:number/assignees
├── Happy Path
│   ├── adds a single assignee to an issue with no assignees — returns 200, assignees contains the user
│   ├── adds a single assignee to an issue with existing assignees — returns 200, all assignees present (old + new)
│   ├── adds multiple assignees in one request — returns 200, all added users present
│   ├── adds 10 assignees to an issue with 0 assignees (maximum) — returns 200, all 10 present
│   ├── adds assignee with different casing than stored username — returns 200, resolves correctly
│   ├── adds assignee with leading/trailing whitespace in username — returns 200, trimmed and resolved
│   ├── adds already-assigned user (idempotent) — returns 200, assignee count unchanged
│   ├── adds mix of new and already-assigned users — returns 200, only new ones added
│   ├── adds assignee to closed issue — returns 200
│   ├── adds assignee to locked issue — returns 200
│   ├── self-assignment (actor assigns self) — returns 200
│   ├── response assignees are ordered alphabetically by username
│   ├── response includes id, login, and avatar_url for each assignee
│   ├── duplicate usernames in request array are deduplicated — returns 200, user appears once
│   └── assigning non-collaborator user succeeds — returns 200
│
├── Validation Errors
│   ├── empty assignees array [] — returns 422, code="missing_field"
│   ├── username does not exist — returns 422, code="invalid"
│   ├── one valid and one invalid username — returns 422, no assignees added (atomic)
│   ├── empty string username in array [""] — returns 422
│   ├── whitespace-only username in array ["  "] — returns 422
│   ├── would exceed 10-assignee cap (issue has 8, adding 3) — returns 422, code="too_many"
│   ├── adding 11 users to empty issue in one request — returns 422, code="too_many"
│   ├── request body with more than 10 usernames — returns 422
│   └── null assignees field — returns 422
│
├── Authentication & Authorization
│   ├── unauthenticated request — returns 401
│   ├── PAT-authenticated with write access — returns 200
│   ├── session-authenticated with write access — returns 200
│   ├── authenticated user with read-only access — returns 403
│   ├── authenticated user with no access to private repo — returns 404
│   ├── expired/invalid PAT — returns 401
│   └── deploy key — returns 401 or 403
│
├── Repository & Issue Resolution
│   ├── non-existent owner — returns 404
│   ├── non-existent repo — returns 404
│   ├── non-existent issue number — returns 404
│   ├── issue number 0 — returns 400
│   ├── issue number negative — returns 400
│   └── issue number non-integer — returns 400
│
├── Request Format
│   ├── non-JSON content type — returns 400 or 415
│   ├── malformed JSON body — returns 400
│   ├── missing assignees key in body — returns 422
│   └── extra unknown fields in body — returns 200 (ignored)
│
├── Rate Limiting
│   └── exceeding rate limit — returns 429 with Retry-After header
│
└── Concurrency
    ├── two concurrent add requests with different users — both succeed, all users assigned
    └── two concurrent add requests with the same user — both return 200, user assigned once

DELETE /api/repos/:owner/:repo/issues/:number/assignees/:username
├── Happy Path
│   ├── removes an existing assignee — returns 204, assignee no longer in issue
│   ├── removes one of multiple assignees — returns 204, other assignees unaffected
│   ├── removes the last assignee — returns 204, issue has no assignees
│   ├── removes non-assigned user (idempotent) — returns 204
│   ├── username is case-insensitive — returns 204
│   ├── remove from closed issue — returns 204
│   └── self-unassignment — returns 204
│
├── Authentication & Authorization
│   ├── unauthenticated — returns 401
│   ├── read-only access — returns 403
│   ├── no access to private repo — returns 404
│   └── write access — returns 204
│
├── Resolution Errors
│   ├── non-existent owner — returns 404
│   ├── non-existent repo — returns 404
│   ├── non-existent issue number — returns 404
│   ├── empty username in URL path — returns 400
│   └── issue number 0 — returns 400
│
└── Rate Limiting
    └── exceeding rate limit — returns 429

GET /api/repos/:owner/:repo/issues/:number/assignees
├── Happy Path
│   ├── lists assignees for issue with multiple assignees — returns 200 with all assignees
│   ├── lists assignees for issue with no assignees — returns 200 with empty array
│   ├── assignees ordered alphabetically by username
│   ├── read-only user can list assignees — returns 200
│   └── unauthenticated user can list on public repo — returns 200
│
├── Resolution Errors
│   ├── non-existent issue — returns 404
│   ├── private repo without access — returns 404
│   └── non-existent repo — returns 404
│
└── Backward Compatibility
    ├── PATCH with assignees field still performs full replacement
    ├── PATCH with assignees: [] clears all assignees
    └── GET issue detail still includes assignees in response
```

### CLI E2E Tests

```
codeplane issue assign / unassign
├── issue assign <number> <username> — output contains "Assigned alice to issue #42"
├── issue assign <number> <username1> <username2> — assigns multiple, output lists both
├── issue assign with --json — output is valid JSON with assignees array
├── issue assign with --repo flag — assigns in specified repo
├── issue assign self — succeeds
├── issue assign already-assigned user — succeeds (idempotent), output confirms
├── issue assign non-existent user — exits non-zero with validation error
├── issue assign without username — exits non-zero with usage error
├── issue assign to non-existent issue — exits non-zero with 404 error
├── issue assign without auth — exits non-zero with auth error
├── issue assign without write access — exits non-zero with permission error
├── issue unassign <number> <username> — output contains "Unassigned alice from issue #42"
├── issue unassign with --json — output is valid JSON
├── issue unassign non-assigned user — succeeds (idempotent)
├── issue unassign without username — exits non-zero with usage error
├── issue edit <number> --add-assignee alice — adds alice, output shows updated issue
├── issue edit <number> --add-assignee alice --add-assignee bob — adds both
├── issue edit <number> --remove-assignee alice — removes alice
├── issue edit <number> --add-assignee bob --remove-assignee alice — removes first, then adds
├── lifecycle: create → assign → view (verify assigned) → unassign → view (verify unassigned)
└── lifecycle: create → assign alice → assign bob → unassign alice → view (only bob)
```

### Web UI Playwright Tests

```
Issue Assignee Sidebar (/:owner/:repo/issues/:number)
├── Rendering
│   ├── issue with no assignees shows "No one assigned" and "assign yourself" link
│   ├── issue with one assignee shows avatar + username
│   ├── issue with multiple assignees shows all avatars + usernames
│   ├── gear icon visible for write-access user
│   ├── gear icon hidden for read-only user
│   ├── remove (×) button visible on hover for write-access user
│   └── remove (×) button hidden for read-only user
│
├── Add Assignee
│   ├── clicking gear icon opens assignee dropdown
│   ├── dropdown shows collaborators with typeahead search
│   ├── typing in search filters collaborator list
│   ├── clicking unchecked collaborator adds assignee (assignee appears in sidebar)
│   ├── dropdown shows checkmark next to currently assigned users
│   ├── clicking "assign yourself" adds current user as assignee
│   ├── adding assignee shows success (avatar appears)
│   └── adding assignee when API fails shows error toast and reverts
│
├── Remove Assignee
│   ├── clicking × on assignee removes them from sidebar
│   ├── removal happens optimistically (instant UI update)
│   ├── removing assignee when API fails shows error toast and restores avatar
│   └── removing last assignee shows "No one assigned" state
│
├── Permissions
│   ├── read-only user cannot see add/remove controls
│   ├── unauthenticated user on public repo sees assignees but no edit controls
│   └── 403 error shows "permission denied" toast
│
└── Edge Cases
    ├── rapid add + remove doesn't create inconsistent state
    ├── refreshing page after add shows persisted assignee
    └── concurrent edits from another user are reflected on next data refresh
```

### TUI Integration Tests

```
TUI Issue Assignee Editing
├── Assignee Overlay
│   ├── pressing 'a' from issue detail opens assignee overlay
│   ├── overlay shows all collaborators
│   ├── currently assigned users have ✓ prefix
│   ├── selecting unchecked user adds assignee via POST endpoint
│   ├── deselecting checked user removes assignee via DELETE endpoint
│   ├── Space toggles selection
│   ├── Enter confirms and closes overlay
│   ├── Esc closes overlay without changes (pending toggles still applied via API)
│   └── j/k navigates options
│
├── Issue Edit Form Integration
│   ├── assignee overlay in edit form works same as detail view
│   └── changes via overlay reflected in form state
│
└── Issue Detail View
    ├── issue with assignees shows usernames in detail view
    └── issue with no assignees shows empty assignee section
```

### Webhook Integration Tests

```
Issue Assignee Webhooks
├── webhook with "issues" event fires with action="assigned" when assignee added
├── webhook payload includes full issue object and assignee details
├── webhook with "issues" event fires with action="unassigned" when assignee removed
├── webhook fires once per add-assignee request (not per individual user in batch)
├── webhook delivery is recorded in webhook deliveries list
└── webhook does not fire when adding already-assigned user (no-op)
```

### Notification Integration Tests

```
Issue Assignee Notifications
├── newly assigned user receives notification
├── notification includes issue number, title, and assigning user
├── self-assignment does not send notification to self
├── unassignment does not send a "you were unassigned" notification (design decision: future enhancement)
└── notification respects user notification preferences
```

# ISSUE_MILESTONE_EDIT

Specification for ISSUE_MILESTONE_EDIT.

## High-Level User POV

When a Codeplane user is working on an issue, they frequently need to associate that issue with a milestone — a time-bound goal like "v1.0 release" or "Q2 stability sprint" — so the team can track progress toward a concrete delivery target. Milestone editing on issues is the mechanism that connects individual pieces of work to broader project goals. Without it, milestones exist in isolation and teams lose the ability to see how far along a release or sprint really is.

From any Codeplane surface — the web UI sidebar on an issue detail page, a CLI command, a TUI edit form, or an editor integration — a user selects a milestone for an issue from a list of the repository's milestones, or clears the current milestone to un-associate the issue. The change takes effect immediately. Other team members and agents viewing the issue see the updated milestone. Webhooks fire and notifications propagate so downstream tools stay in sync. When someone opens a milestone's detail view, the issue now appears in its list of associated issues, contributing to the milestone's completion percentage.

Milestone editing is a lightweight, fast metadata operation. A project lead triaging the backlog might tag twenty issues with a milestone in rapid succession. An automation agent resolving an issue might set the milestone programmatically when the relevant landing request targets a release branch. The experience must be immediate, forgiving of minor errors, and consistent across all product surfaces. Unlike assignees and labels which allow multiple values, a milestone is a single-select field — an issue belongs to exactly zero or one milestone at a time.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access can set a milestone on an issue via `PATCH /api/repos/:owner/:repo/issues/:number` with `{ "milestone": <id> }` and receive a `200` response with the updated issue containing the `milestone_id` field.
- [ ] An authenticated user with write access can clear a milestone from an issue via `PATCH /api/repos/:owner/:repo/issues/:number` with `{ "milestone": null }` and receive a `200` response with `milestone_id: null`.
- [ ] An authenticated user with write access can set a milestone on issue creation via `POST /api/repos/:owner/:repo/issues` with `{ "milestone": <id> }`.
- [ ] The CLI `issue edit` command supports a `--milestone <id>` flag to set the milestone and `--milestone 0` to clear it.
- [ ] The CLI `issue create` command supports a `--milestone <id>` flag to set the milestone at creation time.
- [ ] The Web UI issue detail page provides a "Milestone" section in the right sidebar with an inline selector to set or clear the milestone.
- [ ] The TUI issue edit form includes a milestone single-select overlay.
- [ ] The TUI issue create form includes a milestone single-select overlay.
- [ ] Webhook events fire for the `issues` event type with action `milestoned` / `demilestoned` upon milestone changes.
- [ ] All clients (Web UI, CLI, TUI, VS Code, Neovim) can trigger milestone edits through their respective interfaces.

### Required Field Constraints

- [ ] The `milestone` field in issue create and edit requests must be a non-negative integer or `null`.
- [ ] Milestone ID `0` in the PATCH request body is treated as equivalent to `null` (clears the milestone).
- [ ] The milestone ID must reference a valid, existing milestone in the same repository. Invalid or cross-repository milestone IDs must be rejected with `422`: `{ resource: "Issue", field: "milestone", code: "invalid" }`.
- [ ] Both open and closed milestones can be associated with an issue. Milestone state does not restrict association.
- [ ] When `milestone` key is absent from the PATCH request body, the milestone is not changed (distinguish "absent" from "explicitly null").

### Boundary Constraints

- [ ] Milestone IDs must be positive integers (or `null`/`0` for clearing). Negative values must return `422`.
- [ ] Milestone IDs must be 64-bit safe integers. Values exceeding `Number.MAX_SAFE_INTEGER` must return `422`.
- [ ] Non-integer milestone values (strings, booleans, objects, arrays) must return `400` (malformed request).
- [ ] Maximum one milestone per issue at any time (single-select, not multi-select).

### Edge Cases

- [ ] Setting the milestone to the milestone already associated with the issue must be a no-op (idempotent). The response returns `200` with the issue unchanged.
- [ ] Clearing the milestone when no milestone is set must be a no-op (idempotent). The response returns `200` with `milestone_id: null`.
- [ ] Setting a milestone on a closed issue must succeed. Milestone association is orthogonal to issue state.
- [ ] Setting a milestone on a locked issue must succeed for users with write access. Lock restricts comments, not metadata edits.
- [ ] Setting a closed milestone on an issue must succeed. Users may need to move issues into historical milestones for retroactive tracking.
- [ ] Deleting a milestone (via the milestones API) must automatically clear the `milestone_id` on all issues that reference it.
- [ ] Concurrent milestone edits on the same issue must resolve cleanly — the last write wins and the response reflects the final state.
- [ ] The `milestone_id` in issue list responses must reflect the current milestone.

### Authentication & Authorization Boundaries

- [ ] Unauthenticated requests to set/clear milestone must return `401 Unauthorized`.
- [ ] Authenticated users without write access to the repository must return `403 Forbidden`.
- [ ] Requests targeting a non-existent repository must return `404 Not Found`.
- [ ] Requests targeting a non-existent issue number must return `404 Not Found`.
- [ ] Requests targeting a non-existent owner must return `404 Not Found`.
- [ ] PAT-based authentication must work identically to session-based authentication.
- [ ] Reading the `milestone_id` field on public-repo issues must work for unauthenticated users.

## Design

### API Shape

#### Set Milestone on Issue Edit

**Endpoint:** `PATCH /api/repos/:owner/:repo/issues/:number`

**Authentication:** Required. Session cookie, PAT via `Authorization: Bearer <token>`, or OAuth2 token.

**Content-Type:** `application/json`

**Request Body (milestone-relevant fields):**
```typescript
interface PatchIssueRequestBody {
  // ... other fields (title, body, state, assignees, labels)
  milestone?: number | null;  // Set to milestone ID, or null/0 to clear
}
```

**Milestone Detection Logic:**
- If the `"milestone"` key is present in the JSON body (including when its value is `null`), the milestone is updated.
- If the `"milestone"` key is absent, the milestone is left unchanged.
- If the value is `null` or `0`, the milestone is cleared.
- If the value is a positive integer, it is resolved to a milestone in the same repository.

**Success Response:** `200 OK`
```typescript
interface IssueResponse {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  author: { id: number; login: string };
  assignees: Array<{ id: number; login: string }>;
  labels: Array<{ id: number; name: string; color: string; description: string }>;
  milestone_id: number | null;
  comment_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
```

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Malformed JSON / missing body | `{ message: "invalid request body" }` |
| 401 | Not authenticated | `{ message: "authentication required" }` |
| 403 | No write access | `{ message: "permission denied" }` |
| 404 | Repository, issue, or owner not found | `{ message: "not found" }` |
| 422 | Milestone ID invalid or not in repo | `{ message: "validation failed", errors: [{ resource: "Issue", field: "milestone", code: "invalid" }] }` |
| 429 | Rate limited | `{ message: "rate limit exceeded" }` with `Retry-After` header |

#### Set Milestone on Issue Create

**Endpoint:** `POST /api/repos/:owner/:repo/issues`

**Request Body (milestone-relevant fields):**
```typescript
interface CreateIssueRequestBody {
  title: string;
  body: string;
  // ... other fields
  milestone?: number;  // Optional milestone ID
}
```

Same validation and error behavior as the edit path. If the milestone ID is invalid or not found in the repository, the entire issue creation is rejected with `422`.

### SDK Shape

The existing `IssueService` methods already support milestone editing:

```typescript
class IssueService {
  async createIssue(
    actor: AuthUser,
    owner: string,
    repo: string,
    req: {
      title: string;
      body: string;
      assignees?: string[];
      labels?: string[];
      milestone?: number;
    },
  ): Promise<IssueResponse>;

  async updateIssue(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    req: {
      title?: string;
      body?: string;
      state?: string;
      assignees?: string[];
      labels?: string[];
      milestone?: IssueMilestonePatch;
    },
  ): Promise<IssueResponse>;
}

interface IssueMilestonePatch {
  value: number | null;  // null clears, number sets
}
```

The `resolveIssueMilestone` private method handles validation: `null` → returns `null` (clear), `<= 0` → throws `validationFailed`, positive integer → looks up milestone in same repository, throws `validationFailed` if not found.

### CLI Command

#### `issue create` Enhancement

```
codeplane issue create <title> [options]
```

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--milestone` | number | No | Milestone ID to associate with the new issue |

**Example:**
```bash
codeplane issue create "Fix login flow" --body "Login is broken" --milestone 3
```

#### `issue edit` Enhancement

```
codeplane issue edit <number> [options]
```

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--milestone` | number | No | Set milestone by ID. Pass `0` to clear. |

**Examples:**
```bash
# Set milestone
codeplane issue edit 42 --milestone 3

# Clear milestone
codeplane issue edit 42 --milestone 0
```

**Output (default):** `Updated issue #42` followed by the issue summary including the milestone.
**Output (--json):** Full `IssueResponse` JSON.

### Web UI Design

**Issue Detail Page — Milestone Sidebar Section:**

The issue detail page at `/:owner/:repo/issues/:number` includes a "Milestone" section in the right sidebar, positioned below Labels.

| Element | Behavior |
|---------|----------|
| Section header | "Milestone" with a gear icon (⚙) button visible only to users with write access |
| Current milestone | Displays milestone title as a clickable link. Shows state badge and optional due date. |
| Empty state | "No milestone" text |
| Gear icon click | Opens a single-select dropdown overlay listing the repository's milestones |
| Dropdown overlay | Sorted with open milestones first, then closed. Each entry shows title, due date (if set), and a radio-style indicator for the currently selected milestone. A "Clear milestone" option at the top sets to none. Typeahead search filters the list by title. |
| Selecting a milestone | Sends `PATCH` with `{ milestone: <id> }`. Updates inline immediately with optimistic UI. |
| "Clear milestone" | Sends `PATCH` with `{ milestone: null }`. Removes milestone inline immediately. |

**Optimistic UI behavior:**
- Setting: the new milestone title appears immediately. If the API call fails, the previous milestone is restored and an error toast is shown.
- Clearing: "No milestone" appears immediately. If the API call fails, the old milestone title is restored and an error toast is shown.

**Issue Create Page:**
The issue create form at `/:owner/:repo/issues/new` includes a Milestone selector in the sidebar. Dropdown shows open milestones. Defaults to "None".

### TUI UI

**Issue Edit Form — Milestone Overlay:**

```
┌─ Edit Issue #7 ──────────────────────────────────────┐
│ Title:     [text input]                               │
│ Body:      [multi-line textarea]                      │
│ Labels:    [bug] [enhancement]     (Enter to select)  │
│ Assignees: [alice] [bob]           (Enter to select)  │
│ Milestone: v1.0                    (Enter to select)  │
│              [Save (Ctrl+S)] [Cancel (Esc)]           │
└──────────────────────────────────────────────────────┘
```

| Element | Behavior |
|---------|----------|
| Milestone field | Displays current milestone title or "None" |
| Enter on milestone field | Opens single-select overlay listing repository milestones |
| Overlay contents | All milestones (open listed first, then closed), plus "None" option at top |
| j/k navigation | Moves selection up/down in overlay |
| Enter/Space | Confirms selection, closes overlay, updates field |
| Esc | Closes overlay without changing selection |
| Tab order | Title → Body → Labels → Assignees → Milestone → Save → Cancel |

**Issue Detail View:** Pressing `m` opens the milestone overlay for quick editing.

### VS Code Extension

- **Context menu action** on issue tree items: "Set Milestone..." opens a QuickPick listing repository milestones with a "None (clear)" option.
- **Command:** `Codeplane: Set Issue Milestone` — prompts for issue number, then shows milestone QuickPick.
- On success: information notification "Set milestone 'v1.0' on issue #42" or "Cleared milestone on issue #42".

### Neovim Plugin

- **Command:** `:CodeplaneIssueMilestone <number> <milestone_id>` — sets the milestone (use `0` to clear).
- **Command:** `:CodeplaneIssueMilestone <number>` (without ID) — opens a Telescope picker listing repository milestones for selection.
- On success: echoes "Set milestone 'v1.0' on issue #42".

### Documentation

End-user documentation must include:

- **Issues guide update**: Add a section on "Managing milestones on issues" covering setting, clearing, and browsing milestones from Web, CLI, and TUI. Explain that an issue can have at most one milestone, and that both open and closed milestones can be associated.
- **API reference**: Document the `milestone` field on `POST /api/repos/:owner/:repo/issues` and `PATCH /api/repos/:owner/:repo/issues/:number` with full request/response examples and error codes. Include examples for setting, clearing, and the "absent vs null" distinction.
- **CLI reference**: Document the `--milestone` flag on `issue create` and `issue edit` commands with usage examples. Document the `--milestone 0` convention for clearing.
- **TUI reference**: Document the `m` shortcut for milestone editing from issue detail view and the milestone overlay in edit/create forms.
- **Editor integration guides**: Document the VS Code QuickPick flow and the Neovim `:CodeplaneIssueMilestone` command.
- **Milestones guide update**: Add a section explaining how milestones connect to issues, including that deleting a milestone automatically clears the association on all affected issues.

## Permissions & Security

### Authorization Matrix

| Role | Can Set Milestone? | Can Clear Milestone? | Can Read Milestone on Issue? |
|------|--------------------|-----------------------|------|
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

- **Issue edit (including milestone changes):** Standard issue mutation rate limit — 60 requests per hour per user per repository.
- **Issue create:** Standard issue creation rate limit — 30 requests per hour per user per repository.
- **Global per-user:** 300 issue mutation requests per hour across all repositories.
- Rate limit responses return `429 Too Many Requests` with `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- Rate limit state keyed on `user_id`.

### Data Privacy & PII

- Milestone titles, descriptions, and due dates are visible to anyone who can read the repository. They should not contain PII unless the user explicitly puts it there.
- The `milestone_id` in issue responses reveals the existence of milestones. For private repos, this is acceptable since only authorized viewers see the issue at all.
- Milestone validation errors use a generic "invalid" code, not "milestone not found", to prevent information leakage about which milestone IDs exist in a repository to users without write access who might attempt to guess IDs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.milestone.set` | Milestone successfully set on an issue (200 response on PATCH/POST where milestone changed from null/different to a milestone) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `actor_login`, `milestone_id`, `milestone_title`, `previous_milestone_id` (null if was unset), `client_surface` ("api" \| "web" \| "cli" \| "tui" \| "vscode" \| "nvim" \| "agent"), `timestamp` |
| `issue.milestone.cleared` | Milestone successfully cleared from an issue (200 response on PATCH where milestone changed from set to null) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `actor_login`, `previous_milestone_id`, `previous_milestone_title`, `client_surface`, `timestamp` |
| `issue.milestone.changed` | Milestone changed from one milestone to another (200 response on PATCH where milestone changed between two non-null milestones) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `actor_login`, `old_milestone_id`, `old_milestone_title`, `new_milestone_id`, `new_milestone_title`, `client_surface`, `timestamp` |
| `issue.milestone.set_on_create` | Milestone set during issue creation | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `actor_id`, `actor_login`, `milestone_id`, `milestone_title`, `client_surface`, `timestamp` |
| `issue.milestone.edit_failed` | Milestone edit request rejected (4xx) | `repo_owner`, `repo_name`, `error_code`, `error_field`, `attempted_milestone_id`, `client_surface`, `timestamp` |

### Funnel Metrics & Success Indicators

1. **Milestone Attachment Rate:** Percentage of open issues with a non-null `milestone_id`. Target: >30% in repositories that have at least one milestone.
2. **Milestone Set Frequency:** Average `issue.milestone.set` events per active repository per week. Indicates milestone adoption.
3. **Milestone Churn Rate:** Ratio of `issue.milestone.changed` to `issue.milestone.set`. High churn (>30%) may indicate milestones are being used poorly or milestone planning is unstable.
4. **Surface Distribution:** Breakdown of `client_surface` across milestone edit events. Target: at least 2 surfaces actively used (indicates cross-client adoption).
5. **Error Rate:** `issue.milestone.edit_failed / (issue.milestone.set + issue.milestone.cleared + issue.milestone.edit_failed)`. Target: <5%.
6. **Create-Time Milestone Rate:** Percentage of `issue.milestone.set_on_create` / total issues created. Indicates how often teams set milestones upfront vs. retroactively.

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Milestone set on issue | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `actor_id`, `milestone_id`, `previous_milestone_id`, `duration_ms` | After successful milestone set |
| Milestone cleared from issue | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `actor_id`, `previous_milestone_id`, `duration_ms` | After successful milestone clear |
| Milestone set on issue create | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `actor_id`, `milestone_id`, `duration_ms` | After successful issue creation with milestone |
| Milestone validation failure | `warn` | `repo_name`, `owner`, `field`, `code`, `actor_id`, `attempted_milestone_id` | When service throws `validationFailed` for milestone |
| Milestone edit auth failure | `warn` | `repo_name`, `owner`, `reason` ("unauthenticated" \| "forbidden"), `actor_id` | When 401 or 403 returned |
| Milestone resolution failure | `warn` | `repo_id`, `issue_number`, `milestone_id`, `actor_id` | When milestone ID doesn't resolve to a milestone in the repo |
| Milestone edit internal error | `error` | `repo_id`, `owner`, `repo_name`, `issue_number`, `actor_id`, `error_message`, `stack_trace` | When DB update fails |
| Milestone no-op (already set) | `debug` | `repo_id`, `issue_number`, `milestone_id` | When set-milestone is called with current milestone (idempotent) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_milestone_set_total` | Counter | `owner`, `repo` | Total times a milestone was set on an issue |
| `codeplane_issue_milestone_cleared_total` | Counter | `owner`, `repo` | Total times a milestone was cleared from an issue |
| `codeplane_issue_milestone_changed_total` | Counter | `owner`, `repo` | Total times a milestone was changed to a different milestone |
| `codeplane_issue_milestone_edit_duration_seconds` | Histogram | `status` (success/error), `operation` (set/clear) | Latency of milestone edit operation |
| `codeplane_issue_milestone_errors_total` | Counter | `error_type` (validation/auth/not_found/internal/rate_limit), `operation` (set/clear) | Milestone operation failures by type |
| `codeplane_issue_milestone_set_on_create_total` | Counter | `owner`, `repo` | Times a milestone was set during issue creation |

### Alerts & Runbooks

#### Alert: `IssueMilestoneErrorRateHigh`

**Condition:** `rate(codeplane_issue_milestone_errors_total{error_type="internal"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server logs for `milestone edit internal error` entries. Look for `error_message` and `stack_trace`.
2. Check database connectivity: run `SELECT 1` against the primary DB. If unreachable, escalate to database on-call.
3. Check if the `issues` table is experiencing lock contention or deadlocks. Query: `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%issues%'`.
4. Check for recent deployments that may have introduced a regression in the issue service's `resolveIssueMilestone` method.
5. Verify the `milestones` table and the foreign key from `issues.milestone_id` to `milestones.id` are intact.
6. Check if the milestone resolution query is timing out by reviewing `pg_stat_statements` for the `getMilestoneByID` query.

#### Alert: `IssueMilestoneLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_issue_milestone_edit_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning

**Runbook:**
1. Check database query latency for `milestones` and `issues` table operations via `pg_stat_statements`.
2. Check if the milestone lookup query (`getMilestoneByID`) is slow — it should be an indexed lookup on `(repository_id, id)`.
3. Check if the issue update query is slow — could be due to trigger overhead, lock contention, or index bloat.
4. Check if webhook/notification fanout triggered by the issue update is blocking the response (it should be async).
5. Profile a sample request to identify whether the bottleneck is in milestone resolution, issue update, or response serialization.

#### Alert: `IssueMilestoneValidationSpikeHigh`

**Condition:** `rate(codeplane_issue_milestone_errors_total{error_type="validation"}[15m]) > 1.0`

**Severity:** Info

**Runbook:**
1. Check logs for `milestone validation failure` entries to identify the pattern — are users sending invalid milestone IDs or deleted milestone IDs?
2. If a specific client surface is generating most errors, check whether a client-side bug is sending stale milestone IDs (e.g., a cached milestone list that includes recently deleted milestones).
3. If the spike correlates with a milestone deletion, this is expected — cached clients may briefly reference deleted milestones. No action needed if it subsides within minutes.
4. If an API consumer (agent or integration) is repeatedly sending bad IDs, contact the team to fix their integration.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Failure Mode | Recovery |
|------------|-------------|--------------|----------|
| Milestone ID does not exist in repository | 422 | Predictable validation | User selects a valid milestone |
| Milestone ID is negative | 422 | Predictable validation | User provides valid positive integer |
| Milestone ID is zero (clear) | 200 | Expected clear operation | None needed |
| Milestone field is a string/object/array | 400 | Malformed request | User fixes request format |
| Milestone ID exceeds MAX_SAFE_INTEGER | 422 | Predictable validation | User provides valid integer |
| Setting already-set milestone (same ID) | 200 | Idempotent no-op | None needed |
| Clearing when already clear | 200 | Idempotent no-op | None needed |
| Issue not found | 404 | Expected resolution failure | User corrects issue number |
| Repository not found | 404 | Expected resolution failure | User corrects owner/repo |
| Unauthenticated | 401 | Expected auth boundary | User authenticates |
| No write permission | 403 | Expected auth boundary | User requests access |
| Rate limited | 429 | Expected throttle | User waits for `Retry-After` |
| DB connection lost during milestone resolution | 500 | Infrastructure failure | Alert fires, on-call investigates |
| DB connection lost during issue update | 500 | Infrastructure failure | Alert fires, on-call investigates |
| Milestone deleted between resolution and issue update (race) | 500 or 422 | Rare race condition — FK violation | User retries with valid milestone |
| Concurrent milestone edits on same issue | 200 | Last write wins | None needed — final state is consistent |
| Malformed JSON body | 400 | Client error | User fixes request format |

## Verification

### API Integration Tests

```
PATCH /api/repos/:owner/:repo/issues/:number — milestone field
├── Happy Path
│   ├── sets milestone on an issue with no milestone — returns 200, milestone_id equals provided ID
│   ├── sets milestone on an issue that already has a different milestone — returns 200, milestone_id updated
│   ├── sets same milestone (idempotent) — returns 200, milestone_id unchanged
│   ├── clears milestone with null — returns 200, milestone_id is null
│   ├── clears milestone with 0 — returns 200, milestone_id is null
│   ├── clears milestone when already no milestone (idempotent) — returns 200, milestone_id is null
│   ├── sets open milestone — returns 200
│   ├── sets closed milestone — returns 200
│   ├── sets milestone on closed issue — returns 200
│   ├── sets milestone on locked issue — returns 200
│   ├── sets milestone alongside other field changes (title + milestone) — returns 200, both updated
│   ├── omitting milestone key does not change existing milestone — returns 200, milestone_id preserved
│   ├── omitting milestone key does not set milestone when none exists — returns 200, milestone_id null
│   ├── milestone_id in response is a number (not string) when set
│   ├── milestone_id in response is null (not 0) when cleared
│   ├── setting milestone with PAT authentication — returns 200
│   └── setting milestone with session authentication — returns 200
│
├── Validation Errors
│   ├── milestone ID does not exist in repository — returns 422, code="invalid"
│   ├── milestone ID belongs to a different repository — returns 422, code="invalid"
│   ├── milestone ID is negative (-1) — returns 422, code="invalid"
│   ├── milestone ID is negative (-999) — returns 422
│   ├── milestone ID is a string "abc" — returns 400
│   ├── milestone ID is a boolean true — returns 400
│   ├── milestone ID is an object {} — returns 400
│   ├── milestone ID is an array [] — returns 400
│   ├── milestone ID is a float 1.5 — returns 422
│   ├── milestone ID exceeds MAX_SAFE_INTEGER (9007199254740992) — returns 422
│   └── milestone set with invalid concurrent field (e.g., invalid state) — returns 422, milestone not set either (atomic)
│
├── Authentication & Authorization
│   ├── unauthenticated request — returns 401
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
│   └── extra unknown fields in body — returns 200 (ignored)
│
├── Rate Limiting
│   └── exceeding rate limit — returns 429 with Retry-After header
│
└── Concurrency
    ├── two concurrent milestone set requests with different milestones — last write wins, final state is one of the two
    └── concurrent milestone set and clear — final state is consistent (either set or cleared)

POST /api/repos/:owner/:repo/issues — milestone field on create
├── Happy Path
│   ├── creates issue with milestone — returns 201, milestone_id equals provided ID
│   ├── creates issue without milestone field — returns 201, milestone_id is null
│   ├── creates issue with milestone=null explicitly — returns 201, milestone_id is null
│   ├── creates issue with open milestone — returns 201
│   └── creates issue with closed milestone — returns 201
│
├── Validation Errors
│   ├── milestone ID does not exist — returns 422, issue not created
│   ├── milestone ID negative — returns 422, issue not created
│   └── milestone ID belongs to different repo — returns 422, issue not created
│
└── Atomicity
    └── invalid milestone with valid title/body — entire creation rejected, no issue created

GET /api/repos/:owner/:repo/issues/:number — milestone_id in response
├── issue with milestone returns milestone_id as number
├── issue without milestone returns milestone_id as null
├── milestone_id updates immediately after PATCH
└── milestone_id becomes null after milestone deletion (via milestones API)
```

### CLI E2E Tests

```
codeplane issue edit --milestone
├── issue edit <number> --milestone <id> — output contains "Updated" and shows milestone
├── issue edit <number> --milestone <id> with --json — output is valid JSON with milestone_id field
├── issue edit <number> --milestone 0 — clears milestone, output confirms
├── issue edit <number> --milestone <id> --repo owner/repo — sets milestone on specified repo
├── issue edit <number> --milestone <nonexistent_id> — exits non-zero with validation error
├── issue edit <number> --milestone -1 — exits non-zero with validation error
├── issue edit <number> --milestone <id> without auth — exits non-zero with auth error
├── issue edit <number> --milestone <id> without write access — exits non-zero with permission error
├── issue edit <number> --milestone <id> --title "New title" — sets both milestone and title
├── issue edit <number> --milestone <id> (already set to same) — succeeds (idempotent)
└── lifecycle: create issue → edit --milestone <id> → view (verify milestone_id) → edit --milestone 0 → view (verify null)

codeplane issue create --milestone
├── issue create "Title" --body "Body" --milestone <id> — creates issue with milestone
├── issue create "Title" --milestone <id> --json — output JSON includes milestone_id
├── issue create "Title" --milestone <nonexistent_id> — exits non-zero, issue not created
├── issue create "Title" --milestone -1 — exits non-zero, issue not created
└── issue create "Title" without --milestone — creates issue with milestone_id null
```

### Web UI Playwright Tests

```
Issue Milestone Sidebar (/:owner/:repo/issues/:number)
├── Rendering
│   ├── issue with no milestone shows "No milestone" text
│   ├── issue with milestone shows milestone title
│   ├── milestone title is a link to milestone detail page
│   ├── gear icon visible for write-access user
│   ├── gear icon hidden for read-only user
│   └── milestone state badge shown (open/closed)
│
├── Set Milestone
│   ├── clicking gear icon opens milestone dropdown
│   ├── dropdown lists open milestones first, then closed
│   ├── dropdown shows "Clear milestone" option at top
│   ├── dropdown supports typeahead search filtering by title
│   ├── typing filters milestone list to matching titles
│   ├── clicking a milestone sets it (milestone title appears in sidebar)
│   ├── selecting milestone shows optimistic update immediately
│   ├── setting milestone when API fails shows error toast and reverts
│   ├── current milestone shows radio/check indicator in dropdown
│   └── selecting already-selected milestone is a no-op (dropdown closes)
│
├── Clear Milestone
│   ├── clicking "Clear milestone" removes milestone from sidebar
│   ├── "No milestone" text appears after clearing
│   ├── clearing when API fails shows error toast and restores milestone
│   └── clearing when already no milestone is a no-op
│
├── Permissions
│   ├── read-only user cannot see gear icon / edit controls
│   ├── unauthenticated user on public repo sees milestone but no edit controls
│   └── 403 error shows "permission denied" toast
│
└── Edge Cases
    ├── refreshing page after setting milestone shows persisted milestone
    ├── rapidly setting then clearing doesn't create inconsistent state
    └── milestone title containing special characters renders correctly

Issue Create Form (/:owner/:repo/issues/new)
├── milestone selector present in create form sidebar/metadata
├── selector lists open milestones
├── selecting milestone includes it in create request
├── creating issue without selecting milestone results in no milestone
└── creating issue with invalid milestone shows error
```

### TUI Integration Tests

```
TUI Issue Milestone Editing
├── Milestone Overlay from Edit Form
│   ├── milestone field shows current milestone title or "None"
│   ├── pressing Enter on milestone field opens overlay
│   ├── overlay shows "None" option at top
│   ├── overlay lists open milestones first, then closed
│   ├── currently selected milestone has indicator
│   ├── j/k navigates options
│   ├── Enter/Space selects and closes overlay
│   ├── Esc closes overlay without change
│   └── selecting "None" clears the milestone
│
├── Milestone Overlay from Detail View
│   ├── pressing 'm' from issue detail opens milestone overlay
│   ├── selecting a milestone updates the issue
│   ├── selecting "None" clears the milestone
│   └── overlay closes after selection
│
├── Issue Create Form Integration
│   ├── milestone field present in create form
│   ├── tab order includes milestone after assignees/labels
│   └── creating issue with milestone sends correct API request
│
└── Issue Detail View
    ├── issue with milestone shows milestone title in metadata section
    └── issue without milestone omits or shows empty milestone field
```

### Webhook Integration Tests

```
Issue Milestone Webhooks
├── webhook with "issues" event fires with action="milestoned" when milestone is set
├── webhook payload includes full issue object with updated milestone_id
├── webhook payload includes milestone object details
├── webhook with "issues" event fires with action="demilestoned" when milestone is cleared
├── webhook fires when milestone is changed from one to another (fires demilestoned + milestoned, or a single "milestoned" event)
├── webhook delivery is recorded in webhook deliveries list
├── webhook does not fire when setting the same milestone (no-op)
└── webhook does not fire when clearing an already-clear milestone (no-op)
```

### Milestone Deletion Cascade Tests

```
Milestone Deletion — Issue Association Cleanup
├── deleting a milestone clears milestone_id on all associated issues
├── after milestone deletion, GET issue returns milestone_id: null
├── after milestone deletion, issue list returns milestone_id: null for affected issues
├── deleting a milestone with no associated issues succeeds without errors
└── deleting a milestone while a concurrent PATCH is setting it on an issue — either succeeds and is then cleared, or the PATCH fails with 422
```

### End-to-End Lifecycle Tests

```
Full Milestone-Issue Lifecycle (API)
├── create milestone → create issue with milestone → verify milestone_id → clear milestone → verify null → set different milestone → verify changed → delete milestone → verify null
├── create milestone → create 3 issues with milestone → delete milestone → verify all 3 issues have null milestone_id
└── create issue → create milestone → set milestone on issue → close milestone → verify issue still references closed milestone → reopen milestone → verify unchanged

Full Milestone-Issue Lifecycle (CLI)
├── create milestone (API) → issue create with --milestone → issue view (verify) → issue edit --milestone 0 → issue view (verify null)
└── create milestone (API) → issue create → issue edit --milestone <id> → issue edit --milestone <different_id> → issue view (verify latest)
```

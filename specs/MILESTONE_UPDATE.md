# MILESTONE_UPDATE

Specification for MILESTONE_UPDATE.

## High-Level User POV

Milestones define the rhythm of a project. They mark releases, sprints, and major deliverables, and they give teams a shared checkpoint to rally around. But milestones are not set in stone when they are first created — a release that was called "v1.0" may need to become "v1.0-beta" as scope shifts, a due date that was optimistically set for June may need to be pushed to August, or a sprint milestone that was described with placeholder text may need a richer explanation now that the team's goals have crystallized.

The Milestone Update feature lets a user with write access to a repository modify any combination of a milestone's title, description, state, and due date in a single operation. The update is partial: a user who only wants to push back the due date can send just the new date without touching the title, description, or state, and the other fields are preserved exactly as they were. This makes it safe for small adjustments (e.g., fixing a typo in the title) as well as major lifecycle transitions (e.g., closing a milestone when a release ships).

The most significant lifecycle event captured by milestone update is closing a milestone. When a user changes a milestone's state from "open" to "closed," the system automatically records the exact moment of closure, giving the team an audit trail of when a release or sprint was formally completed. Reopening a closed milestone clears that closure timestamp, letting teams revive milestones that were closed prematurely or need additional work. The open/closed state and the due date work together: teams can see at a glance whether a milestone was completed before or after its deadline.

Milestone updates are available from the API, the CLI (via `codeplane milestone update`), and the web UI's milestone management settings page. In every surface, the user sees the current values pre-filled and can change whichever fields they want. The system validates the new values against the same rules used during creation: titles must be 1–255 characters and unique within the repository, state must be "open" or "closed," and due dates must be valid ISO 8601 strings. If the new title conflicts with another milestone in the same repository, the user receives a clear conflict error.

## Acceptance Criteria

- A user with write access to a repository can update an existing milestone by providing any combination of `title`, `description`, `state`, and `due_date`.
- The update uses partial (PATCH) semantics: only fields present in the request body are changed; omitted fields retain their current values.
- The milestone `title`, if provided, is trimmed of leading and trailing whitespace before validation and storage.
- The milestone `title`, if provided, must not be empty after trimming and must not exceed 255 characters.
- The `description`, if provided, may be any string including an empty string. There is no length limit enforced on description.
- The `state`, if provided, must be either `"open"` or `"closed"` (case-insensitive). Any other value returns a 422 Validation Failed error with `{ resource: "Milestone", field: "state", code: "invalid" }`.
- When `state` is changed to `"closed"` (and the milestone was not already closed), the `closed_at` field is automatically set to the current timestamp.
- If the milestone is already `"closed"` and `state` is sent as `"closed"` again, the existing `closed_at` value is preserved (not overwritten).
- When `state` is changed to `"open"` (from `"closed"`), the `closed_at` field is automatically set to `null`, reflecting that the milestone is no longer completed.
- The `due_date`, if provided, must be a valid ISO 8601 date string parseable by `new Date()`. An invalid date string returns a 422 Validation Failed error with `{ resource: "Milestone", field: "due_date", code: "invalid" }`.
- The `due_date` may be set to an empty string to clear it to `null`.
- Milestone titles must be unique within a repository. Attempting to rename a milestone to a title that already exists on another milestone in the same repository returns a 409 Conflict error with the message "milestone already exists."
- Renaming a milestone to its own current title (no-op rename) succeeds without triggering a conflict.
- An empty request body (no fields provided) succeeds and returns the milestone unchanged, with an updated `updated_at` timestamp.
- Unauthenticated requests are rejected with a 401 Unauthorized error.
- Authenticated users without write access to the repository are rejected with a 403 Forbidden error.
- Requests targeting a non-existent repository return a 404 Not Found error.
- Requests targeting a non-existent milestone ID return a 404 Not Found error with the message "milestone not found."
- An invalid (non-numeric or non-positive) milestone ID returns a 400 Bad Request error.
- A malformed or unparseable JSON request body returns a 400 Bad Request error.
- A title that is empty after trimming returns a 422 Validation Failed error with `{ resource: "Milestone", field: "title", code: "missing_field" }`.
- A title exceeding 255 characters returns a 422 Validation Failed error with `{ resource: "Milestone", field: "title", code: "invalid" }`.
- On successful update, the response includes the milestone's `id`, `repository_id`, `title`, `description`, `state`, `due_date` (ISO 8601 string or `null`), `closed_at` (ISO 8601 string or `null`), `created_at` (unchanged from creation), and `updated_at` (set to the current time).
- The response status code for a successful update is 200 OK.
- The updated milestone is immediately reflected in milestone listings, issue milestone displays, and any other surface that references the milestone.
- Issues associated with the updated milestone continue to reflect the milestone's new title and state without any manual re-attachment.
- The CLI `milestone update` command accepts a positional `id` argument, and optional `--title`, `--description`, `--state`, `--due-date`, and `--repo` options.
- **Definition of Done**: the feature is complete when the API endpoint, SDK service method, CLI command, and all acceptance criteria are covered by passing integration/E2E tests.

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/milestones/:id`

**Path Parameters:**
- `owner` — Repository owner username or organization name (case-insensitive)
- `repo` — Repository name (case-insensitive)
- `id` — Milestone ID (positive integer)

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body:**
```json
{
  "title": "v1.0-beta",
  "description": "Pre-release milestone",
  "state": "closed",
  "due_date": "2026-08-01T00:00:00.000Z"
}
```

All fields are optional. Any subset may be sent.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | No | 1–255 characters after trimming; unique per repository |
| `description` | string | No | No length limit enforced |
| `state` | string | No | Must be `"open"` or `"closed"` (case-insensitive) |
| `due_date` | string | No | Valid ISO 8601 date string; empty string clears to `null` |

**Success Response (200 OK):**
```json
{
  "id": 1,
  "repository_id": 7,
  "title": "v1.0-beta",
  "description": "Pre-release milestone",
  "state": "closed",
  "due_date": "2026-08-01T00:00:00.000Z",
  "closed_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-20T12:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 400 | Invalid milestone ID (non-numeric, zero, negative) | `{ "message": "invalid milestone id" }` |
| 400 | Missing milestone ID | `{ "message": "milestone id is required" }` |
| 401 | No authentication | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "permission denied" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Milestone not found | `{ "message": "milestone not found" }` |
| 409 | Duplicate milestone title in repo | `{ "message": "milestone already exists" }` |
| 422 | Validation error | `{ "message": "validation failed", "errors": [{ "resource": "Milestone", "field": "<field>", "code": "missing_field" or "invalid" }] }` |
| 500 | Unexpected server error | `{ "message": "failed to update milestone" }` |

### SDK Shape

The `MilestoneService` class from `@codeplane/sdk` exposes:

```typescript
updateMilestone(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  id: number,
  req: UpdateMilestoneInput,
): Promise<MilestoneResponse>
```

Where `UpdateMilestoneInput` is:
```typescript
interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  state?: string;
  due_date?: string;
}
```

And `MilestoneResponse` is:
```typescript
{
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;           // "open" or "closed"
  due_date: string | null; // ISO 8601 or null
  closed_at: string | null; // ISO 8601 or null
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

The method:
1. Requires authentication (throws 401 if actor is null).
2. Resolves the repository by lowercase owner and repo name.
3. Requires write access to the repository (throws 403 otherwise).
4. Fetches the existing milestone by ID (throws 404 if not found).
5. For each optional field present in the request, validates and normalizes it; omitted fields retain the existing milestone's values.
6. Automatically manages `closed_at`: sets it to `new Date()` when transitioning to `"closed"` (or preserves it if already closed), clears it to `null` when transitioning to `"open"`.
7. Performs the database update.
8. Handles unique constraint violations by throwing 409.
9. Returns the updated `MilestoneResponse`.

### CLI Command

**Command:** `codeplane milestone update <id> [options]`

**Arguments:**
- `<id>` — The milestone ID to update (positional, required, coerced to number)

**Options:**
- `--title <text>` — New milestone title
- `--description <text>` — New milestone description
- `--state <open|closed>` — New state (`open` or `closed`)
- `--due-date <iso-date>` — New due date as an ISO 8601 string; use `""` to clear
- `--repo <OWNER/REPO>` — Target repository; if omitted, resolved from the current working directory's jj/git context
- `--json` — Output full JSON response

**Output:** JSON object of the updated milestone on success. Error message on failure.

**Examples:**
```bash
# Rename a milestone
codeplane milestone update 1 --title "v1.0-beta" --repo myorg/myproject

# Close a milestone
codeplane milestone update 1 --state closed --repo myorg/myproject

# Reopen a closed milestone
codeplane milestone update 1 --state open --repo myorg/myproject

# Push back a due date
codeplane milestone update 1 --due-date "2026-08-01T00:00:00Z" --repo myorg/myproject

# Clear a due date
codeplane milestone update 1 --due-date "" --repo myorg/myproject

# Update all fields at once
codeplane milestone update 1 --title "GA Release" --description "General availability" --state open --due-date "2026-09-01T00:00:00Z" --repo myorg/myproject
```

### Web UI Design

Milestone editing in the web UI is accessible from the repository's milestone management settings page at `/:owner/:repo/settings/milestones`. Each milestone row in the list should include an "Edit" button (pencil icon or text link) that opens an inline edit form or navigates to an edit view.

The edit form presents:
1. **Title input** — Pre-filled with the current milestone title, placeholder "Milestone title", max 255 characters. Required.
2. **Description input** — Multiline textarea, pre-filled with the current description, placeholder "Description (optional)".
3. **State toggle** — A toggle or radio group with "Open" and "Closed" options, pre-filled with the current state. Changing state to "Closed" should display a confirmation hint (e.g., "Closing this milestone will record the closure time").
4. **Due date input** — A date picker pre-filled with the current due date (if set). Users can select a new date, clear the date, or leave it as-is.
5. **Save button** — "Save changes" button, disabled when no fields have been modified from their original values.
6. **Cancel button** — Returns to the milestone list without saving.

On successful update, the milestone row refreshes to show the new values immediately, including state badge changes (Open → Closed or vice versa). On validation errors, inline error messages appear next to the offending field. On conflict (duplicate title), an inline error reads "A milestone with this title already exists."

The edit form should use an optimistic pattern: the button text changes to "Saving..." on submission and reverts on error.

### TUI UI

The TUI does not currently expose a dedicated milestone editing screen. Milestone management (including updates) is available through the CLI `milestone update` command. If a milestone edit flow is added to the TUI in the future, it should present a pre-filled form with title, description, state (selectable between "open" and "closed"), and due date fields (text input for ISO dates), with inline validation matching the API constraints.

### Documentation

End-user documentation should cover:

- **How-to: Update a milestone via CLI** — Show `codeplane milestone update` usage with examples for renaming, closing/reopening, changing due dates, clearing due dates, and combined updates.
- **How-to: Update a milestone via API** — Show the `PATCH /api/repos/:owner/:repo/milestones/:id` endpoint with curl examples demonstrating partial update, state change, and due date management.
- **Reference: Milestone API** — Full endpoint reference for PATCH including request/response shapes, all error codes, partial update semantics, and automatic `closed_at` management behavior.
- **Reference: CLI milestone commands** — Argument/option table for `milestone update` alongside `milestone create`, `milestone list`, `milestone delete`.
- **Concept page: Milestones** — Ensure the existing concept page explains the open/closed lifecycle, the automatic `closed_at` timestamp behavior, and that updates propagate to all associated issues automatically.

## Permissions & Security

### Authorization Matrix

| Role | Can Update Milestones? |
|---|---|
| Repository Owner | ✅ Yes |
| Organization Owner (for org repo) | ✅ Yes |
| Admin Collaborator | ✅ Yes |
| Write Collaborator | ✅ Yes |
| Read Collaborator | ❌ No (403) |
| Unauthenticated | ❌ No (401) |
| Authenticated, no repo access | ❌ No (403) |

### Permission Resolution Order

1. If the user is the repository owner (direct user match), write access is granted.
2. If the repository is org-owned and the user is the org owner, write access is granted.
3. The highest permission is resolved from team permissions and collaborator permissions.
4. If the resolved permission is `write` or `admin`, access is granted.
5. If the resolved permission is `read` or lower, 403 Forbidden is returned.
6. If the user is not authenticated, 401 Unauthorized is returned before any permission check.

### Rate Limiting

- Milestone updates are subject to the server's global rate limiting middleware applied to all mutation endpoints.
- A per-user burst limit of **30 milestone update requests per minute per repository** is recommended to prevent automated abuse (e.g., a script churning milestone state changes in a tight loop).
- The same rate limit bucket should be shared with milestone creation to prevent combined create+update flooding.

### Data Privacy

- Milestone titles, descriptions, due dates, and state are repository-scoped metadata. They are visible to anyone who can read the repository (including unauthenticated users for public repositories).
- No PII is expected in milestone fields, but since users may type arbitrary text into the title and description fields, milestones inherit the repository's visibility scope. Private repository milestones are not exposed to unauthorized viewers.
- The update operation does not log the previous milestone values in the API response, so old titles/descriptions are not leaked through the update response itself.
- Milestone updates do not involve secrets, tokens, or credentials.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `MilestoneUpdated` | Successful milestone update | `repository_id`, `milestone_id`, `milestone_title` (new), `actor_id`, `fields_changed` (array of field names that were modified, e.g. `["title", "state"]`), `was_rename` (boolean — true if `title` was changed), `was_state_change` (boolean — true if `state` was changed), `old_state` (string, if state was changed), `new_state` (string, if state was changed), `client` ("api" / "cli" / "web" / "tui"), `timestamp` |
| `MilestoneClosed` | Milestone state changed from `open` to `closed` | `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `had_due_date` (boolean), `was_overdue` (boolean — true if `due_date` was in the past at closure time), `client`, `timestamp` |
| `MilestoneReopened` | Milestone state changed from `closed` to `open` | `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `client`, `timestamp` |

### Event Properties Detail

- `repository_id` (number): Internal ID of the repository.
- `milestone_id` (number): The milestone's ID.
- `milestone_title` (string): The milestone's title after the update.
- `actor_id` (number): The authenticated user who performed the update.
- `fields_changed` (string[]): Which fields were actually modified (present in the request body). Possible values: `"title"`, `"description"`, `"state"`, `"due_date"`.
- `was_rename` (boolean): True if the `title` field was present in the request and differs from the previous title.
- `was_state_change` (boolean): True if the `state` field was present in the request and differs from the previous state.
- `old_state` / `new_state` (string): Previous and new state, only included when state was changed.
- `had_due_date` (boolean): Whether the milestone had a due date at the time of closure.
- `was_overdue` (boolean): Whether the milestone's due date was in the past when it was closed.
- `client` (string): The client surface that initiated the request (derived from User-Agent or explicit client header).
- `timestamp` (string): ISO 8601 timestamp of the event.

### Funnel Metrics

- **Milestone update rate**: Number of milestone updates per active repository per month. Indicates how frequently teams adjust their planning milestones.
- **Close rate**: Number of milestones closed per active repository per month. Indicates release or sprint completion cadence.
- **Reopen rate**: Percentage of closed milestones that are subsequently reopened. A high reopen rate may indicate milestones are being closed prematurely.
- **Time to close**: Duration from milestone creation to closure. Indicates planning cadence and project velocity.
- **Overdue closure rate**: Percentage of milestone closures where the milestone was past its due date. Indicates planning accuracy.
- **Rename frequency**: Percentage of milestone updates that include a title change. High rename frequency may indicate milestones are being created hastily.
- **Due date change frequency**: Percentage of milestone updates that modify the due date. High frequency may indicate scope or timeline instability.
- **Update error rate**: Ratio of failed update attempts to successful ones, broken down by error type (validation, conflict, permission, not found). A high conflict rate may indicate teams need better title visibility during editing.

### Success Indicators

- A steady close rate that matches the team's release or sprint cadence indicates healthy milestone usage.
- A low reopen rate indicates milestones are being closed at the right time.
- A moderate due-date change rate is normal; an extremely high rate may indicate planning instability.
- A low error rate on updates indicates the UI and CLI pre-fill values correctly and guide users toward valid changes.
- Decreasing time-to-close over time may indicate teams are becoming more efficient at completing planned work.

## Observability

### Logging Requirements

| Event | Log Level | Structured Fields |
|---|---|---|
| Milestone updated successfully | `info` | `event: "milestone.updated"`, `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `fields_changed`, `duration_ms` |
| Milestone closed (state change) | `info` | `event: "milestone.closed"`, `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `duration_ms` |
| Milestone reopened (state change) | `info` | `event: "milestone.reopened"`, `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `duration_ms` |
| Milestone update failed — validation | `warn` | `event: "milestone.update_failed"`, `reason: "validation"`, `field`, `code`, `repository_id`, `milestone_id`, `actor_id` |
| Milestone update failed — conflict (duplicate title) | `warn` | `event: "milestone.update_failed"`, `reason: "conflict"`, `milestone_title`, `repository_id`, `milestone_id`, `actor_id` |
| Milestone update failed — milestone not found | `info` | `event: "milestone.update_failed"`, `reason: "not_found"`, `milestone_id`, `repository_id`, `actor_id` |
| Milestone update failed — permission denied | `warn` | `event: "milestone.update_failed"`, `reason: "forbidden"`, `repository_id`, `actor_id` |
| Milestone update failed — unauthenticated | `info` | `event: "milestone.update_failed"`, `reason: "unauthenticated"` |
| Milestone update failed — repository not found | `info` | `event: "milestone.update_failed"`, `reason: "repo_not_found"`, `owner`, `repo` |
| Milestone update failed — internal error | `error` | `event: "milestone.update_failed"`, `reason: "internal"`, `repository_id`, `milestone_id`, `actor_id`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_milestone_updates_total` | Counter | `status` (success / error), `error_type` (validation / conflict / not_found / forbidden / unauthenticated / internal) | Total milestone update attempts |
| `codeplane_milestone_update_duration_seconds` | Histogram | — | Time taken to process a milestone update request end-to-end (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_milestone_update_fields_changed` | Counter | `field` (title / description / state / due_date) | Count of individual field changes across all updates, to understand which fields are modified most |
| `codeplane_milestone_state_transitions_total` | Counter | `transition` (open_to_closed / closed_to_open) | Count of milestone state transitions to track close/reopen patterns |

### Alerts

#### Alert: High Milestone Update Internal Error Rate
- **Condition:** `rate(codeplane_milestone_updates_total{status="error", error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "milestone.update_failed"` with `reason: "internal"` to identify the root cause.
  2. Look for database connection issues — the update requires a SELECT followed by an UPDATE. Check for DB pool exhaustion or connectivity problems.
  3. Verify the `milestones` table is accessible and the `updateMilestone` SQL query is executing correctly. Run `EXPLAIN ANALYZE` on the update query if needed.
  4. Check if the unique constraint on `(repository_id, title)` still exists — a dropped constraint could cause silent data corruption instead of a proper 409.
  5. Check for recent migrations that may have altered the `milestones` table schema.
  6. If the error is a transient DB issue, monitor for auto-recovery. If persistent, check PGLite/Postgres health and restart the server if needed.

#### Alert: Milestone Update Latency Spike
- **Condition:** `histogram_quantile(0.99, rate(codeplane_milestone_update_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency — the update path involves a SELECT (to fetch the existing milestone) followed by an UPDATE. Either query could be slow.
  2. Look for table bloat, missing indexes, or lock contention on the `milestones` table.
  3. Check if the unique constraint index on `(repository_id, title)` is healthy — a degraded index can slow unique constraint checks.
  4. Review server resource utilization (CPU, memory, DB connections).
  5. If isolated to one repository, check if that repository has an unusually large number of milestones causing index pressure.
  6. Check for long-running transactions that may be holding locks on the milestones table.

#### Alert: High Milestone Update Conflict Rate
- **Condition:** `rate(codeplane_milestone_updates_total{status="error", error_type="conflict"}[15m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. This indicates frequent attempts to rename milestones to titles that already exist. This is a user error, not a system error.
  2. Check structured logs to see if the conflicts are concentrated on one repository or user.
  3. If concentrated on one actor, it may indicate a misconfigured automation or script that is trying to bulk-rename milestones.
  4. If distributed, consider whether the web UI or CLI could surface existing milestone titles more prominently during editing to reduce accidental conflicts.
  5. No immediate action required unless the volume indicates abuse.

#### Alert: Unusual Milestone State Transition Volume
- **Condition:** `rate(codeplane_milestone_state_transitions_total[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. This may indicate automated milestone lifecycle management (legitimate) or a scripting issue.
  2. Check structured logs to determine if the transitions are concentrated on one repository or user.
  3. If a single actor is rapidly toggling milestones between open and closed, it may indicate a misconfigured integration.
  4. If it's a distributed pattern, it may indicate a product event such as an end-of-sprint bulk close — no action needed.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Milestone ID not a positive integer | 400 | Invalid milestone id | User provides a valid numeric milestone ID |
| Milestone not found | 404 | Milestone not found | User verifies the milestone ID exists in the repository |
| Title empty after trimming | 422 | Validation failed — title missing_field | User provides a non-empty title |
| Title exceeds 255 chars | 422 | Validation failed — title invalid | User shortens the title |
| State not "open" or "closed" | 422 | Validation failed — state invalid | User provides "open" or "closed" |
| Invalid due date format | 422 | Validation failed — due_date invalid | User provides a valid ISO 8601 date |
| Duplicate title in repo | 409 | Milestone already exists | User chooses a different title |
| Not authenticated | 401 | Authentication required | User logs in or provides a valid PAT |
| No write access | 403 | Permission denied | User requests write access from a repo admin |
| Repository not found | 404 | Repository not found | User verifies the owner/repo path |
| Malformed JSON body | 400 | Invalid request body | User fixes the request payload |
| Database unreachable | 500 | Failed to update milestone | Ops team investigates DB connectivity |
| Unexpected DB error | 500 | Failed to update milestone | Ops team investigates via structured logs |

## Verification

### API Integration Tests

#### Happy Path — Partial Update Semantics

1. **Update title only** — Create a milestone "v1.0" with description "First release" and due date. PATCH with `{ "title": "v1.0-beta" }`. Assert 200, response `title` is `"v1.0-beta"`, `description` is `"First release"` (unchanged), `state` is `"open"` (unchanged), `due_date` is unchanged.

2. **Update description only** — Create a milestone. PATCH with `{ "description": "Updated scope" }`. Assert 200, response `title`, `state`, and `due_date` are unchanged, `description` is `"Updated scope"`.

3. **Update state only (close)** — Create an open milestone. PATCH with `{ "state": "closed" }`. Assert 200, `state` is `"closed"`, `closed_at` is a valid ISO 8601 timestamp, other fields unchanged.

4. **Update state only (reopen)** — Create a milestone, close it. PATCH with `{ "state": "open" }`. Assert 200, `state` is `"open"`, `closed_at` is `null`.

5. **Update due_date only** — Create a milestone. PATCH with `{ "due_date": "2026-12-31T00:00:00.000Z" }`. Assert 200, `due_date` is the new value, other fields unchanged.

6. **Update all fields at once** — Create a milestone. PATCH with `{ "title": "GA", "description": "general availability", "state": "closed", "due_date": "2026-09-01T00:00:00.000Z" }`. Assert 200, all four fields are updated, `closed_at` is set.

7. **Empty body (no fields)** — Create a milestone. PATCH with `{}`. Assert 200, all fields unchanged, `updated_at` is updated.

8. **Update preserves `created_at`** — Create a milestone, note `created_at`. Wait briefly. PATCH with `{ "title": "renamed" }`. Assert `created_at` is unchanged from original creation.

9. **Update changes `updated_at`** — Create a milestone, note `updated_at`. Wait briefly. PATCH with `{ "description": "new desc" }`. Assert `updated_at` is different (later) than the original value.

10. **Response shape is complete** — PATCH a milestone. Assert response contains `id` (number), `repository_id` (number), `title` (string), `description` (string), `state` (string, either `"open"` or `"closed"`), `due_date` (string or `null`), `closed_at` (string or `null`), `created_at` (valid ISO 8601), and `updated_at` (valid ISO 8601).

#### State Transition — closed_at Management

11. **Close sets closed_at** — Create an open milestone. PATCH `{ "state": "closed" }`. Assert `closed_at` is a non-null ISO 8601 timestamp and is approximately the current time.

12. **Reopen clears closed_at** — Create and close a milestone. Verify `closed_at` is set. PATCH `{ "state": "open" }`. Assert `closed_at` is `null`.

13. **Close already-closed preserves closed_at** — Create a milestone, close it, note the `closed_at` value. Wait briefly. PATCH `{ "state": "closed" }` again. Assert `closed_at` is the same as the original closure timestamp (not overwritten).

14. **Reopen already-open is a no-op** — Create an open milestone. PATCH `{ "state": "open" }`. Assert 200, `state` is `"open"`, `closed_at` is `null`.

15. **State case-insensitive: "Closed"** — PATCH with `{ "state": "Closed" }`. Assert 200 and `state` is `"closed"`.

16. **State case-insensitive: "OPEN"** — PATCH with `{ "state": "OPEN" }`. Assert 200 and `state` is `"open"`.

17. **State invalid value** — PATCH with `{ "state": "archived" }`. Assert 422 with `{ resource: "Milestone", field: "state", code: "invalid" }`.

18. **State empty string** — PATCH with `{ "state": "" }`. Assert 422 with `{ resource: "Milestone", field: "state", code: "invalid" }`.

#### Title Validation

19. **Title: maximum valid length (255 characters)** — Create a milestone. PATCH with a title that is exactly 255 characters long. Assert 200 and response `title` has length 255.

20. **Title: exceeds maximum length (256 characters)** — Create a milestone. PATCH with a title that is 256 characters long. Assert 422 with `{ resource: "Milestone", field: "title", code: "invalid" }`.

21. **Title: whitespace trimming** — Create a milestone. PATCH with `{ "title": "  trimmed  " }`. Assert 200 and response `title` is `"trimmed"`.

22. **Title: all whitespace** — Create a milestone. PATCH with `{ "title": "   " }`. Assert 422 with `{ resource: "Milestone", field: "title", code: "missing_field" }`.

23. **Title: empty string** — Create a milestone. PATCH with `{ "title": "" }`. Assert 422 with `{ resource: "Milestone", field: "title", code: "missing_field" }`.

24. **Title: special characters** — Create a milestone. PATCH with `{ "title": "release / v2.0-rc1 (final)" }`. Assert 200.

25. **Title: Unicode and emoji** — Create a milestone. PATCH with `{ "title": "🚀 リリース v2.0" }`. Assert 200 and response `title` is `"🚀 リリース v2.0"`.

26. **Title: rename to same title (no-op)** — Create a milestone named "v1.0". PATCH with `{ "title": "v1.0" }`. Assert 200 (no conflict since it's the same milestone).

#### Due Date Validation

27. **Due date: valid ISO 8601 full datetime** — PATCH with `{ "due_date": "2026-08-01T00:00:00.000Z" }`. Assert 200 and `due_date` is a valid ISO 8601 string.

28. **Due date: valid ISO 8601 date-only** — PATCH with `{ "due_date": "2026-08-01" }`. Assert 200 and `due_date` is a valid ISO 8601 string.

29. **Due date: invalid string** — PATCH with `{ "due_date": "not-a-date" }`. Assert 422 with `{ resource: "Milestone", field: "due_date", code: "invalid" }`.

30. **Due date: impossible date values** — PATCH with `{ "due_date": "2026-13-45T00:00:00Z" }`. Assert 422 with `{ resource: "Milestone", field: "due_date", code: "invalid" }`.

31. **Due date: past date** — PATCH with `{ "due_date": "2020-01-01T00:00:00.000Z" }`. Assert 200 (past due dates are allowed).

32. **Due date: clear by setting empty string** — Create a milestone with a due date. PATCH with `{ "due_date": "" }`. Assert 200 and `due_date` is `null`.

33. **Due date: set on milestone that had none** — Create a milestone without a due date. PATCH with `{ "due_date": "2026-12-31T00:00:00Z" }`. Assert 200 and `due_date` is non-null.

#### Description Edge Cases

34. **Description: set to empty string** — Create a milestone with description "something". PATCH with `{ "description": "" }`. Assert 200 and response `description` is `""`.

35. **Description: set to long string** — PATCH with a description of 10,000 characters. Assert 200.

36. **Description: unicode and emoji** — PATCH with `{ "description": "🔥 重要なリリース" }`. Assert 200.

37. **Description: newlines preserved** — PATCH with `{ "description": "Line 1\nLine 2\nLine 3" }`. Assert 200 and the description preserves newlines.

#### Duplicate Title Handling

38. **Duplicate title: exact match with another milestone** — Create milestones "v1.0" and "v2.0". PATCH milestone "v2.0" with `{ "title": "v1.0" }`. Assert 409 with message "milestone already exists".

39. **Duplicate title: case sensitivity** — Create milestone "V1.0" and "other". PATCH "other" with `{ "title": "v1.0" }`. Assert behavior is consistent with the database collation. Document actual behavior.

40. **Rename: no conflict when title is unique** — Create milestones "v1.0" and "v2.0". PATCH "v1.0" with `{ "title": "v1.1" }`. Assert 200.

41. **Cross-repository: same title allowed** — Create milestone "v1.0" in repo A. Create milestone "v2.0" in repo B. PATCH repo B's milestone to `{ "title": "v1.0" }`. Assert 200 (uniqueness is per-repository).

#### Milestone ID Validation

42. **Invalid milestone ID: zero** — PATCH `/api/repos/:owner/:repo/milestones/0` with `{ "title": "test" }`. Assert 400.

43. **Invalid milestone ID: negative** — PATCH `/api/repos/:owner/:repo/milestones/-1` with `{ "title": "test" }`. Assert 400.

44. **Invalid milestone ID: non-numeric** — PATCH `/api/repos/:owner/:repo/milestones/abc` with `{ "title": "test" }`. Assert 400.

45. **Non-existent milestone ID** — PATCH with a valid but non-existent milestone ID. Assert 404 with message "milestone not found".

#### Permission Tests

46. **Unauthenticated request** — PATCH without auth. Assert 401 with message "authentication required".

47. **Read-only collaborator** — PATCH as a user with only read access. Assert 403 with message "permission denied".

48. **Write collaborator** — PATCH as a user with write access. Assert 200.

49. **Admin collaborator** — PATCH as a user with admin access. Assert 200.

50. **Repository owner** — PATCH as the repository owner. Assert 200.

51. **Organization owner** — PATCH as the org owner for an org-owned repo. Assert 200.

52. **Authenticated user with no repo access** — PATCH as an authenticated user who is not a collaborator on a private repo. Assert 403.

#### Repository Edge Cases

53. **Non-existent repository** — PATCH to `/api/repos/nobody/nonexistent/milestones/1`. Assert 404 with message "repository not found".

54. **Malformed JSON body** — PATCH with body `"not json"`. Assert 400 with message "invalid request body".

55. **Missing body entirely** — PATCH with no body / empty content. Assert 400.

#### Propagation and Consistency

56. **Updated milestone reflected in milestone list** — Create a milestone, update its title. GET `/api/repos/:owner/:repo/milestones`. Assert the list contains the new title and not the old title.

57. **Updated milestone reflected in get-by-ID** — Create a milestone, update it. GET `/api/repos/:owner/:repo/milestones/:id`. Assert all updated fields match.

58. **Closed milestone appears in closed list** — Create a milestone, close it via PATCH. GET `/api/repos/:owner/:repo/milestones?state=closed`. Assert the milestone appears. GET with `?state=open`. Assert it does not appear.

59. **Reopened milestone appears in open list** — Close and reopen a milestone. GET `/api/repos/:owner/:repo/milestones?state=open`. Assert the milestone appears.

60. **Multiple sequential updates** — Create a milestone. Update title, then update state, then update description, then update due_date in four separate PATCH requests. Assert final state reflects all four changes.

61. **Updated milestone reflected on associated issues** — Create a milestone, associate it with an issue. Update the milestone title. GET the issue. Assert the issue's `milestone_id` still references the milestone (the association is maintained through the update).

### CLI E2E Tests

62. **CLI: Update milestone title** — Create a milestone via CLI. Run `codeplane milestone update <id> --title "new-title" --repo OWNER/REPO --json`. Assert JSON output contains the updated title with other fields preserved.

63. **CLI: Close a milestone** — Run `codeplane milestone update <id> --state closed --repo OWNER/REPO --json`. Assert JSON output contains `state: "closed"` and `closed_at` is non-null.

64. **CLI: Reopen a milestone** — Close a milestone, then run `codeplane milestone update <id> --state open --repo OWNER/REPO --json`. Assert `state: "open"` and `closed_at` is `null`.

65. **CLI: Update due date** — Run `codeplane milestone update <id> --due-date "2026-12-31T00:00:00Z" --repo OWNER/REPO --json`. Assert JSON output contains the new `due_date`.

66. **CLI: Clear due date** — Run `codeplane milestone update <id> --due-date "" --repo OWNER/REPO --json`. Assert `due_date` is `null`.

67. **CLI: Update description** — Run `codeplane milestone update <id> --description "new description" --repo OWNER/REPO --json`. Assert JSON output contains the updated description.

68. **CLI: Update all fields** — Run `codeplane milestone update <id> --title "renamed" --description "new" --state closed --due-date "2026-09-01T00:00:00Z" --repo OWNER/REPO --json`. Assert all fields updated.

69. **CLI: Update non-existent milestone** — Run `codeplane milestone update 999999 --title "test" --repo OWNER/REPO`. Assert non-zero exit code and error output indicating milestone not found.

70. **CLI: Update with duplicate title** — Create two milestones. Run `codeplane milestone update <id2> --title <title1> --repo OWNER/REPO`. Assert non-zero exit code and error output indicating milestone already exists.

71. **CLI: Updated milestone appears in list** — Update a milestone title via CLI. Run `codeplane milestone list --repo OWNER/REPO --json`. Assert the updated title appears and the old title does not.

72. **CLI: Repo resolution from working directory** — In a directory with jj/git context pointing to a known repo, run `codeplane milestone update <id> --title "contextual" --json` without `--repo`. Assert success.

### Playwright (Web UI) E2E Tests

73. **Web: Edit button visible on milestone row** — Navigate to `/:owner/:repo/settings/milestones`. Assert each milestone row has an edit action (button or link).

74. **Web: Edit form pre-fills current values** — Click edit on a milestone. Assert the form title, description, state, and due date fields are pre-filled with the milestone's current values.

75. **Web: Update milestone title via form** — Open edit form, change title, click save. Assert the milestone list row updates to show the new title.

76. **Web: Update milestone description via form** — Open edit form, change description, click save. Assert the milestone updates to show the new description.

77. **Web: Close milestone via form** — Open edit form, change state to "Closed", click save. Assert the milestone row updates to show a "Closed" badge and `closed_at` is displayed.

78. **Web: Reopen milestone via form** — Open a closed milestone's edit form, change state to "Open", click save. Assert the milestone row updates to show an "Open" badge.

79. **Web: Update due date via form** — Open edit form, change the due date, click save. Assert the milestone row updates to show the new due date.

80. **Web: Cancel edit reverts form** — Open edit form, modify fields, click cancel. Assert no changes are saved and the milestone retains its original values.

81. **Web: Inline validation — empty title** — Open edit form, clear the title field, click save. Assert an inline validation error appears on the title field.

82. **Web: Inline validation — invalid state** — Verify the state toggle only offers "Open" and "Closed" options (invalid state values should not be possible via UI).

83. **Web: Duplicate title error** — Open edit form, enter a title that matches another existing milestone, click save. Assert a user-visible error message about the milestone already existing.

84. **Web: Save button disabled when no changes** — Open edit form without modifying any fields. Assert the save button is disabled.

85. **Web: Updated milestone reflected in issue milestone picker** — Update a milestone title via the settings page. Navigate to an issue with that milestone associated. Assert the issue displays the new milestone title.

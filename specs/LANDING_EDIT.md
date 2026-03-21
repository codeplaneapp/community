# LANDING_EDIT

Specification for LANDING_EDIT.

## High-Level User POV

When a developer creates a landing request in Codeplane — the jj-native equivalent of a pull request — the initial title, description, target bookmark, or state may need to change as the work evolves. The Landing Edit feature allows any authorized collaborator to update an existing landing request's metadata after it has been created, without needing to close and recreate it.

From the developer's perspective, editing a landing request is a lightweight, fast operation. In the web UI, a developer opens a landing request detail page and clicks an "Edit" button or inline-editable field to modify the title, description, target bookmark, source bookmark, or state. In the CLI, the developer runs `codeplane land edit <number>` with flags for the fields they want to change. In the TUI, the developer presses `e` on a landing request to open a full-screen edit form. Across all surfaces, only the fields the developer explicitly changes are sent to the server — unchanged fields are left alone.

The edit feature enforces a state machine for landing request lifecycle transitions. An open landing request can be moved to draft or closed. A draft can be moved to open or closed. A closed landing request can be reopened. A merged landing request cannot be edited at all — it is a terminal state managed exclusively by the system when changes are successfully landed. This state machine ensures that landing request lifecycle is predictable and that no user can manually mark something as merged.

The feature also supports updating the target bookmark (where changes will land) and optionally the source bookmark. The target bookmark cannot be cleared — every landing request must target a specific bookmark. The source bookmark is optional and can be cleared.

Editing a landing request is scoped to the repository context. The updated landing request is immediately visible to all collaborators viewing the same repository, and any notifications or webhook integrations configured for the repository will reflect the updated state.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access to a repository can update a landing request's title, body, state, target bookmark, source bookmark, and conflict status via `PATCH /api/repos/:owner/:repo/landings/:number`
- [ ] The CLI `codeplane land edit <number>` command successfully updates landing request fields and returns the updated record
- [ ] The TUI landing edit form opens pre-populated with current values, submits only modified fields, and returns to the previous screen on success
- [ ] The web UI provides an edit affordance on the landing request detail page that allows inline or modal editing of landing request fields
- [ ] The API returns the full updated `LandingRequestResponse` on success
- [ ] The `updated_at` timestamp is set to the current time on every successful edit

### Field Validation

- [ ] **Title**: If provided, must be non-empty after trimming whitespace. Maximum 255 characters. Whitespace-only titles are rejected
- [ ] **Body**: If provided, any string is accepted including empty string. Maximum 65,535 characters
- [ ] **State**: If provided, must be one of `open`, `draft`, `closed`. The value `merged` is never accepted as an edit input. The transition must be valid from the current state per the state machine
- [ ] **Target bookmark**: If provided, must be non-empty after trimming. Cannot be cleared
- [ ] **Source bookmark**: If provided, may be any string including empty (to clear the source bookmark)
- [ ] **Conflict status**: If provided, must be one of `clean`, `conflicted`, `unknown`

### State Machine

- [ ] `open` → `draft`: allowed
- [ ] `open` → `closed`: allowed
- [ ] `draft` → `open`: allowed
- [ ] `draft` → `closed`: allowed
- [ ] `closed` → `open`: allowed (reopen)
- [ ] `closed` → `draft`: rejected
- [ ] `merged` → any: rejected (form/command should not allow editing merged landing requests)
- [ ] Same-state transitions (e.g., `open` → `open`): allowed (no-op for state, other fields may change)

### Edge Cases

- [ ] An empty JSON body `{}` (no fields provided) returns the current landing request without modification
- [ ] Submitting only unchanged values (e.g., same title as current) still triggers an update and refreshes `updated_at`
- [ ] A landing request number that does not exist returns 404
- [ ] A non-numeric landing request number returns 400
- [ ] A title consisting of only whitespace characters (spaces, tabs, newlines) is rejected with 422
- [ ] Unicode characters, emoji, and multi-byte strings in title and body are accepted and preserved
- [ ] Concurrent edits by two users: both succeed independently; last write wins for each field
- [ ] Editing a landing request in a repository the user has been removed from returns 403
- [ ] Providing unknown fields in the JSON body are silently ignored
- [ ] A `conflict_status` value of empty string is rejected (invalid)
- [ ] The `closed_at` timestamp is set when transitioning to `closed` state
- [ ] The `closed_at` timestamp is cleared when transitioning from `closed` to `open`
- [ ] The `merged_at` timestamp is never modified by the edit endpoint
- [ ] `stack_size` and `change_ids` are not modifiable through the edit endpoint

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/landings/:number`

**Request Headers:**
- `Content-Type: application/json` (required)
- `Authorization: Bearer <token>` or session cookie (required)

**Path Parameters:**
- `owner` — repository owner username or organization name
- `repo` — repository name
- `number` — landing request number (positive integer)

**Request Body (all fields optional):**
```json
{
  "title": "Updated landing request title",
  "body": "Updated description with **markdown** support",
  "state": "draft",
  "target_bookmark": "main",
  "source_bookmark": "feature/new-auth",
  "conflict_status": "clean"
}
```

**Success Response (200 OK):**
```json
{
  "number": 42,
  "title": "Updated landing request title",
  "body": "Updated description with **markdown** support",
  "state": "draft",
  "author": {
    "id": 1,
    "login": "williamcory"
  },
  "change_ids": ["abc123", "def456"],
  "target_bookmark": "main",
  "conflict_status": "clean",
  "stack_size": 2,
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` — Invalid landing number format
- `401 Unauthorized` — Missing or invalid authentication
- `403 Forbidden` — User lacks write access to the repository
- `404 Not Found` — Repository or landing request does not exist
- `422 Unprocessable Entity` — Validation failure (empty title, invalid state, invalid state transition, empty target bookmark, invalid conflict status)
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Unexpected server failure

### SDK Shape

**Service method:** `LandingService.updateLandingRequest(actor, owner, repo, number, input)`

**Input type:**
```typescript
interface UpdateLandingRequestInput {
  title?: string;
  body?: string;
  state?: string;
  target_bookmark?: string;
  source_bookmark?: string;
  conflict_status?: string;
}
```

**Return type:** `Result<LandingRequestResponse, APIError>`

The service method:
1. Verifies authentication
2. Resolves the repository by owner and name
3. Verifies the actor has write access
4. Fetches the current landing request by number
5. Validates and applies each provided field
6. Enforces the state machine for state transitions
7. Persists the update only if at least one field was provided
8. Manages `closed_at` timestamp on state transitions to/from `closed`
9. Returns the full updated landing request response

### CLI Command

**Command:** `codeplane land edit <number>`

**Aliases:** `codeplane lr edit <number>`

**Arguments:**
- `number` (required) — Landing request number

**Options:**
- `--title <string>` — New title
- `--body <string>` — New body/description
- `--target <string>` — New target bookmark
- `--repo <OWNER/REPO>` — Repository reference (defaults to current repo context)

**Output (text mode):**
```
Updated landing request #42 in owner/repo
  Title:  Updated landing request title
  State:  draft
  Target: main
```

**Output (JSON mode, via `--json`):**
Returns the full `LandingRequestResponse` JSON object.

**Error output:**
```
Error: Landing request #999 not found in owner/repo
Error: Permission denied — you do not have write access to owner/repo
Error: Title cannot be empty
Error: Invalid state transition from 'merged'
```

**Notable behavior:**
- The CLI does not currently expose `--state`, `--source`, or `--conflict-status` flags. State transitions are managed through dedicated commands or the web/TUI surfaces
- If no options are provided, the command returns an error indicating that at least one field must be specified
- Repository resolution follows the standard CLI repo resolution chain: `--repo` flag → git remote detection → config default

### TUI UI

The TUI provides a full-screen landing edit form. Key design highlights:

- **Entry points:** Press `e` from landing detail view, `e` from landing list (focused row), or `:edit landing` from command palette
- **Pre-populated fields:** Title (text input, focused by default), Body (multi-line textarea), Target Bookmark (select overlay), Source Bookmark (select overlay with "None" option), State (select overlay showing only valid transitions)
- **Read-only info:** Change IDs and conflict status displayed but not editable
- **Navigation:** Tab/Shift+Tab through fields, Ctrl+S to save from any field, Esc to cancel with dirty-check confirmation
- **State colors:** Green for open, gray for draft, red for closed
- **Blocked for merged:** Pressing `e` on a merged landing request shows a status bar message instead of opening the form
- **Only modified fields sent:** The PATCH payload includes only fields the user actually changed
- **Responsive:** Adapts layout at 80×24 (minimum), 120×40 (standard), and 200×60+ (large) breakpoints
- **Discard confirmation:** Esc with unsaved changes shows "Discard unsaved changes? [y/N]" dialog
- **Error recovery:** Save failures show error banner; `R` key retries

### Web UI Design

The web application landing request detail page should include:

- An **Edit** button visible to users with write access, hidden for read-only users and anonymous visitors
- Inline editing for the title field (click to edit, Enter to save, Escape to cancel)
- A description edit mode using a markdown editor with preview toggle
- A sidebar or metadata panel with dropdown selectors for target bookmark, source bookmark, and state
- State transition buttons: "Close" (from open/draft), "Reopen" (from closed), "Convert to draft" (from open)
- Visual feedback during save (spinner/loading state) and on success (brief confirmation)
- Error display for validation failures inline next to the relevant field
- The Edit button and all edit affordances are hidden for merged landing requests

### Documentation

End-user documentation should cover:

- **"Editing a landing request"** guide explaining how to update title, description, target bookmark, source bookmark, and state from web, CLI, and TUI
- **"Landing request states"** reference documenting the state machine (open, draft, closed, merged) and which transitions are allowed
- **CLI reference** for `codeplane land edit` including all flags, examples, and common error messages
- **TUI keyboard shortcuts** reference for the edit form
- **API reference** for `PATCH /api/repos/:owner/:repo/landings/:number` with request/response examples

## Permissions & Security

### Authorization Roles

| Role | Can Edit | Notes |
|------|----------|-------|
| Anonymous | ❌ | Returns 401 |
| Authenticated (no repo access) | ❌ | Returns 403 |
| Read-only collaborator | ❌ | Returns 403 |
| Write collaborator | ✅ | Can edit any landing request in the repo |
| Landing request author | ✅ | Implicitly has write access if they created it |
| Admin collaborator | ✅ | Full edit access |
| Repository owner | ✅ | Full edit access |
| Organization owner | ✅ | Full edit access for repos in their org |

### Rate Limiting

- The `PATCH` endpoint is subject to the standard API mutation rate limit: **60 requests per minute per authenticated user**
- Rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) should be included in 429 responses
- Unauthenticated requests are rejected at the auth middleware layer before rate limiting applies

### Data Privacy

- Landing request titles and bodies may contain sensitive project information but are scoped to repository visibility (private repos are not publicly accessible)
- No PII is exposed beyond the author's username and ID, which are already public profile data
- Audit logging should capture who edited what, but the full request body should not be logged at info level to avoid leaking sensitive description content
- The `conflict_status` field is a system-managed classification and does not contain user-generated content

### Input Safety

- Title and body are stored as-is after trimming (title only). The server does not perform HTML sanitization because these values are rendered by clients that handle escaping
- Target and source bookmark values are treated as opaque strings by the edit endpoint — they are not validated against existing repository bookmarks at the API layer
- The `state` field is strictly validated against the allowed set and the state machine

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing_request.edited` | Successful PATCH response | `repo_owner`, `repo_name`, `landing_number`, `actor_id`, `fields_changed[]`, `old_state`, `new_state` (if state changed), `title_changed: bool`, `body_changed: bool`, `target_bookmark_changed: bool`, `source_bookmark_changed: bool`, `conflict_status_changed: bool`, `state_changed: bool`, `client` (web/cli/tui/api), `duration_ms` |
| `landing_request.edit_failed` | PATCH returns 4xx/5xx | `repo_owner`, `repo_name`, `landing_number`, `actor_id`, `error_code`, `error_type`, `client` |
| `landing_request.state_transition` | State field changed successfully | `repo_owner`, `repo_name`, `landing_number`, `from_state`, `to_state`, `actor_id`, `client` |
| `landing_request.reopened` | State transitioned from closed to open | `repo_owner`, `repo_name`, `landing_number`, `actor_id`, `time_closed_seconds`, `client` |

### Funnel Metrics

- **Edit initiation rate:** Ratio of landing requests that are ever edited vs. total created
- **Edit completion rate:** Ratio of successful edits to edit attempts (form opens or CLI invocations)
- **State change frequency:** Percentage of edits that include a state transition
- **Fields-per-edit distribution:** Histogram of how many fields are changed per edit (1, 2, 3+)
- **Time-to-first-edit:** Duration from landing request creation to first edit
- **Reopen rate:** Percentage of closed landing requests that are subsequently reopened
- **Client distribution:** Breakdown of edits by client surface (web, CLI, TUI, raw API)

### Success Indicators

- Edit completion rate > 90% indicates a smooth UX
- Median time-to-save < 3 seconds for API round-trip indicates healthy performance
- Error rate < 2% of edit attempts indicates stable backend
- Reopen rate < 10% indicates landing requests are being closed intentionally

## Observability

### Logging

| Level | Event | Structured Context |
|-------|-------|--------------------||
| `info` | Landing request edit attempted | `landing_number`, `repo_id`, `actor_id`, `fields_provided[]` |
| `info` | Landing request edit succeeded | `landing_number`, `repo_id`, `actor_id`, `fields_changed[]`, `response_time_ms` |
| `warn` | Landing request edit rejected (4xx) | `landing_number`, `repo_id`, `actor_id`, `status_code`, `error_code`, `error_field` |
| `error` | Landing request edit failed (5xx) | `landing_number`, `repo_id`, `actor_id`, `error_message`, `stack_trace`, `request_id` |
| `warn` | Invalid state transition attempted | `landing_number`, `repo_id`, `actor_id`, `from_state`, `to_state` |
| `info` | Landing request state changed | `landing_number`, `repo_id`, `actor_id`, `from_state`, `to_state` |
| `warn` | Edit attempted on merged landing request | `landing_number`, `repo_id`, `actor_id` |
| `debug` | Landing request edit payload parsed | `landing_number`, `field_count`, `has_title`, `has_body`, `has_state` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_edit_total` | Counter | `status` (success/error), `client` | Total landing request edit attempts |
| `codeplane_landing_edit_duration_seconds` | Histogram | `status`, `client` | Latency of landing request edit operations |
| `codeplane_landing_edit_errors_total` | Counter | `error_code` (400/401/403/404/422/429/500) | Landing request edit errors by HTTP status |
| `codeplane_landing_state_transitions_total` | Counter | `from_state`, `to_state` | State transitions via edit |
| `codeplane_landing_edit_fields_count` | Histogram | `client` | Number of fields changed per edit |

### Alerts

**Alert: High landing edit error rate**
- **Condition:** `rate(codeplane_landing_edit_errors_total{error_code=~"5.."}[5m]) / rate(codeplane_landing_edit_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_landing_edit_errors_total` by `error_code` to identify dominant error type
  2. If 500s: Check server logs for stack traces with `request_id`. Look for database connection issues, query timeouts, or service crashes
  3. If database-related: Check DB connection pool metrics and recent migrations
  4. If specific to one repository: Check if the repository is corrupted or has an unusually large landing request count
  5. If widespread: Check recent deployments for regressions. Consider rolling back

**Alert: Landing edit latency spike**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_landing_edit_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency metrics for the `landing_requests` table
  2. Check if there is a database lock contention issue (concurrent edits on same landing request)
  3. Check server resource utilization (CPU, memory, connections)
  4. Review slow query logs for the `UPDATE landing_requests` query
  5. If isolated to specific repos: check repository size metrics

**Alert: Elevated 403 rate on landing edits**
- **Condition:** `rate(codeplane_landing_edit_errors_total{error_code="403"}[15m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. This may indicate a permissions misconfiguration or a user confusion issue
  2. Check if a recent repository or team permission change removed write access for active contributors
  3. If associated with a single user: may be an unauthorized access attempt; review auth logs
  4. If associated with a single repo: check repository collaborator settings

**Alert: Unusual state transition pattern**
- **Condition:** `rate(codeplane_landing_state_transitions_total{to_state="closed"}[1h]) / rate(codeplane_landing_state_transitions_total[1h]) > 0.8`
- **Severity:** Info
- **Runbook:**
  1. A high close rate may indicate automated tooling mass-closing landing requests
  2. Check if an agent or webhook integration is triggering bulk closures
  3. Verify with the team whether this is intentional (e.g., end-of-sprint cleanup)

### Error Cases and Failure Modes

| Error Case | HTTP Code | Behavior | Recovery |
|------------|-----------|----------|----------|
| Invalid JSON body | 400 | Request rejected at content-type middleware | Fix request payload |
| Non-numeric landing number | 400 | Route parameter validation fails | Use valid integer |
| No auth token | 401 | Auth middleware rejects | Authenticate |
| Expired token | 401 | Auth middleware rejects | Re-authenticate |
| No write access | 403 | Service authorization check fails | Request collaborator access |
| Repository not found | 404 | Repository resolution fails | Verify owner/repo |
| Landing request not found | 404 | Landing lookup by number fails | Verify landing number |
| Empty title | 422 | Title validation fails | Provide non-empty title |
| Invalid state value | 422 | State validation fails | Use open/draft/closed |
| Invalid state transition | 422 | State machine check fails | Check current state first |
| Empty target bookmark | 422 | Target bookmark validation fails | Provide non-empty target |
| Invalid conflict status | 422 | Conflict status validation fails | Use clean/conflicted/unknown |
| Rate limit exceeded | 429 | Rate limiter rejects | Wait and retry |
| Database write failure | 500 | SQL update fails | Retry; escalate if persistent |
| Service crash | 500 | Unhandled exception | Check logs; restart if needed |

## Verification

### API Integration Tests

- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update title only returns 200 with updated title and unchanged other fields
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update body only returns 200 with updated body
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update title and body simultaneously returns 200 with both updated
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update target_bookmark returns 200 with new target
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update source_bookmark returns 200 with new source
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Clear source_bookmark by setting to empty string returns 200 with empty source
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state from open to draft returns 200 with state "draft"
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state from open to closed returns 200 with state "closed" and non-null closed_at
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state from draft to open returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state from draft to closed returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state from closed to open returns 200 with cleared closed_at
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state from closed to draft returns 422 (invalid transition)
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state to "merged" returns 422 (cannot manually set merged)
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update state on a merged landing returns 422 (cannot transition from merged)
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update conflict_status to "clean" returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update conflict_status to "conflicted" returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update conflict_status to "unknown" returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Update conflict_status to invalid value returns 422
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Empty body `{}` returns 200 with unchanged landing request
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Empty title `""` returns 422
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Whitespace-only title `"   "` returns 422
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Title at maximum length (255 characters) returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Title exceeding maximum length (256+ characters) returns 422 or is truncated (verify behavior)
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Body at maximum length (65,535 characters) returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Body exceeding maximum length (65,536+ characters) returns 422 or is truncated (verify behavior)
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Title with Unicode characters (emoji, CJK, combining marks) returns 200 with preserved content
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Body with Unicode and markdown formatting returns 200 with preserved content
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Empty target_bookmark `""` returns 422
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Whitespace-only target_bookmark returns 422
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Target bookmark with special characters (slashes, dots) returns 200
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Non-existent landing number returns 404
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Non-numeric landing number returns 400
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Landing number 0 returns 404
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Negative landing number returns 400
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Non-existent repo returns 404
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — updated_at is refreshed after successful edit
- [ ] `PATCH /api/repos/:owner/:repo/landings/:number` — Same-state transition (e.g., open → open) returns 200

### API Authorization Tests

- [ ] `PATCH` without auth token returns 401
- [ ] `PATCH` with invalid auth token returns 401
- [ ] `PATCH` with expired auth token returns 401
- [ ] `PATCH` by user with no repo access returns 403
- [ ] `PATCH` by read-only collaborator returns 403
- [ ] `PATCH` by write collaborator returns 200
- [ ] `PATCH` by admin collaborator returns 200
- [ ] `PATCH` by repository owner returns 200
- [ ] `PATCH` by organization owner on org repo returns 200
- [ ] `PATCH` by PAT-authenticated user with write access returns 200

### CLI E2E Tests

- [ ] `codeplane land edit <number> --title "New title"` — Updates title, outputs updated record
- [ ] `codeplane land edit <number> --body "New body"` — Updates body
- [ ] `codeplane land edit <number> --target "develop"` — Updates target bookmark
- [ ] `codeplane land edit <number> --title "T" --body "B" --target "main"` — Updates multiple fields simultaneously
- [ ] `codeplane land edit <number> --title "New title" --json` — Returns full JSON response
- [ ] `codeplane land edit <number> --title "New title" --repo owner/repo` — Works with explicit repo flag
- [ ] `codeplane land edit 9999` — Non-existent landing request returns error message
- [ ] `codeplane land edit <number> --title ""` — Empty title returns validation error
- [ ] `codeplane land edit <number>` with no options — Returns error indicating at least one field required
- [ ] `codeplane lr edit <number> --title "Alias test"` — The `lr` alias works for landing edit
- [ ] `codeplane land edit <number> --title` with 255-character title — Maximum valid title succeeds
- [ ] `codeplane land edit <number>` without auth — Returns authentication error

### TUI E2E Tests

- [ ] Open landing edit form via `e` key from landing detail view — Form renders pre-populated
- [ ] Open landing edit form via `e` key from landing list (focused row) — Form renders pre-populated
- [ ] Edit title and save via Ctrl+S — PATCH sent with title only, returns to detail view
- [ ] Edit body and save — PATCH sent with body only
- [ ] Change target bookmark via select overlay — PATCH sent with new target
- [ ] Change source bookmark via select overlay — PATCH sent with new source
- [ ] Clear source bookmark (select "None") — PATCH sent with empty source
- [ ] Change state via select overlay from open to draft — PATCH sent with new state
- [ ] Change state from open to closed — PATCH sent, closed_at populated
- [ ] Change state from closed to open (reopen) — PATCH sent, closed_at cleared
- [ ] Cancel edit with no changes via Esc — Pops immediately without confirmation
- [ ] Cancel edit with unsaved changes via Esc — Shows discard confirmation dialog
- [ ] Confirm discard in dialog — Pops form without saving
- [ ] Abort discard in dialog — Returns to form with changes preserved
- [ ] Edit attempted on merged landing request — Status bar message shown, form does not open
- [ ] Save error (network failure) — Error banner shown, retry via `R` key
- [ ] Edit multiple fields and save — Only modified fields in PATCH payload
- [ ] Quick edit flow: `e` → type new title → Ctrl+S — Full round-trip completes

### Web UI E2E Tests (Playwright)

- [ ] Landing request detail page shows Edit button for write-access user
- [ ] Landing request detail page hides Edit button for read-only user
- [ ] Landing request detail page hides Edit button for anonymous visitor
- [ ] Click Edit on title — Inline edit activates, current title shown in input
- [ ] Edit title and press Enter — Title updates, success feedback shown
- [ ] Edit title and press Escape — Edit cancelled, original title restored
- [ ] Edit description — Markdown editor opens with current body
- [ ] Save description edit — Body updates
- [ ] Change target bookmark via dropdown — Updates target
- [ ] Change state via state action button (Close) — State changes to closed
- [ ] Change state via state action button (Reopen) — State changes to open
- [ ] Merged landing request — Edit controls are disabled/hidden
- [ ] Empty title submission — Inline validation error shown
- [ ] Network error during save — Error toast/banner displayed with retry option
- [ ] Concurrent edit by another user — Page reflects latest state after refresh

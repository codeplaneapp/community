# LANDING_REVIEW_REQUEST_CHANGES

Specification for LANDING_REVIEW_REQUEST_CHANGES.

## High-Level User POV

When a reviewer examines a landing request and determines that the proposed changes are not yet ready to land, they need a clear way to signal "these changes need work." The **Request Changes** review type is that signal. It is the blocking counterpart to an approval — where an approval says "this is ready to go," a request-changes review says "this needs modification before it can land."

A reviewer submits a request-changes review from any Codeplane client: the web UI, CLI, TUI, or editor integration. The workflow is natural: the reviewer reads the landing request's description and diff, identifies problems or improvements, writes specific feedback in the review body, and submits the review with the "Request Changes" type. The review body is mandatory — requesting changes without explaining what needs to change would be unhelpful, so Codeplane enforces that the reviewer articulate their feedback.

Once submitted, a request-changes review has immediate, visible impact. It appears in the reviews timeline with a red indicator, it is counted in the summary bar as a "changes requested" entry, and — critically — it blocks the landing request from being merged on protected bookmarks. The landing request author and other collaborators see at a glance that changes have been requested and can read the specific feedback.

The request-changes review is not permanent. Once the author addresses the feedback, the reviewer can submit a new review (either an approval or another comment), or another user with write access can dismiss the stale request-changes review. The system considers the latest submitted review per reviewer as the authoritative one, so a reviewer who initially requested changes and later approves will have their approval counted, not their earlier objection.

This feature is essential for jj-native code review workflows. Because landing requests represent stacked changes with stable change IDs, a request-changes review can reference specific changes in the stack and provide targeted feedback. The review body supports full markdown, so reviewers can include code snippets, links, checklists, and structured formatting to make their feedback actionable.

For agent-assisted workflows, the request-changes review is equally important. When an agent produces a landing request from an issue automation flow, a human reviewer uses request-changes to provide specific feedback that the agent (or the original author) can act on. The review body becomes the specification for what needs to change.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access to a repository can submit a review of type `request_changes` on an open or draft landing request
- [ ] The review body is mandatory for `request_changes` type — submitting with an empty body returns a validation error
- [ ] The review body accepts any Unicode content including markdown, with a maximum length of 65,535 characters
- [ ] A review body exceeding 65,535 characters is rejected with a clear `422` validation error: `{ resource: "LandingReview", field: "body", code: "too_long" }`
- [ ] The review is persisted with `type: "request_changes"` and `state: "submitted"`
- [ ] The review response includes `id`, `landing_request_id`, `reviewer: { id, login }`, `type`, `body`, `state`, `created_at`, `updated_at`
- [ ] The landing request author cannot submit a `request_changes` review on their own landing request — the server returns a `422` with `{ resource: "LandingReview", field: "type", code: "self_review" }`
- [ ] A `request_changes` review blocks the landing request from being merged on protected bookmarks, regardless of approval count
- [ ] A `request_changes` review is superseded when the same reviewer submits a newer review (approve, comment, or another request_changes)
- [ ] A `request_changes` review can be dismissed by any user with write access (except the reviewer themselves) via `PATCH .../reviews/:id` with state change to `dismissed`
- [ ] Dismissed `request_changes` reviews no longer block merge
- [ ] Multiple different reviewers can independently submit `request_changes` reviews on the same landing request
- [ ] The `request_changes` review appears in the reviews timeline with a red indicator and "Changes requested" label
- [ ] The reviews summary bar counts active (non-dismissed) `request_changes` reviews: "N changes requested"
- [ ] The landing list view shows a changes-requested indicator for landing requests that have unresolved `request_changes` reviews
- [ ] The `request_changes` review type is available across web UI, CLI, TUI, and editor integration clients
- [ ] Submitting a `request_changes` review fires a notification to the landing request author
- [ ] A review body of exactly 1 character is accepted
- [ ] A review body consisting entirely of whitespace is rejected as empty (trimmed length = 0)
- [ ] Leading and trailing whitespace in the body is preserved (not trimmed for storage), but the emptiness check trims before validating
- [ ] The `type` field value `request_changes` is case-insensitive during creation (e.g., `REQUEST_CHANGES`, `Request_Changes` are accepted and normalized to `request_changes`)
- [ ] Submitting a review on a non-existent landing request returns `404`
- [ ] Submitting a review on a merged landing request returns `422` with message "landing request is not open"
- [ ] Submitting a review on a closed landing request returns `422` with message "landing request is not open"
- [ ] Submitting a review without authentication returns `401`
- [ ] Submitting a review without write access returns `403`

### Boundary Constraints

| Field | Min | Max | Validation |
|-------|-----|-----|------------|
| `type` | — | — | Must be `"request_changes"` (case-insensitive, normalized to lowercase) |
| `body` | 1 char (after trim) | 65,535 chars | Required; whitespace-only rejected; any Unicode including markdown |
| `landing_request.state` | — | — | Must be `"open"` or `"draft"` for review submission |

## Design

### Web UI Design

#### Reviews Tab — Request Changes Entry

Within the landing request detail page (`/:owner/:repo/landings/:number`), the Reviews tab displays `request_changes` reviews with distinct visual treatment:

- **Type badge**: Red pill/tag with "✗ Changes Requested" text
- **Reviewer**: Avatar + linked username
- **Timestamp**: Relative ("2 hours ago") with absolute tooltip
- **Body**: Rendered as full markdown (headings, code blocks, links, task lists)
- **Dismissed state**: If dismissed, the entire review card renders in muted/strikethrough styling with a "Dismissed" badge replacing the type badge

#### Submit Review Form — Request Changes Option

The review submission form (accessible via "Submit Review" button on the Reviews tab) includes:

- **Type selector**: Three radio-style options — Approve (green ✓), Request Changes (red ✗), Comment (blue 💬)
- When "Request Changes" is selected:
  - The body textarea label changes to "What needs to change? (required)"
  - The body textarea shows a red-accented required indicator
  - The submit button reads "Submit: Request Changes"
  - The submit button is disabled if the body is empty
- If the current user is the landing request author, the "Request Changes" option is disabled with grayed text and a tooltip: "Cannot request changes on your own landing request"
- On successful submission: the form closes, the reviews list refreshes, and a success toast appears ("Review submitted")
- On validation failure (empty body): the body field shows a red error state with message "A comment is required when requesting changes"

#### Landing Header — Review Status Indicator

When any active `request_changes` review exists:
- The review summary section in the Overview tab shows "M changes requested" in red
- The landing list row shows a red ✗ indicator alongside the landing title

### API Shape

**Create a request-changes review:**

```
POST /api/repos/:owner/:repo/landings/:number/reviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "request_changes",
  "body": "The error handling in the SSE reconnection path needs a `close()` call before re-creating the EventSource."
}

→ 201 Created
{
  "id": 42,
  "landing_request_id": 15,
  "reviewer": { "id": 7, "login": "bob" },
  "type": "request_changes",
  "body": "The error handling in the SSE reconnection path needs a `close()` call...",
  "state": "submitted",
  "created_at": "2026-03-22T14:30:00Z",
  "updated_at": "2026-03-22T14:30:00Z"
}
```

**Validation error — empty body:**

```
POST /api/repos/:owner/:repo/landings/:number/reviews
{ "type": "request_changes", "body": "" }

→ 422 Unprocessable Entity
{ "errors": [{ "resource": "LandingReview", "field": "body", "code": "missing_field" }] }
```

**Validation error — body too long:**

```
POST /api/repos/:owner/:repo/landings/:number/reviews
{ "type": "request_changes", "body": "<65536+ characters>" }

→ 422 Unprocessable Entity
{ "errors": [{ "resource": "LandingReview", "field": "body", "code": "too_long" }] }
```

**Self-review error:**

```
POST /api/repos/:owner/:repo/landings/:number/reviews
{ "type": "request_changes", "body": "..." }  // by the landing request author

→ 422 Unprocessable Entity
{ "errors": [{ "resource": "LandingReview", "field": "type", "code": "self_review" }] }
```

### SDK Shape

Shared hooks in `@codeplane/ui-core`:

```typescript
useCreateReview(owner: string, repo: string, number: number)
  → { mutate: (input: { type: "approve" | "request_changes" | "comment", body?: string }) => Promise<LandingReviewResponse>, loading: boolean, error: Error | null }
```

No separate hook for `request_changes` — the existing `useCreateReview` hook handles all review types. The `type` field determines behavior.

### CLI Command

The `land review` command supports `request_changes` via the `--action` flag:

```bash
# Submit a request-changes review
codeplane land review 37 --action request-changes --body "Please fix the failing test."

# Short form with repo flag
codeplane lr review 37 -R owner/repo --action request-changes --body "Needs cleanup"

# With multiline body via stdin
echo "## Issues Found\n- Missing test" | codeplane lr review 37 --action request-changes --body -
```

**CLI output (human-readable):**
```
Submitted review on landing request #37: changes requested
```

**CLI output (JSON, via `--json`):**
```json
{
  "id": 42,
  "landing_request_id": 15,
  "reviewer": { "id": 7, "login": "bob" },
  "type": "request_changes",
  "body": "Please fix the failing test...",
  "state": "submitted",
  "created_at": "2026-03-22T14:30:00Z",
  "updated_at": "2026-03-22T14:30:00Z"
}
```

**CLI error (missing body):**
```
Error: A comment is required when requesting changes. Use --body to provide feedback.
```

**CLI validation:**
- `--action request-changes` maps to `type: "request_changes"` in the API payload
- `--body` is required when `--action` is `request-changes`; omitting it produces an error before the API call
- `--body -` reads from stdin for multiline input

### TUI UI

The TUI review form (TUI_LANDING_REVIEW_FORM) supports `request_changes` as one of three type options:

- **Type selector position**: Second option (key `2`)
- **Visual**: Red ✗ icon with "Request Changes" label
- **Description** (standard/large terminal): "Block landing until concerns are addressed."
- **Body behavior**: Textarea becomes required — Ctrl+S is blocked if body is empty, with validation message "Body required for Request Changes"
- **Self-review**: Disabled with "(cannot review own landing)" hint; pressing `2` shows status bar message
- **Success**: Pops form, reviews tab refreshes, status bar shows "Review submitted ✓"

The TUI reviews view (TUI_LANDING_REVIEWS_VIEW) displays `request_changes` reviews:
- **Icon**: ✗ red (ANSI 196)
- **Type label**: "Changes requested"
- **Summary bar**: Counted as "P changes requested"
- **Dismissal**: Focusable, dismissible via `d` key with confirmation

### Neovim Plugin

The Neovim plugin supports submitting `request_changes` reviews via command:

```vim
:CodeplaneReviewRequestChanges <landing_number>
```

This opens a buffer for the review body. On save-and-close (`:wq`), the review is submitted. Empty buffers produce an error message.

Alternatively via Lua API:

```lua
require('codeplane').review({
  repo = "owner/repo",
  landing = 37,
  type = "request_changes",
  body = "Please fix the test"
})
```

### VS Code Extension

The VS Code extension supports `request_changes` via:

- **Landing request detail webview**: Same review form as web UI, with type selector including "Request Changes"
- **Command palette**: `Codeplane: Review Landing Request` → prompts for type selection including "Request Changes" → opens body input
- **Inline action**: Right-click on a landing request in the Landings tree view → "Request Changes" → opens body input quick pick

### Documentation

The following end-user documentation should be written:

- **User Guide: Reviewing Landing Requests** — Section explaining the three review types, with emphasis on when and how to use "Request Changes" vs. "Comment" vs. "Approve"
- **CLI Reference: `land review`** — Updated to document the `--action request-changes` flag and `--body` requirement
- **API Reference: Create Landing Review** — Updated to document the `request_changes` type, body requirement, and self-review restriction
- **Concepts: Protected Bookmarks and Required Approvals** — Section explaining how `request_changes` reviews interact with merge gating

## Permissions & Security

### Authorization Roles

| Role | Can Submit `request_changes` | Notes |
|------|------|-------|
| Anonymous | ❌ | No access to mutation endpoints |
| Authenticated (no repo access) | ❌ | `403 Forbidden` |
| Read-only collaborator | ❌ | Requires write access; `403 Forbidden` |
| Write collaborator | ✅ | Full access (except on own landing) |
| Landing request author | ❌ | Self-review blocked; `422` with `self_review` code |
| Admin | ✅ | Full access (except on own landing) |
| Repository owner | ✅ | Full access (except on own landing) |
| Organization owner | ✅ | Full access on org repos (except on own landing) |

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `POST .../reviews` (create) | 60 requests/minute | Per authenticated user |
| `GET .../reviews` (list) | 300 requests/minute | Per authenticated user |
| `PATCH .../reviews/:id` (dismiss) | 60 requests/minute | Per authenticated user |

Rate limit responses return `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- Review bodies may contain PII (names, email addresses in quotes, etc.) — they are stored as-is and rendered to users with repository read access
- Review bodies are included in webhook payloads for `landing_request.reviewed` events — webhook recipients must be trusted
- Review bodies are included in notification payloads sent to the landing request author
- Deleted user accounts: reviewer username is resolved at creation time and stored as a denormalized string; reviews persist after account deletion
- Review bodies are not indexed in full-text search (only review metadata is searchable)

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `landing.review.request_changes_submitted` | Successful `request_changes` review creation | `repo_owner`, `repo_name`, `landing_number`, `review_id`, `reviewer_id`, `body_length`, `stack_size`, `landing_age_hours`, `is_first_review_on_lr`, `total_reviews_on_lr`, `client` (web/cli/tui/vscode/nvim) |
| `landing.review.request_changes_dismissed` | A `request_changes` review is dismissed | `repo_owner`, `repo_name`, `landing_number`, `review_id`, `dismisser_id`, `original_reviewer_id`, `review_age_hours`, `client` |
| `landing.review.request_changes_superseded` | Same reviewer submits a new review (any type) after a prior `request_changes` | `repo_owner`, `repo_name`, `landing_number`, `old_review_id`, `new_review_id`, `new_review_type`, `time_between_reviews_hours` |
| `landing.review.self_review_blocked` | Author attempts `request_changes` on own landing | `repo_owner`, `repo_name`, `landing_number`, `client` |
| `landing.review.request_changes_body_empty` | Validation rejects empty body | `repo_owner`, `repo_name`, `landing_number`, `client` |
| `landing.merge.blocked_by_request_changes` | Merge attempt blocked because of outstanding `request_changes` | `repo_owner`, `repo_name`, `landing_number`, `blocking_review_count`, `blocking_reviewers` |

### Funnel Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Request changes submission rate | % of landing requests that receive at least one `request_changes` review | 15–30% (indicates healthy review culture) |
| Request changes → resolution rate | % of `request_changes` reviews followed by either a new approval from the same reviewer or dismissal | >80% within 48 hours |
| Time to resolution | Median time from `request_changes` submission to the reviewer's next review (approve/comment) or dismissal | <24 hours |
| Merge block effectiveness | % of merge attempts blocked by `request_changes` that are later successfully merged after resolution | >90% |
| Client distribution | Breakdown of `request_changes` submissions by client type | Track for adoption insights |
| Self-review block encounters | Frequency of `self_review_blocked` events | Low and stable (indicates clear UX) |

## Observability

### Logging

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `info` | Review created | `review_id`, `landing_request_id`, `reviewer_id`, `type: "request_changes"`, `body_length`, `repo_id` |
| `info` | Review dismissed | `review_id`, `landing_request_id`, `dismisser_id`, `type: "request_changes"`, `repo_id` |
| `warn` | Validation failed — empty body | `landing_request_id`, `reviewer_id`, `type: "request_changes"`, `repo_id` |
| `warn` | Validation failed — body too long | `landing_request_id`, `reviewer_id`, `body_length`, `repo_id` |
| `warn` | Self-review blocked | `landing_request_id`, `reviewer_id`, `type: "request_changes"`, `repo_id` |
| `warn` | Rate limited | `reviewer_id`, `endpoint`, `retry_after` |
| `error` | Review creation failed (DB error) | `landing_request_id`, `reviewer_id`, `error_message`, `repo_id`, `request_id` |
| `error` | Review creation failed (unexpected) | `landing_request_id`, `reviewer_id`, `error_message`, `stack_trace`, `request_id` |
| `info` | Merge blocked by request_changes | `landing_request_id`, `blocking_review_ids`, `repo_id` |
| `debug` | Review type validation passed | `landing_request_id`, `reviewer_id`, `type`, `body_length` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_reviews_created_total` | Counter | `type`, `repo_id` | Total reviews created, labeled by type |
| `codeplane_landing_reviews_request_changes_active` | Gauge | `repo_id` | Currently active (non-dismissed) request_changes reviews |
| `codeplane_landing_reviews_dismissed_total` | Counter | `type`, `repo_id` | Total reviews dismissed |
| `codeplane_landing_review_create_duration_seconds` | Histogram | `type`, `status_code` | Latency of review creation endpoint |
| `codeplane_landing_review_validation_failures_total` | Counter | `type`, `field`, `code` | Validation failures by type and error |
| `codeplane_landing_merge_blocked_total` | Counter | `reason` | Merge attempts blocked, with `reason: "request_changes"` |
| `codeplane_landing_review_body_size_bytes` | Histogram | `type` | Distribution of review body sizes |

### Alerts

**Alert: High review creation failure rate**
- Condition: `rate(codeplane_landing_review_validation_failures_total{type="request_changes"}[5m]) / rate(codeplane_landing_reviews_created_total{type="request_changes"}[5m]) > 0.3`
- Severity: Warning
- Runbook:
  1. Check recent deployment for API contract changes
  2. Inspect validation failure breakdown by `field` and `code` labels
  3. If `body/missing_field` dominates: likely a client regression not sending body — check recent client deployments
  4. If `body/too_long` dominates: check if a specific integration is sending oversized payloads
  5. If `type/self_review` dominates: UX issue — clients are not properly disabling the option for authors

**Alert: Review creation latency spike**
- Condition: `histogram_quantile(0.95, rate(codeplane_landing_review_create_duration_seconds_bucket{type="request_changes"}[5m])) > 2`
- Severity: Warning
- Runbook:
  1. Check database query latency — `createLandingRequestReview` query performance
  2. Check connection pool saturation
  3. Check if a large repository is causing slow repo resolution
  4. Review recent migrations or schema changes
  5. If isolated to one repo: check repository size and landing request review count

**Alert: Review creation errors (5xx)**
- Condition: `rate(codeplane_landing_review_create_duration_seconds_count{status_code=~"5.."}[5m]) > 0.1`
- Severity: Critical
- Runbook:
  1. Check server error logs for `review creation failed` entries
  2. Check database connectivity and health
  3. Check disk space (if DB is local)
  4. Check PGLite health (if daemon mode)
  5. Restart the server process if DB connection is stale
  6. Escalate if persistent after restart

**Alert: Abnormal self-review block rate**
- Condition: `rate(codeplane_landing_review_validation_failures_total{code="self_review"}[1h]) > 10`
- Severity: Info
- Runbook:
  1. This indicates users are repeatedly trying to request changes on their own landing requests
  2. Check which client(s) are generating these — may indicate a client UX bug not disabling the option
  3. Review client-side self-review disabling logic
  4. No server-side action needed — the guard is working correctly

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Missing authentication | 401 | No token or expired session | Re-authenticate |
| Insufficient permissions | 403 | Read-only or no repo access | Request write access |
| Landing not found | 404 | Invalid number or deleted landing | Verify landing request exists |
| Landing not open | 409/422 | Landing is merged, closed, or queued | Cannot review non-open landings |
| Empty body | 422 | Body is empty or whitespace-only | Provide review content |
| Body too long | 422 | Body exceeds 65,535 chars | Shorten review body |
| Self-review | 422 | Author trying to request changes on own LR | Only non-authors can request changes |
| Invalid type | 422 | Type field not recognized | Use `request_changes` |
| Rate limited | 429 | Too many requests | Wait for `Retry-After` period |
| Internal server error | 500 | Database failure, unexpected error | Retry; escalate if persistent |

## Verification

### API Integration Tests

- [ ] `POST .../reviews` with `type: "request_changes"` and valid body returns `201` with correct response shape
- [ ] `POST .../reviews` with `type: "request_changes"` and empty string body returns `422` (missing_field)
- [ ] `POST .../reviews` with `type: "request_changes"` and whitespace-only body returns `422` (missing_field)
- [ ] `POST .../reviews` with `type: "request_changes"` and 1-character body returns `201`
- [ ] `POST .../reviews` with `type: "request_changes"` and 65,535-character body returns `201`
- [ ] `POST .../reviews` with `type: "request_changes"` and 65,536-character body returns `422` (too_long)
- [ ] `POST .../reviews` with `type: "REQUEST_CHANGES"` (uppercase) returns `201` (case-insensitive)
- [ ] `POST .../reviews` with `type: "Request_Changes"` (mixed case) returns `201` (case-insensitive)
- [ ] `POST .../reviews` with `type: "request_changes"` and body containing markdown returns `201` with body preserved
- [ ] `POST .../reviews` with `type: "request_changes"` and body containing Unicode/emoji returns `201` with body preserved
- [ ] `POST .../reviews` with `type: "request_changes"` and body containing newlines returns `201` with body preserved
- [ ] `POST .../reviews` with `type: "request_changes"` by the landing request author returns `422` (self_review)
- [ ] `POST .../reviews` with `type: "request_changes"` on a merged landing request returns `409` or `422`
- [ ] `POST .../reviews` with `type: "request_changes"` on a closed landing request returns `409` or `422`
- [ ] `POST .../reviews` with `type: "request_changes"` on a non-existent landing request returns `404`
- [ ] `POST .../reviews` with `type: "request_changes"` without authentication returns `401`
- [ ] `POST .../reviews` with `type: "request_changes"` with read-only access returns `403`
- [ ] `POST .../reviews` with `type: "request_changes"` and no `type` field returns `422` (invalid type)
- [ ] `POST .../reviews` with `type: "request_changes"` and no `body` field returns `422` (missing_field)
- [ ] `GET .../reviews` returns the created `request_changes` review in the list with correct `type` and `state`
- [ ] Created `request_changes` review has `state: "submitted"` in the response
- [ ] Two different users can both submit `request_changes` reviews on the same landing request
- [ ] Same user submitting a second `request_changes` review creates a new review (does not update the first)
- [ ] `PATCH .../reviews/:id` dismisses a `request_changes` review, changing `state` to `"dismissed"`
- [ ] Dismissed `request_changes` review still appears in `GET .../reviews` list with `state: "dismissed"`
- [ ] `PUT .../land` is blocked when an active `request_changes` review exists on a protected bookmark
- [ ] `PUT .../land` succeeds after the `request_changes` review is dismissed
- [ ] `PUT .../land` succeeds after the reviewer submits a new `approve` review superseding their `request_changes`
- [ ] Response `created_at` and `updated_at` are valid ISO 8601 timestamps
- [ ] Response `reviewer.id` and `reviewer.login` match the authenticated user
- [ ] Response `landing_request_id` matches the target landing request
- [ ] Rate limiting: 61st request within 1 minute returns `429` with `Retry-After` header

### CLI E2E Tests

- [ ] `codeplane lr review <N> --action request-changes --body "Fix the test"` returns exit code 0 and success message
- [ ] `codeplane lr review <N> --action request-changes --body "Fix the test" --json` returns valid JSON with `type: "request_changes"`
- [ ] `codeplane lr review <N> --action request-changes` without `--body` returns non-zero exit code and error message about required body
- [ ] `codeplane lr review <N> --action request-changes --body ""` returns non-zero exit code and validation error
- [ ] `codeplane lr review <N> --action request-changes --body "x" -R owner/repo` succeeds with explicit repo
- [ ] `codeplane lr review 99999 --action request-changes --body "x"` on non-existent LR returns non-zero exit code
- [ ] `codeplane lr review list <N> --json` includes the `request_changes` review in the array
- [ ] `codeplane lr review dismiss <N> --review-id <ID>` dismisses the `request_changes` review
- [ ] CLI stdin body: `echo "Needs work" | codeplane lr review <N> --action request-changes --body -` succeeds

### Web UI (Playwright) E2E Tests

- [ ] Navigate to landing detail → Reviews tab → click "Submit Review" → select "Request Changes" → type body → submit → review appears in list with red badge
- [ ] Review form: selecting "Request Changes" shows body as required and changes submit button text
- [ ] Review form: attempting to submit "Request Changes" with empty body shows validation error and does not close form
- [ ] Review form: "Request Changes" option is disabled when viewing own landing request
- [ ] Reviews tab: `request_changes` review shows red ✗ icon and "Changes Requested" label
- [ ] Reviews tab: summary bar shows "1 changes requested" after submission
- [ ] Reviews tab: dismissed `request_changes` review shows muted/strikethrough styling
- [ ] Landing list: row shows changes-requested indicator after `request_changes` review is submitted
- [ ] Review form: body with 65,535 characters submits successfully
- [ ] Review form: body with 65,536 characters shows error on submit
- [ ] Review form: submitting request-changes review triggers notification to landing request author

### TUI E2E Tests

- [ ] Open landing detail → press `2` for Reviews tab → press `r` → press `2` for Request Changes → Tab to body → type feedback → Ctrl+S → review submitted, reviews tab refreshed
- [ ] TUI review form: pressing `2` selects "Request Changes" with red ✗ icon
- [ ] TUI review form: Ctrl+S with Request Changes selected and empty body shows validation error
- [ ] TUI review form: author viewing own landing sees Request Changes disabled with hint
- [ ] TUI reviews view: `request_changes` review shows ✗ red icon
- [ ] TUI reviews view: summary bar includes "changes requested" count
- [ ] TUI reviews view: dismissing a `request_changes` review via `d` key works with confirmation

### Notification Tests

- [ ] Submitting `request_changes` review creates a notification for the landing request author
- [ ] Notification payload includes review type, reviewer login, and landing request number
- [ ] Dismissing a `request_changes` review creates a notification for the original reviewer

### Cross-Client Consistency Tests

- [ ] A `request_changes` review created via CLI appears correctly in web UI reviews list
- [ ] A `request_changes` review created via web UI appears correctly in CLI `lr review list` output
- [ ] A `request_changes` review created via TUI appears correctly in API `GET .../reviews` response
- [ ] Dismissal via CLI is reflected in web UI and TUI
- [ ] Dismissal via web UI is reflected in CLI and TUI

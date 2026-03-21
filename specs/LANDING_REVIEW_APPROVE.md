# LANDING_REVIEW_APPROVE

Specification for LANDING_REVIEW_APPROVE.

## High-Level User POV

When a collaborator opens a landing request in Codeplane—whether in the web UI, CLI, TUI, or an editor integration—they can submit a formal approval to signal that the proposed changes are ready to land. Approving a landing request is the primary gate-keeping action in Codeplane's jj-native review workflow: it tells the landing request author and other team members that a qualified reviewer has examined the change stack and believes it is fit for integration.

The approval experience is designed to be fast and frictionless. A reviewer navigates to a landing request, inspects the diff and change stack, and then submits an approval—optionally including a comment body to add context such as "LGTM" or notes about what was verified. Approvals are immediately visible to all participants: they appear in the reviews timeline with a green approval badge and the reviewer's identity. The landing request detail view updates its review summary to reflect the new approval count.

Approvals are a distinct review action from general comments and change-request reviews. Unlike comments, an approval carries formal weight: the landing request's approval count increases, which can satisfy protected-bookmark rules requiring a minimum number of approvals before a landing request can be enqueued and merged. Unlike a change-request review, an approval does not block landing.

The approval action is available from every client surface in Codeplane. On the web, it is a button in the review form on the landing request detail page. In the CLI, it is a flag on the `land review` command. In the TUI, it is a selectable review type in the review form. All surfaces converge on the same API endpoint and enforce the same rules: the reviewer must be authenticated, must have write access to the repository, and cannot approve their own landing request.

If the landing request is already closed or merged, the approval action is unavailable. If a reviewer has previously submitted an approval, they may submit another one (the system records all reviews chronologically), but the approval count for protected-bookmark purposes counts distinct reviewers, not total approval submissions.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access to a repository can submit an approval review on any open landing request they did not author.
- [ ] The approval is persisted, appears in the reviews timeline, and is reflected in the landing request's approval summary count.
- [ ] The approval is available from web UI, CLI, and TUI surfaces with consistent behavior.
- [ ] All edge cases, validation rules, and error states are handled predictably across every client.

### Functional Constraints

- [ ] The review `type` field must be exactly `"approve"` (case-insensitive input accepted, normalized to lowercase).
- [ ] The `body` field is optional for approval reviews. An empty string or null body is acceptable.
- [ ] When a `body` is provided, it must not exceed 50,000 characters.
- [ ] The `body` field must be trimmed of leading/trailing whitespace before storage but may contain internal whitespace, newlines, markdown, and unicode characters.
- [ ] The `body` field may contain special characters including backticks, angle brackets, quotes, and emoji.
- [ ] The reviewer must be authenticated. Unauthenticated requests return HTTP 401.
- [ ] The reviewer must have write access to the repository. Users with read-only access receive HTTP 403.
- [ ] The reviewer must not be the author of the landing request. Self-approval attempts return HTTP 403 with a clear error message.
- [ ] The landing request must exist. A request against a nonexistent landing request number returns HTTP 404.
- [ ] The landing request must be in `open` state. Approvals on `closed` or `merged` landing requests return HTTP 422 with an explanatory message.
- [ ] An invalid or missing `type` field returns HTTP 422 with a structured validation error referencing the `type` field.
- [ ] Submitting an approval creates a review record with `state: "submitted"` and `type: "approve"`.
- [ ] The response includes the review `id`, `landing_request_id`, `reviewer` (with `id` and `login`), `type`, `body`, `state`, `created_at`, and `updated_at`.
- [ ] A reviewer may submit multiple approval reviews on the same landing request (no uniqueness constraint on reviewer+type per landing request).
- [ ] For protected-bookmark approval counting, only distinct `reviewer_id` values with `type = 'approve'` and `state = 'submitted'` are counted.
- [ ] Dismissed approvals (`state: "dismissed"`) do not count toward the approval threshold.
- [ ] An approval with a body containing only whitespace is treated as having no body (body is stored as empty string after trim).
- [ ] The `type` field does not accept arbitrary strings—only `approve`, `comment`, `request_changes`, and `pending` are valid.
- [ ] Empty JSON payloads `{}` with no `type` field return HTTP 422 validation error.
- [ ] Payloads with extra/unknown fields are silently ignored (no error for extra keys).

### Boundary Constraints

- [ ] `body` max length: 50,000 characters. A body of exactly 50,000 characters succeeds. A body of 50,001 characters returns HTTP 422.
- [ ] `body` min length: 0 characters (empty string or omitted).
- [ ] `type` must be one of the four allowed values. Case-insensitive: `"Approve"`, `"APPROVE"`, `"approve"` all normalize to `"approve"`.
- [ ] Landing request `number` must be a positive integer. Non-integer values return HTTP 400 or 404.
- [ ] Repository `owner` and `repo` path parameters must resolve to an existing repository. Invalid owner/repo combinations return HTTP 404.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/landings/:number/reviews`

**Request:**
```
Authorization: Bearer <PAT> | Cookie session
Content-Type: application/json

{
  "type": "approve",
  "body": "LGTM, ship it!"  // optional
}
```

**Success Response (201 Created):**
```json
{
  "id": 42,
  "landing_request_id": 7,
  "reviewer": {
    "id": 15,
    "login": "alice"
  },
  "type": "approve",
  "body": "LGTM, ship it!",
  "state": "submitted",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Unauthenticated | `{ "message": "authentication required" }` |
| 403 | No write access | `{ "message": "write access required" }` |
| 403 | Self-approval | `{ "message": "cannot approve your own landing request" }` |
| 404 | Repo not found | `{ "message": "repository not found" }` |
| 404 | Landing not found | `{ "message": "landing request not found" }` |
| 422 | Invalid type | `{ "message": "Validation Failed", "errors": [{ "resource": "LandingReview", "field": "type", "code": "invalid" }] }` |
| 422 | LR not open | `{ "message": "landing request is not open" }` |
| 422 | Body too long | `{ "message": "Validation Failed", "errors": [{ "resource": "LandingReview", "field": "body", "code": "too_long" }] }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### Web UI Design

**Location:** Reviews tab on the landing request detail page (`/:owner/:repo/landings/:number`).

**Review Form:**
- A collapsible review form panel appears below the diff viewer or at the bottom of the reviews timeline.
- The form contains a review type selector with three options displayed as radio-style buttons:
  - ✓ **Approve** (green accent) — selected for this feature
  - ✗ **Request Changes** (red accent)
  - 💬 **Comment** (blue accent)
- A multi-line textarea for the optional body, with markdown preview toggle.
- A **Submit Review** button that shows the selected type: "Approve" / "Approve with comment".
- If the user is the landing request author, the Approve option is disabled with tooltip: "You cannot approve your own landing request."
- If the user has read-only access, the Approve and Request Changes options are disabled with tooltip: "Write access required."
- If the landing request is not in `open` state, the entire form is disabled with message: "This landing request is closed/merged and cannot receive new reviews."

**Approval Badge in Timeline:**
- Each approval review in the timeline shows a green ✓ badge, the reviewer's avatar and username, the timestamp, and the optional body rendered as markdown.
- The reviews tab header shows a summary: "N reviews · M approved · P changes requested."

**Keyboard Shortcuts (Web):**
- `Ctrl+Enter` or `Cmd+Enter` submits the review form.
- `Escape` closes the review form (with dirty-check confirmation if body has content).

### CLI Command

**Usage:**
```bash
codeplane land review <number> --action approve [--body "Optional comment"] [--repo OWNER/REPO] [--json]
```

**Aliases:**
```bash
codeplane lr review <number> --action approve
```

**Options:**
| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `<number>` | positional integer | yes | — | Landing request number |
| `--action` | string | yes | — | Review action: `approve`, `request-changes`, or `comment` |
| `--body` | string | no | `""` | Review body text |
| `--repo` | string | no | auto-detect | Repository in `OWNER/REPO` format |
| `--json` | boolean | no | `false` | Output raw JSON response |

**Output (default text mode):**
```
✓ Approved landing request #7 in owner/repo
```

**Output (--json mode):**
The full `LandingReviewResponse` JSON object.

**Error Output:**
```
Error: cannot approve your own landing request
Error: landing request #99999 not found
Error: authentication required — run `codeplane auth login`
```

### TUI UI

**Access:** Press `r` from the landing detail screen, reviews tab, or diff viewer. Or invoke `:review landing` from the command palette.

**Review Type Selector:**
- Three options displayed vertically (or horizontally in compact terminals):
  - `[1]` ✓ Approve (green)
  - `[2]` ✗ Request Changes (red)
  - `[3]` 💬 Comment (blue)
- Press `1` to select Approve directly.
- `j`/`k` or `Up`/`Down` arrows cycle through options.

**Body Textarea:**
- Optional for Approve type. Placeholder text: "Add an optional comment…"
- Supports multi-line input. Size adapts to terminal dimensions (6 lines at 80×24, 15 lines at 120×40, 25+ lines at 200×60).

**Submit:**
- `Ctrl+S` submits from any focused element.
- Quick-approval flow: `r` → `1` → `Ctrl+S` (three keystrokes).
- On success: returns to landing detail with a success flash message: "✓ Approved landing request #N".
- On error: inline error message with `R` to retry.

**Disabled States:**
- If user is the landing request author: Approve option shows "(cannot review own landing)" and is not selectable.
- If landing request is not open: form does not open; a message is shown instead.

### SDK Shape

The `@codeplane/sdk` landing service exposes:

```typescript
createLandingReview(
  actor: User,
  owner: string,
  repo: string,
  number: number,
  req: { type: string; body?: string }
): Promise<Result<LandingReviewResponse, APIError>>
```

The method normalizes the `type` to lowercase, validates it against the allowed set, enforces authentication and write access, and delegates to the database layer.

### Documentation

The following end-user documentation should be written:

- **"Reviewing Landing Requests"** guide covering how to approve, request changes, and comment on landing requests across web, CLI, and TUI.
- **CLI reference page** for `codeplane land review` documenting all flags, examples, and error messages.
- **Keyboard shortcuts reference** updated to include review-form shortcuts in both web and TUI.
- **Protected bookmarks guide** explaining how approval counts interact with bookmark protection rules and landing queue eligibility.

## Permissions & Security

### Authorization Roles

| Role | Can Approve | Can Comment | Can Dismiss |
|------|-------------|-------------|-------------|
| Anonymous | ✗ (401) | ✗ (401) | ✗ (401) |
| Authenticated, no repo access | ✗ (404) | ✗ (404) | ✗ (404) |
| Read-only collaborator | ✗ (403) | ✓ | ✗ (403) |
| Write collaborator | ✓ | ✓ | ✗ (403) |
| Repository admin | ✓ | ✓ | ✓ |
| Organization owner | ✓ | ✓ | ✓ |
| Landing request author (with write) | ✗ (403, self-review) | ✓ | ✗ (403) |

### Self-Review Restriction

- The landing request author must not be permitted to submit an `approve` or `request_changes` review on their own landing request. They may submit `comment` reviews.
- This restriction must be enforced server-side in the service layer, not only in client UI.

### Rate Limiting

- Review creation: maximum 30 reviews per user per hour per repository.
- Review creation: maximum 5 reviews per user per minute per landing request (burst protection).
- Rate limit responses include a `Retry-After` header with seconds until the limit resets.

### Data Privacy

- Review bodies may contain freeform text. No PII scrubbing is applied, but review bodies are only visible to users with at least read access to the repository.
- Reviewer identity (user ID and login) is included in every review response. This is expected behavior for a collaboration tool and is not considered PII leakage.
- Private repository reviews are not accessible to users without repository access.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing_review.created` | Review successfully created | `review_id`, `landing_request_id`, `repo_id`, `reviewer_id`, `type` ("approve"), `has_body` (boolean), `body_length` (int), `client` ("web"\|"cli"\|"tui"\|"api") |
| `landing_review.approve_submitted` | Approval specifically submitted | `review_id`, `landing_request_id`, `repo_id`, `reviewer_id`, `approval_count_after` (int, distinct approved reviewers), `has_body` (boolean), `client` |
| `landing_review.self_review_blocked` | Self-review attempt rejected | `landing_request_id`, `repo_id`, `actor_id`, `attempted_type` ("approve"), `client` |
| `landing_review.form_opened` | Review form opened (web/TUI) | `landing_request_id`, `repo_id`, `client` |
| `landing_review.form_abandoned` | Review form closed without submission | `landing_request_id`, `repo_id`, `client`, `had_content` (boolean), `type_selected` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|------------|-------------------|
| Approval rate | % of landing requests receiving ≥1 approval before landing | > 80% for repos with protected bookmarks |
| Time to first approval | Median time from LR creation to first approval | Decreasing over time |
| Review form completion rate | % of opened review forms that result in submission | > 70% |
| Quick-approval usage (TUI) | % of TUI approvals using 3-keystroke flow | Increasing adoption |
| Approval → land latency | Time from final required approval to landing/merge | < 1 hour median |

## Observability

### Logging

| Event | Log Level | Structured Context |
|-------|-----------|-------------------|
| Approval review created | `info` | `{ event: "landing_review_created", review_id, landing_request_id, repo_id, reviewer_id, type: "approve" }` |
| Self-review blocked | `warn` | `{ event: "landing_review_self_blocked", landing_request_id, repo_id, actor_id, type: "approve" }` |
| Review creation failed (DB) | `error` | `{ event: "landing_review_create_failed", landing_request_id, repo_id, reviewer_id, error }` |
| Invalid review type rejected | `warn` | `{ event: "landing_review_invalid_type", landing_request_id, repo_id, actor_id, type_submitted }` |
| Review body exceeded max length | `warn` | `{ event: "landing_review_body_too_long", landing_request_id, repo_id, actor_id, body_length }` |
| Unauthorized review attempt | `warn` | `{ event: "landing_review_unauthorized", landing_request_id, repo_id }` |
| Write access denied | `warn` | `{ event: "landing_review_forbidden", landing_request_id, repo_id, actor_id }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_reviews_created_total` | counter | `type`, `repo_id` | Total reviews created, partitioned by type |
| `codeplane_landing_reviews_approved_total` | counter | `repo_id` | Total approval reviews created |
| `codeplane_landing_review_create_duration_seconds` | histogram | `type`, `status` | Latency of review creation endpoint |
| `codeplane_landing_review_self_blocked_total` | counter | `repo_id` | Self-review attempts blocked |
| `codeplane_landing_review_errors_total` | counter | `error_type` (`validation`, `auth`, `not_found`, `internal`) | Review creation errors by category |
| `codeplane_landing_review_body_length_bytes` | histogram | `type` | Distribution of review body sizes |

### Alerts

#### Alert: `LandingReviewCreateErrorRateHigh`
- **Condition:** `rate(codeplane_landing_review_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "landing_review_create_failed"` entries.
  2. Verify database connectivity: run `SELECT 1` against the primary database.
  3. Check if `landing_request_reviews` table is accessible and not locked.
  4. Look for disk space issues on the database server.
  5. If issue is transient, monitor for 10 minutes. If persistent, check recent migrations or schema changes.
  6. Escalate to database on-call if connection pooling or deadlock is suspected.

#### Alert: `LandingReviewCreateLatencyHigh`
- **Condition:** `histogram_quantile(0.99, rate(codeplane_landing_review_create_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for `createLandingRequestReview` queries.
  2. Verify no table locks or long-running transactions on `landing_request_reviews`.
  3. Check connection pool utilization.
  4. Review recent index changes or migrations affecting the reviews table.
  5. If correlated with high traffic, consider temporarily increasing connection pool size.

#### Alert: `LandingReviewSelfBlockRateSpike`
- **Condition:** `rate(codeplane_landing_review_self_blocked_total[15m]) > 1`
- **Severity:** Info
- **Runbook:**
  1. This may indicate a UX issue where users are confused about self-review restrictions.
  2. Check if a specific client version is sending self-review requests (check logs for `client` field).
  3. Verify that client-side disabling of the approve button for LR authors is functioning.
  4. If a single user is triggering repeatedly, it may be an API automation issue—no action needed.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Database write failure | `landing_review_create_failed` log, 500 response | Review not persisted | Retry from client; DB health check |
| Auth service unavailable | 401 on valid tokens | All reviews fail | Auth service health check; graceful degradation |
| Repository resolution failure | 404 on valid owner/repo | Reviews fail for specific repos | Repo service health check |
| Rate limit misconfiguration | Spike in 429 responses | Legitimate users blocked | Adjust rate limit thresholds |
| Body length validation bypass | Reviews with bodies > 50K stored | Storage bloat | Add DB-level CHECK constraint |
| Self-review bypass (client bug) | Self-approval reviews appearing in DB | Corrupted review integrity | Server-side enforcement is canonical; add DB trigger as safety net |

## Verification

### API Integration Tests

- [ ] **Approve with body:** POST approval review with `type: "approve"` and a body string. Assert 201, response contains `type: "approve"`, `state: "submitted"`, `body` matches input, `reviewer.login` matches authenticated user.
- [ ] **Approve without body:** POST approval review with `type: "approve"` and no `body` field. Assert 201, response `body` is empty string.
- [ ] **Approve with empty string body:** POST with `type: "approve"` and `body: ""`. Assert 201.
- [ ] **Approve with whitespace-only body:** POST with `type: "approve"` and `body: "   \n  "`. Assert 201, stored body is empty string after trim.
- [ ] **Approve with maximum body length (50,000 chars):** POST with a 50,000-character body. Assert 201.
- [ ] **Approve with body exceeding maximum (50,001 chars):** POST with a 50,001-character body. Assert 422 with body too_long error.
- [ ] **Approve with markdown body:** POST with body containing markdown headers, code blocks, links, and images. Assert 201, body stored verbatim.
- [ ] **Approve with unicode/emoji body:** POST with body `"LGTM 🚀✅"`. Assert 201, body preserved exactly.
- [ ] **Approve with special characters body:** POST with body containing `<script>`, backticks, quotes, angle brackets. Assert 201, body stored as-is (no sanitization at storage layer).
- [ ] **Case-insensitive type normalization:** POST with `type: "APPROVE"`. Assert 201, response `type` is `"approve"`.
- [ ] **Case-insensitive type normalization (mixed):** POST with `type: "Approve"`. Assert 201.
- [ ] **Self-approval blocked:** Authenticate as the LR author, POST approval. Assert 403 with self-review error message.
- [ ] **Unauthenticated request:** POST without auth header/cookie. Assert 401.
- [ ] **Read-only user blocked:** Authenticate as a read-only collaborator, POST approval. Assert 403.
- [ ] **Write collaborator succeeds:** Authenticate as write collaborator, POST approval. Assert 201.
- [ ] **Admin succeeds:** Authenticate as repo admin, POST approval. Assert 201.
- [ ] **Org owner succeeds:** Authenticate as org owner, POST approval. Assert 201.
- [ ] **Nonexistent landing request:** POST approval to `/landings/99999/reviews`. Assert 404.
- [ ] **Nonexistent repository:** POST approval to `/repos/fake/fake/landings/1/reviews`. Assert 404.
- [ ] **Closed landing request:** Close a landing request, then POST approval. Assert 422.
- [ ] **Merged landing request:** Merge/land a landing request, then POST approval. Assert 422.
- [ ] **Invalid type value:** POST with `type: "super_approve"`. Assert 422 with type invalid error.
- [ ] **Missing type field:** POST with `{}` (no type). Assert 422.
- [ ] **Null type field:** POST with `{ "type": null }`. Assert 422.
- [ ] **Multiple approvals from same reviewer:** Submit two approval reviews from the same user. Assert both return 201 and both are stored.
- [ ] **Approval count distinct:** After two approvals from the same reviewer, verify `countApprovedLandingRequestReviews` returns 1 (distinct reviewer count).
- [ ] **Approval count multiple reviewers:** Two different users approve. Verify count returns 2.
- [ ] **Dismissed approval not counted:** Submit approval, dismiss it, verify approval count decreases.
- [ ] **Response shape validation:** Verify response includes all required fields: `id` (number), `landing_request_id` (number), `reviewer.id` (number), `reviewer.login` (string), `type` (string), `body` (string), `state` (string), `created_at` (ISO string), `updated_at` (ISO string).
- [ ] **Timestamps are valid ISO strings:** Parse `created_at` and `updated_at` as dates, verify they are valid and within the last 60 seconds.
- [ ] **Review appears in list:** After creating approval, GET reviews list and verify the new review appears.
- [ ] **Rate limiting:** Submit reviews rapidly exceeding the per-minute limit. Assert 429 response with `Retry-After` header.
- [ ] **Extra fields ignored:** POST with `{ "type": "approve", "foo": "bar" }`. Assert 201 (extra field silently ignored).
- [ ] **Non-JSON content type:** POST with `Content-Type: text/plain`. Assert 400 or 415.

### CLI E2E Tests

- [ ] **CLI approve with --action flag:** Run `codeplane lr review <N> --action approve --body "LGTM"`. Assert exit code 0, JSON output contains `type: "approve"`.
- [ ] **CLI approve without body:** Run `codeplane lr review <N> --action approve`. Assert exit code 0.
- [ ] **CLI approve with --json output:** Verify JSON output matches `LandingReviewResponse` schema.
- [ ] **CLI approve text output:** Run without `--json`, verify human-readable success message `"✓ Approved landing request #N"`.
- [ ] **CLI approve on nonexistent LR:** Run `codeplane lr review 99999 --action approve`. Assert non-zero exit code and error message.
- [ ] **CLI approve with --repo flag:** Run with explicit `--repo owner/repo`. Assert correct repo resolution.
- [ ] **CLI approve without auth:** Run without prior `codeplane auth login`. Assert non-zero exit code with auth error message.
- [ ] **CLI approve self-review blocked:** Run as LR author. Assert non-zero exit code with self-review error.
- [ ] **CLI review list after approve:** Run `codeplane lr review list <N>`. Assert the approval appears in the list.
- [ ] **CLI approve then dismiss:** Approve, then run `codeplane lr review dismiss <N> --review-id <id>`. Assert exit code 0.

### Web UI E2E Tests (Playwright)

- [ ] **Review form renders on landing detail page:** Navigate to landing request detail. Assert review form is visible with Approve/Request Changes/Comment options.
- [ ] **Approve button clickable for write collaborator:** Log in as write collaborator, navigate to LR detail, select Approve, click Submit. Assert success notification and review appears in timeline.
- [ ] **Approve with body:** Select Approve, type comment in textarea, submit. Assert review in timeline shows approval badge and body text.
- [ ] **Approve without body:** Select Approve, leave body empty, submit. Assert success.
- [ ] **Approve option disabled for LR author:** Log in as LR author, navigate to own LR. Assert Approve option is disabled with tooltip explaining self-review restriction.
- [ ] **Approve option disabled for read-only user:** Log in as read-only collaborator. Assert Approve option is disabled with tooltip about write access.
- [ ] **Form disabled for closed LR:** Navigate to a closed landing request. Assert review form is disabled with explanatory message.
- [ ] **Form disabled for merged LR:** Navigate to a merged landing request. Assert review form is disabled.
- [ ] **Approval badge appears in timeline:** After approving, verify green ✓ badge, reviewer username, and timestamp appear in the reviews timeline.
- [ ] **Review summary updates:** After approving, verify the reviews tab header updates approval count (e.g., "3 reviews · 2 approved").
- [ ] **Keyboard shortcut Ctrl+Enter submits:** Focus review form, select Approve, press Ctrl+Enter. Assert review is submitted.
- [ ] **Escape closes form with dirty check:** Type content in body, press Escape. Assert confirmation dialog appears asking to discard changes.
- [ ] **Error state on network failure:** Simulate network error during submission. Assert error message appears with retry option.
- [ ] **Loading state during submission:** Click Submit. Assert button shows loading spinner and is disabled until response.

### TUI E2E Tests

- [ ] **Review form opens with `r` key:** Navigate to landing detail, press `r`. Assert review form renders with type selector and body textarea.
- [ ] **Quick-approve flow (3 keystrokes):** Press `r`, `1`, `Ctrl+S`. Assert approval is submitted and user returns to landing detail with success flash.
- [ ] **Approve with body:** Press `r`, `1`, type body text, `Ctrl+S`. Assert approval with body is submitted.
- [ ] **Approve type disabled for author:** Navigate to own LR, press `r`. Assert Approve option shows "(cannot review own landing)" and is not selectable.
- [ ] **Cancel with Escape:** Open review form, press Escape. Assert form closes (with dirty-check if content was entered).
- [ ] **Error display on failure:** Simulate 404 error. Assert inline error message with `R` to retry.
- [ ] **Responsive layout at 80×24:** Resize terminal to 80×24, open review form. Assert compact layout with horizontal type selector.
- [ ] **Responsive layout at 120×40:** Resize to 120×40. Assert standard layout with vertical type list.

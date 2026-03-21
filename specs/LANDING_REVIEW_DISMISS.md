# LANDING_REVIEW_DISMISS

Specification for LANDING_REVIEW_DISMISS.

## High-Level User POV

When a collaborator is reviewing a landing request in Codeplane, reviews accumulate over time as reviewers approve, request changes, or leave comments. Circumstances change: a reviewer may leave the team, a review may have been submitted against an older version of the change stack, or a reviewer may have based their feedback on a misunderstanding that has since been clarified. In these situations, a user with sufficient authority needs a way to dismiss a review — removing its formal weight from the landing request's review summary without deleting its history.

Dismissing a review is the act of marking an existing review as no longer counting toward the landing request's approval or blocking status. A dismissed approval no longer contributes to the approval count for protected-bookmark rules. A dismissed "request changes" review no longer blocks landing. The dismissed review remains visible in the timeline for audit and transparency purposes, but it is visually marked as dismissed so that participants understand it no longer carries decision weight.

The dismiss action is available from every Codeplane client surface. On the web, it appears as a dismiss button or menu action on individual review entries in the landing request detail page. In the CLI, it is a subcommand of `lr review dismiss`. In the TUI, it is triggered by pressing `d` on a focused review in the reviews tab. All surfaces converge on the same API endpoint and enforce the same rules: the actor must be authenticated, must have write access to the repository, and cannot dismiss their own review.

Dismissing a review is a lightweight, reversible-in-spirit action: while there is no "un-dismiss" in the current model, the reviewer can submit a new review at any time, which will count as a fresh signal. This design keeps the review history intact, supports compliance and auditability, and gives teams the flexibility to manage stale or inappropriate reviews without losing context.

The dismiss flow optionally accepts a message explaining why the review was dismissed, supporting team transparency. Whether triggered manually by a collaborator, or automatically by a bookmark protection rule that dismisses stale reviews on push, the result is the same: the review transitions from `submitted` to `dismissed` and the landing request's review summary recalculates.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access to a repository can dismiss any submitted review on any landing request in that repository, provided they are not dismissing their own review.
- [ ] The dismissed review transitions from `state: "submitted"` to `state: "dismissed"` and its `updated_at` timestamp is refreshed.
- [ ] The dismissed review remains visible in the review list and timeline but is clearly marked as dismissed in all client surfaces.
- [ ] Dismissed approvals no longer count toward protected-bookmark required approval thresholds.
- [ ] Dismissed "request changes" reviews no longer block landing.
- [ ] The dismiss action is available from web UI, CLI, and TUI surfaces with consistent behavior.
- [ ] A notification is delivered to the original reviewer when their review is dismissed.
- [ ] All edge cases, validation rules, and error states are handled predictably across every client.

### Functional Constraints

- [ ] The endpoint accepts an optional `message` field explaining the dismissal reason. The message may be empty, omitted, or null.
- [ ] When a `message` is provided, it must not exceed 10,000 characters.
- [ ] The `message` field must be trimmed of leading/trailing whitespace before storage but may contain internal whitespace, newlines, markdown, and unicode characters.
- [ ] The `message` field may contain special characters including backticks, angle brackets, quotes, and emoji.
- [ ] The actor must be authenticated. Unauthenticated requests return HTTP 401.
- [ ] The actor must have write access to the repository. Users with read-only access receive HTTP 403.
- [ ] The actor must not be the author of the review being dismissed. Self-dismissal attempts return HTTP 403 with a clear error message.
- [ ] The landing request must exist. A request against a nonexistent landing request number returns HTTP 404.
- [ ] The review must exist and must belong to the specified landing request. If the review ID does not exist or belongs to a different landing request, the response is HTTP 404.
- [ ] The review ID must be a positive integer. Non-integer, zero, or negative values return HTTP 400.
- [ ] Dismissing an already-dismissed review is idempotent: the request succeeds with HTTP 200, the state remains `dismissed`, and `updated_at` is refreshed.
- [ ] The response includes the full updated review record: `id`, `landing_request_id`, `reviewer_id`, `type`, `body`, `state`, `created_at`, and `updated_at`.
- [ ] The original review `type` (`approve`, `comment`, `request_changes`, `pending`) is preserved — only `state` changes.
- [ ] The original review `body` is preserved unchanged.
- [ ] Dismissing a review does not delete any attached review comments (inline diff comments). Those comments remain visible but are associated with a dismissed review.
- [ ] After dismissal, the landing request's review summary recalculates: approval counts, "changes requested" counts, and review badges update across all connected clients.
- [ ] Empty JSON payloads `{}` are accepted (message defaults to empty string).
- [ ] Payloads with extra/unknown fields are silently ignored.
- [ ] Non-JSON or missing `Content-Type` bodies are accepted gracefully (body is optional).

### Boundary Constraints

- [ ] `message` max length: 10,000 characters. A message of exactly 10,000 characters succeeds. A message of 10,001 characters returns HTTP 422.
- [ ] `message` min length: 0 characters (empty string or omitted).
- [ ] `review_id` must be a positive integer (> 0). Zero returns HTTP 400. Negative values return HTTP 400. Non-numeric values return HTTP 400.
- [ ] Landing request `number` must be a positive integer. Non-integer values return HTTP 400 or 404.
- [ ] Repository `owner` and `repo` path parameters must resolve to an existing repository. Invalid owner/repo combinations return HTTP 404.
- [ ] Maximum review_id value: the system's max safe integer. Values beyond this return HTTP 400.

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/landings/:number/reviews/:review_id`

**Request:**
```
Authorization: Bearer <PAT> | Cookie session
Content-Type: application/json  (optional — body is optional)

{
  "message": "Review is stale after rebase"  // optional
}
```

**Success Response (200 OK):**
```json
{
  "id": 42,
  "landing_request_id": 7,
  "reviewer_id": 15,
  "type": "approve",
  "body": "LGTM, ship it!",
  "state": "dismissed",
  "created_at": "2026-03-20T14:30:00.000Z",
  "updated_at": "2026-03-22T10:15:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid review_id (non-integer, zero, negative) | `{ "message": "invalid review_id" }` |
| 400 | review_id missing | `{ "message": "review_id is required" }` |
| 401 | Unauthenticated | `{ "message": "authentication required" }` |
| 403 | No write access | `{ "message": "write access required" }` |
| 403 | Self-dismissal | `{ "message": "cannot dismiss your own review" }` |
| 404 | Repo not found | `{ "message": "repository not found" }` |
| 404 | Landing request not found | `{ "message": "landing request not found" }` |
| 404 | Review not found or wrong landing | `{ "message": "review not found" }` |
| 422 | Message too long | `{ "message": "Validation Failed", "errors": [{ "resource": "LandingReview", "field": "message", "code": "too_long" }] }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The `@codeplane/sdk` landing service exposes:

```typescript
dismissLandingReview(
  actor: User,
  owner: string,
  repo: string,
  number: number,
  reviewID: number,
  req: { message?: string }
): Promise<Result<LandingRequestReview, APIError>>
```

The method validates the actor has write access, verifies the review exists and belongs to the specified landing request, enforces the self-dismissal restriction, transitions the review state to `"dismissed"`, and returns the updated review record.

### Web UI Design

**Location:** Reviews timeline on the landing request detail page (`/:owner/:repo/landings/:number`).

**Dismiss Action on Each Review:**
- Each review entry in the reviews timeline includes a kebab menu (⋮) or a "Dismiss" text button visible to users with write access.
- Clicking "Dismiss" opens a confirmation dialog:
  - Title: "Dismiss review by @username?"
  - Description: "This review will no longer count toward approval requirements. It will remain visible as dismissed."
  - An optional textarea labeled "Reason (optional)" for the dismissal message.
  - Two buttons: "Dismiss review" (primary, red accent) and "Cancel" (secondary).
- On confirmation, the review entry transitions immediately (optimistic) to a dismissed visual state:
  - The review type badge becomes muted/gray.
  - The review body text is rendered in muted color.
  - A "Dismissed" label appears next to the reviewer's name.
  - If a dismissal message was provided, it appears below the review as "Dismissed by @actor: message".
- On error, the optimistic update reverts and a toast notification shows the error message.

**Disabled States:**
- The dismiss action is hidden for users without write access.
- The dismiss action is hidden for the reviewer's own reviews.
- Already-dismissed reviews do not show the dismiss action (idempotent from UI perspective).
- On closed or merged landing requests, dismiss remains available (reviews can still be dismissed for bookkeeping).

**Review Summary Update:**
- After dismissal, the summary line "N reviews · M approved · P changes requested" updates to reflect only submitted reviews.
- The tab badge "Reviews (N)" recounts submitted reviews only.

**Keyboard Shortcuts:**
- No specific keyboard shortcut in web (action is via click on the review entry).
- `Escape` closes the confirmation dialog.
- `Enter` on the dialog confirms the dismiss action.

### CLI Command

**Usage:**
```bash
codeplane lr review dismiss <number> --review-id <id> [--message "Reason"] [--repo OWNER/REPO] [--json]
```

**Aliases:**
```bash
codeplane land review dismiss <number> --review-id <id>
```

**Options:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `<number>` | positional integer | yes | — | Landing request number |
| `--review-id` | integer | yes | — | ID of the review to dismiss |
| `--message` | string | no | `""` | Optional dismissal reason |
| `--repo` | string | no | auto-detect | Repository in `OWNER/REPO` format |
| `--json` | boolean | no | `false` | Output raw JSON response |

**Output (default text mode):**
```
✓ Dismissed review #42 on landing request #7 in owner/repo
```

**Output (--json mode):**
The full `LandingRequestReview` JSON object with `state: "dismissed"`.

**Error Output:**
```
Error: review not found
Error: cannot dismiss your own review
Error: write access required
Error: authentication required — run `codeplane auth login`
```

### TUI UI

**Access:** Press `d` while a review is focused in the reviews tab of the landing detail screen.

**Dismiss Confirmation Dialog:**
- Centered modal overlay:
  - "Dismiss review by @username?"
  - "This review will no longer count toward approval requirements."
  - `Enter` confirms, `Esc` cancels.
  - Focus trapped within dialog.
- On confirmation:
  - Optimistic: review state transitions to `"dismissed"` immediately (strikethrough, muted color, dimmed icon).
  - Success: status bar flash "✓ Review dismissed".
  - Failure: optimistic reverts, status bar shows error message (e.g., "Permission denied", "Review not found").

**Disabled States:**
- `d` is a no-op if the focused review is already dismissed. Status bar flash: "Review already dismissed."
- `d` is a no-op if the user authored the focused review. Status bar flash: "Cannot dismiss your own review."
- `d` keybinding hint is hidden from the status bar for read-only users.

### Documentation

The following end-user documentation should be written:

- **"Dismissing Reviews"** section within the "Reviewing Landing Requests" guide, covering when and why to dismiss a review, how to do it from web, CLI, and TUI, and what happens to the dismissed review.
- **CLI reference page** for `codeplane lr review dismiss` documenting all flags, examples, and error messages.
- **Protected bookmarks guide** updated to explain how dismissed reviews interact with required approval counts and how `dismiss_stale_reviews` bookmark protection rule auto-dismisses approvals on push.
- **Keyboard shortcuts reference** updated to include the `d` dismiss keybinding in TUI.

## Permissions & Security

### Authorization Roles

| Role | Can Dismiss |
|------|-------------|
| Anonymous | ✗ (401) |
| Authenticated, no repo access | ✗ (404) |
| Read-only collaborator | ✗ (403) |
| Write collaborator | ✓ (except own reviews) |
| Repository admin | ✓ (except own reviews) |
| Organization owner | ✓ (except own reviews) |
| Review author (with write access) | ✗ (403, self-dismissal) |

### Self-Dismissal Restriction

- A user must not be permitted to dismiss their own review. This prevents reviewers from silently removing their own blocking "request changes" reviews without submitting a new review.
- This restriction must be enforced server-side in the service layer, not only in client UI.
- The server checks `review.reviewer_id === actor.id` and returns 403 if they match.

### Rate Limiting

- Review dismissal: maximum 60 dismiss actions per user per hour per repository.
- Review dismissal: maximum 10 dismiss actions per user per minute per repository (burst protection).
- Rate limit responses include a `Retry-After` header with seconds until the limit resets.

### Data Privacy

- Dismissal messages may contain freeform text. No PII scrubbing is applied, but dismiss messages are only visible to users with at least read access to the repository.
- The identity of the actor who dismissed the review (user ID and login) should be tracked for audit purposes.
- Reviewer identity (user ID and login) is included in every review response. This is expected behavior for a collaboration tool.
- Private repository reviews and dismissal actions are not accessible to users without repository access.
- Dismissal messages should not be logged at INFO level to avoid leaking user content into log aggregation systems; structured context should include message length but not message content.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing_review.dismissed` | Review successfully dismissed | `review_id`, `landing_request_id`, `repo_id`, `reviewer_id`, `dismissed_by` (actor user ID), `review_type` (original type), `had_message` (boolean), `message_length` (int), `was_approval` (boolean), `approval_count_after` (int, distinct submitted approvals remaining), `client` ("web"\|"cli"\|"tui"\|"api") |
| `landing_review.dismiss_blocked_self` | Self-dismissal attempt rejected | `review_id`, `landing_request_id`, `repo_id`, `actor_id`, `client` |
| `landing_review.dismiss_blocked_permission` | Dismiss attempt by read-only user | `landing_request_id`, `repo_id`, `actor_id`, `client` |
| `landing_review.dismiss_not_found` | Dismiss attempt on nonexistent review | `landing_request_id`, `repo_id`, `actor_id`, `review_id_attempted`, `client` |
| `landing_review.dismiss_already_dismissed` | Dismiss attempt on already-dismissed review (idempotent success) | `review_id`, `landing_request_id`, `repo_id`, `actor_id`, `client` |
| `landing_review.dismiss_dialog_opened` | Dismiss confirmation dialog opened (web/TUI) | `review_id`, `landing_request_id`, `repo_id`, `client` |
| `landing_review.dismiss_dialog_cancelled` | Dismiss confirmation dialog cancelled | `review_id`, `landing_request_id`, `repo_id`, `client` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|------------|-------------------|
| Dismiss rate | % of submitted reviews that are eventually dismissed | 5–15% (healthy code review churn) |
| Dismiss dialog completion rate | % of opened dismiss dialogs that result in confirmation | > 70% |
| Dismiss → re-review rate | % of dismissed reviews followed by a new review from same reviewer within 24h | > 30% (indicates dismiss is used for re-review flow) |
| Auto-dismiss rate | % of dismissals triggered by stale review protection vs manual | Tracked for product insight |
| Time from dismiss to new approval | Median time from dismissal of a blocking review to new approval | Decreasing over time |
| Approval count recovery | % of landing requests that regain required approvals within 4h of a dismiss | > 80% |

## Observability

### Logging

| Event | Log Level | Structured Context |
|-------|-----------|-------------------|
| Review dismissed successfully | `info` | `{ event: "landing_review_dismissed", review_id, landing_request_id, repo_id, reviewer_id, dismissed_by, review_type, was_approval }` |
| Self-dismissal blocked | `warn` | `{ event: "landing_review_dismiss_self_blocked", review_id, landing_request_id, repo_id, actor_id }` |
| Permission denied for dismiss | `warn` | `{ event: "landing_review_dismiss_forbidden", landing_request_id, repo_id, actor_id }` |
| Review not found for dismiss | `warn` | `{ event: "landing_review_dismiss_not_found", landing_request_id, repo_id, actor_id, review_id_attempted }` |
| Review belongs to different landing | `warn` | `{ event: "landing_review_dismiss_wrong_landing", review_id, landing_request_id, repo_id, actor_id, actual_landing_request_id }` |
| Dismiss message too long | `warn` | `{ event: "landing_review_dismiss_message_too_long", landing_request_id, repo_id, actor_id, message_length }` |
| Dismiss DB write failure | `error` | `{ event: "landing_review_dismiss_failed", review_id, landing_request_id, repo_id, actor_id, error }` |
| Unauthenticated dismiss attempt | `warn` | `{ event: "landing_review_dismiss_unauthorized", landing_request_id, repo_id }` |
| Invalid review_id parameter | `warn` | `{ event: "landing_review_dismiss_invalid_id", landing_request_id, repo_id, actor_id, review_id_raw }` |
| Dismiss of already-dismissed review (idempotent) | `debug` | `{ event: "landing_review_dismiss_idempotent", review_id, landing_request_id, repo_id, actor_id }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_review_dismissed_total` | counter | `review_type`, `repo_id` | Total reviews dismissed, partitioned by original review type |
| `codeplane_landing_review_dismiss_duration_seconds` | histogram | `status` (`success`, `error`) | Latency of dismiss endpoint |
| `codeplane_landing_review_dismiss_errors_total` | counter | `error_type` (`validation`, `auth`, `forbidden`, `not_found`, `self_dismiss`, `internal`) | Dismiss errors by category |
| `codeplane_landing_review_dismiss_self_blocked_total` | counter | `repo_id` | Self-dismissal attempts blocked |
| `codeplane_landing_review_dismiss_idempotent_total` | counter | `repo_id` | Dismiss calls on already-dismissed reviews |
| `codeplane_landing_review_dismiss_message_length_bytes` | histogram | — | Distribution of dismissal message sizes |

### Alerts

#### Alert: `LandingReviewDismissErrorRateHigh`
- **Condition:** `rate(codeplane_landing_review_dismiss_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "landing_review_dismiss_failed"` entries.
  2. Verify database connectivity: run `SELECT 1` against the primary database.
  3. Check if `landing_request_reviews` table is accessible and not locked.
  4. Look for disk space issues on the database server.
  5. Check if a migration or schema change has affected the `state` column or the `updateLandingRequestReviewState` query.
  6. If issue is transient, monitor for 10 minutes. If persistent, check connection pooling.
  7. Escalate to database on-call if deadlock is suspected.

#### Alert: `LandingReviewDismissLatencyHigh`
- **Condition:** `histogram_quantile(0.99, rate(codeplane_landing_review_dismiss_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for `updateLandingRequestReviewState` and `getLandingRequestReviewByID` queries.
  2. Verify no table locks or long-running transactions on `landing_request_reviews`.
  3. Check connection pool utilization.
  4. Review if concurrent high traffic (e.g., bulk auto-dismiss on push) is causing contention.
  5. If correlated with a deploy, check for missing indexes or query plan changes.
  6. Temporarily increase connection pool size if pool exhaustion is confirmed.

#### Alert: `LandingReviewDismissSelfBlockSpike`
- **Condition:** `rate(codeplane_landing_review_dismiss_self_blocked_total[15m]) > 2`
- **Severity:** Info
- **Runbook:**
  1. This may indicate a UX issue where users are confused about self-dismissal restrictions.
  2. Check if a specific client version is sending self-dismiss requests (check logs for client field).
  3. Verify that client-side hiding of the dismiss button for own reviews is functioning correctly.
  4. If a single user or automation is triggering repeatedly, it may be an API integration issue — no action needed.

#### Alert: `LandingReviewDismissIdempotentSpike`
- **Condition:** `rate(codeplane_landing_review_dismiss_idempotent_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. High idempotent dismiss calls may indicate a client retry loop or stale UI state.
  2. Check if a specific client or automation is retrying dismiss calls for already-dismissed reviews.
  3. Verify that the client receives and processes the 200 response correctly.
  4. No corrective action needed if idempotent behavior is working as designed.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Database write failure on state update | `landing_review_dismiss_failed` log, 500 response | Review not dismissed | Retry from client; DB health check |
| Race condition: review deleted between fetch and update | `updateLandingRequestReviewState` returns null | 404 returned | Client retries; review was already gone |
| Auth service unavailable | 401 on valid tokens | All dismiss actions fail | Auth service health check |
| Repository resolution failure | 404 on valid owner/repo | Dismiss fails for specific repos | Repo service health check |
| Rate limit misconfiguration | Spike in 429 responses | Legitimate users blocked | Adjust rate limit thresholds |
| Self-dismiss bypass (client bug) | Self-dismissals appearing in audit log | Review integrity issue | Server-side enforcement is canonical |
| Dismiss message exceeds DB column limit | Truncation or write failure | Dismiss either fails or loses data | Validate length before write |
| Notification fanout failure | Reviewer not notified of dismissal | Silent — not critical path | Async retry queue for notifications |
| Concurrent dismiss of same review | Both succeed idempotently | No data corruption — last writer updates `updated_at` | By design |

## Verification

### API Integration Tests

- [ ] **Dismiss a submitted approval review:** PATCH dismiss endpoint for a `type: "approve"`, `state: "submitted"` review. Assert 200, response `state` is `"dismissed"`, `type` is still `"approve"`, `updated_at` is refreshed.
- [ ] **Dismiss a submitted request_changes review:** PATCH dismiss for a `type: "request_changes"` review. Assert 200, `state: "dismissed"`, `type` unchanged.
- [ ] **Dismiss a submitted comment review:** PATCH dismiss for a `type: "comment"` review. Assert 200.
- [ ] **Dismiss a submitted pending review:** PATCH dismiss for a `type: "pending"` review. Assert 200.
- [ ] **Dismiss with message:** PATCH with `{ "message": "Stale after rebase" }`. Assert 200.
- [ ] **Dismiss with empty message:** PATCH with `{ "message": "" }`. Assert 200.
- [ ] **Dismiss with no body:** PATCH with empty body (no JSON). Assert 200.
- [ ] **Dismiss with empty JSON body:** PATCH with `{}`. Assert 200.
- [ ] **Dismiss with message at max length (10,000 chars):** PATCH with a 10,000-character message. Assert 200.
- [ ] **Dismiss with message exceeding max length (10,001 chars):** PATCH with a 10,001-character message. Assert 422 with message too_long error.
- [ ] **Dismiss with unicode/emoji message:** PATCH with `{ "message": "Stale review 🔄" }`. Assert 200.
- [ ] **Dismiss with special characters in message:** PATCH with message containing `<script>`, backticks, quotes, angle brackets. Assert 200.
- [ ] **Dismiss with extra fields:** PATCH with `{ "message": "reason", "foo": "bar" }`. Assert 200 (extra field ignored).
- [ ] **Idempotent dismiss (already dismissed):** Dismiss a review, then PATCH dismiss again. Assert 200, `state: "dismissed"`, `updated_at` refreshed to a newer timestamp.
- [ ] **Self-dismissal blocked:** Authenticate as the review author, PATCH dismiss on own review. Assert 403 with self-dismissal error message.
- [ ] **Unauthenticated request:** PATCH without auth header/cookie. Assert 401.
- [ ] **Read-only user blocked:** Authenticate as a read-only collaborator, PATCH dismiss. Assert 403.
- [ ] **Write collaborator succeeds:** Authenticate as write collaborator (not the reviewer), PATCH dismiss. Assert 200.
- [ ] **Admin succeeds:** Authenticate as repo admin, PATCH dismiss. Assert 200.
- [ ] **Org owner succeeds:** Authenticate as org owner, PATCH dismiss. Assert 200.
- [ ] **Nonexistent review_id:** PATCH dismiss with review_id 99999. Assert 404.
- [ ] **Review belongs to different landing request:** Create two landing requests, each with reviews. PATCH dismiss on LR #1 with a review_id from LR #2. Assert 404.
- [ ] **Nonexistent landing request:** PATCH dismiss to `/landings/99999/reviews/1`. Assert 404.
- [ ] **Nonexistent repository:** PATCH dismiss to `/repos/fake/fake/landings/1/reviews/1`. Assert 404.
- [ ] **Invalid review_id (zero):** PATCH with review_id `0`. Assert 400.
- [ ] **Invalid review_id (negative):** PATCH with review_id `-1`. Assert 400.
- [ ] **Invalid review_id (non-numeric):** PATCH with review_id `abc`. Assert 400.
- [ ] **Invalid review_id (float):** PATCH with review_id `1.5`. Assert 400.
- [ ] **Invalid review_id (empty):** PATCH with empty review_id in path. Assert 400 or 404.
- [ ] **Approval count decreases after dismiss:** Create two approval reviews from different users. Dismiss one. Verify approval count is 1 (not 2).
- [ ] **Request changes no longer blocks after dismiss:** Create a request_changes review. Dismiss it. Verify the review no longer appears as blocking in landing readiness checks.
- [ ] **Review still appears in list after dismiss:** Dismiss a review, then GET reviews list. Verify the review appears with `state: "dismissed"`.
- [ ] **Original type preserved after dismiss:** Dismiss an approval review. GET the review. Verify `type` is still `"approve"`.
- [ ] **Original body preserved after dismiss:** Dismiss a review that had a body. GET the review. Verify `body` is unchanged.
- [ ] **updated_at is refreshed:** Note the review's `updated_at` before dismiss. Dismiss. Verify `updated_at` is newer.
- [ ] **created_at is unchanged:** Note the review's `created_at` before dismiss. Dismiss. Verify `created_at` is identical.
- [ ] **Response shape validation:** Verify response includes all required fields: `id` (number), `landing_request_id` (number), `reviewer_id` (number), `type` (string), `body` (string), `state` (string, value "dismissed"), `created_at` (ISO string), `updated_at` (ISO string).
- [ ] **Concurrent dismiss of same review:** Two requests dismiss the same review simultaneously. Both should succeed with 200.
- [ ] **Dismiss then submit new review:** Dismiss an approval. Submit a new approval from a different user. Verify approval count is 1.
- [ ] **Rate limiting:** Submit dismiss requests rapidly exceeding the per-minute limit. Assert 429 response with `Retry-After` header.

### CLI E2E Tests

- [ ] **CLI dismiss with review-id and message:** Run `codeplane lr review dismiss <N> --review-id <id> --message "Stale review"`. Assert exit code 0.
- [ ] **CLI dismiss without message:** Run `codeplane lr review dismiss <N> --review-id <id>`. Assert exit code 0.
- [ ] **CLI dismiss with --json output:** Run with `--json`. Verify JSON output contains `state: "dismissed"` and matches response schema.
- [ ] **CLI dismiss text output:** Run without `--json`. Verify human-readable success message `"✓ Dismissed review #<id> on landing request #N"`.
- [ ] **CLI dismiss with --repo flag:** Run with explicit `--repo owner/repo`. Assert correct repo resolution.
- [ ] **CLI dismiss nonexistent review:** Run with `--review-id 99999`. Assert non-zero exit code and "review not found" error.
- [ ] **CLI dismiss nonexistent landing request:** Run with landing number 99999. Assert non-zero exit code and error.
- [ ] **CLI dismiss without auth:** Run without prior `codeplane auth login`. Assert non-zero exit code with auth error.
- [ ] **CLI dismiss self-review blocked:** Authenticate as the review author, run dismiss on own review. Assert non-zero exit code with self-dismissal error.
- [ ] **CLI dismiss missing --review-id flag:** Run `codeplane lr review dismiss <N>` without `--review-id`. Assert non-zero exit code with usage error.
- [ ] **CLI dismiss then list:** Dismiss a review, then run `codeplane lr review list <N> --json`. Assert the dismissed review appears in the list with `state: "dismissed"`.
- [ ] **CLI full review lifecycle:** Submit approval, list reviews (verify submitted), dismiss, list reviews (verify dismissed), submit new review (verify new review is submitted).

### Web UI E2E Tests (Playwright)

- [ ] **Dismiss button visible for write collaborator:** Log in as write collaborator, navigate to LR detail with reviews. Assert dismiss action is visible on review entries authored by other users.
- [ ] **Dismiss button hidden for own reviews:** Log in as a user who has submitted a review. Assert dismiss action is not visible on their own review entry.
- [ ] **Dismiss button hidden for read-only user:** Log in as read-only collaborator. Assert dismiss action is not present on any review.
- [ ] **Dismiss confirmation dialog opens:** Click dismiss on a review. Assert confirmation dialog appears with reviewer's username.
- [ ] **Dismiss confirmation dialog has message textarea:** Assert the dialog includes an optional message textarea.
- [ ] **Cancel dismiss dialog:** Click dismiss, then click Cancel. Assert review remains in submitted state.
- [ ] **Escape closes dismiss dialog:** Click dismiss, press Escape. Assert dialog closes.
- [ ] **Confirm dismiss:** Click dismiss, click "Dismiss review". Assert review visually transitions to dismissed state (muted color, "Dismissed" label).
- [ ] **Dismiss with message:** Click dismiss, type a reason in the textarea, confirm. Assert success.
- [ ] **Review summary updates after dismiss:** Dismiss an approval. Assert the summary line (e.g., "3 reviews · 1 approved") updates to reflect one fewer approval.
- [ ] **Tab badge updates after dismiss:** Dismiss a review. Assert the Reviews tab badge count decreases.
- [ ] **Dismissed review styling:** Assert dismissed review shows muted color and "Dismissed" label.
- [ ] **Dismiss button hidden on already-dismissed review:** Dismiss a review. Assert the dismiss action is no longer available on that review.
- [ ] **Error state on network failure:** Simulate network error during dismiss. Assert error toast appears and review reverts to submitted state.
- [ ] **Loading state during dismiss:** Click "Dismiss review". Assert button shows loading state until response.
- [ ] **Dismiss on landing request with protected bookmark:** Dismiss an approval on an LR targeting a protected bookmark. Assert required approval count comparison updates.

### TUI E2E Tests

- [ ] **Dismiss with `d` key:** Navigate to reviews tab, focus a review, press `d`. Assert confirmation dialog appears.
- [ ] **Dismiss confirmation dialog layout:** Assert dialog shows "Dismiss review by @username?" with Enter/Esc options.
- [ ] **Confirm dismiss with Enter:** Press `d`, then `Enter`. Assert review transitions to dismissed styling (strikethrough, muted) and status bar flash "✓ Review dismissed".
- [ ] **Cancel dismiss with Escape:** Press `d`, then `Esc`. Assert dialog closes, review remains submitted.
- [ ] **Dismiss already-dismissed review:** Focus a dismissed review, press `d`. Assert status bar flash "Review already dismissed" and no dialog opens.
- [ ] **Dismiss own review blocked:** Focus own review, press `d`. Assert status bar flash "Cannot dismiss your own review" and no dialog opens.
- [ ] **Dismiss keybinding hidden for read-only users:** Log in as read-only. Assert `d` is not shown in status bar hints.
- [ ] **Optimistic dismiss reverts on 403:** Simulate 403 error. Assert review reverts to submitted state, status bar shows "Permission denied".
- [ ] **Optimistic dismiss reverts on 404:** Simulate 404 error. Assert review reverts, status bar shows "Review not found".
- [ ] **Optimistic dismiss reverts on 500:** Simulate server error. Assert review reverts, status bar shows generic error.
- [ ] **Summary bar updates after dismiss:** Dismiss an approval. Assert summary bar recalculates ("N reviews · M-1 approved · P changes requested").
- [ ] **Rapid `d` presses:** Press `d` twice rapidly on same review. Assert dialog prevents double-action (second `d` is no-op while dialog is open).
- [ ] **Dismiss at 80×24 terminal size:** Assert dismiss dialog renders correctly at minimum terminal size.
- [ ] **Dismiss at 200×60 terminal size:** Assert dismiss dialog renders correctly at large terminal size.

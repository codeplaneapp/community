# LANDING_REVIEW_FORM_UI

Specification for LANDING_REVIEW_FORM_UI.

## High-Level User POV

When a developer opens a landing request in Codeplane's web application, they need a way to formally express their judgment about the proposed changes. The landing review form is the unified interface for this action — it lets the reviewer choose one of three review verdicts (Approve, Request Changes, or Comment), optionally write a review body explaining their reasoning, and submit the review in a single interaction.

The review form lives on the landing request detail page, positioned below the diff viewer or at the bottom of the reviews timeline within the Reviews tab. It is always visible to users who have the ability to review, so there is no hidden "start review" step — the form is ready to use the moment the reviewer has read through the changes. This design reflects the principle that reviewing should be as frictionless as possible: read the diff, form an opinion, submit.

The three review types carry distinct meaning and weight. An **Approve** (green ✓) signals that the reviewer considers the changes ready to land. Approvals count toward protected-bookmark rules that may require a minimum number of approvals before a landing request can be merged. **Request Changes** (red ✗) is a blocking signal — it indicates the reviewer has identified issues that must be addressed before the changes should land. When a Request Changes review exists on a landing request targeting a protected bookmark, the landing request cannot be merged until the objection is resolved. **Comment** (blue 💬) is a non-binding review type for general feedback, questions, or observations.

The form enforces contextual rules that prevent misuse. The landing request author cannot approve or request changes on their own work — those options are visually disabled with a tooltip explaining the restriction. Users with read-only access can only submit Comment reviews. When the landing request is not in an open or draft state, the entire form is disabled with an explanatory message.

For Request Changes reviews, the body is mandatory — the reviewer must articulate what needs to change. For Approve and Comment reviews, the body is optional but encouraged. The body field supports full markdown: reviewers can include code snippets, checklists, links, and structured formatting.

After submitting, the new review immediately appears in the reviews timeline with the appropriate type badge, the reviewer's identity, and the rendered body. The review summary line updates to reflect the new count. The form supports keyboard-driven workflows with Ctrl+Enter/Cmd+Enter to submit and Escape to close with a confirmation prompt if content has been entered.

## Acceptance Criteria

### Definition of Done

- [ ] A review submission form renders on the landing request detail page within the Reviews tab for all authenticated users with at least read access to the repository.
- [ ] The form includes a review type selector with three mutually exclusive options: Approve (green ✓), Request Changes (red ✗), and Comment (blue 💬).
- [ ] The form includes a multi-line textarea for the review body with a markdown preview toggle.
- [ ] The form includes a submit button whose label reflects the selected review type.
- [ ] Successful submission creates a review via `POST /api/repos/:owner/:repo/landings/:number/reviews` and the new review appears in the reviews timeline without a full page reload.
- [ ] The review summary line in the Reviews tab header updates after submission to reflect the new approval/changes-requested count.
- [ ] The form resets to its default state (Comment type selected, empty body) after successful submission.
- [ ] All edge cases, validation rules, and error states are handled predictably.

### Functional Constraints

- [ ] The review type selector defaults to "Comment" to prevent accidental approvals or change requests.
- [ ] Only one review type can be selected at a time.
- [ ] The `type` field maps to `"approve"`, `"request_changes"`, or `"comment"`. The `"pending"` type is not exposed in the UI.
- [ ] The `body` field is optional for Approve and Comment types.
- [ ] The `body` field is required for Request Changes type. The submit button is disabled when Request Changes is selected and the body is empty or whitespace-only.
- [ ] When Request Changes is selected and body is empty, validation message appears: "A comment is required when requesting changes."
- [ ] `body` max length: 50,000 chars for Approve, 65,535 chars for Request Changes, 65,535 chars for Comment.
- [ ] A body at exactly the maximum character limit for the selected type submits successfully.
- [ ] A body exceeding the maximum returns a 422 error displayed inline without closing the form.
- [ ] Body is trimmed of leading/trailing whitespace before submission.
- [ ] Body may contain markdown, unicode, emoji, special characters, newlines, and code blocks.
- [ ] Reviewer must be authenticated. Session expiry on submit shows clear error with re-auth prompt.
- [ ] Write access required for Approve/Request Changes. Read-only users may only submit Comment.
- [ ] LR author: Approve and Request Changes disabled with tooltip; Comment remains available.
- [ ] Read-only user: Approve and Request Changes disabled with "Write access required" tooltip.
- [ ] Closed/merged LR: entire form disabled with explanatory message.
- [ ] Draft LRs can receive reviews.
- [ ] Self-review restriction enforced server-side (403). If client-side check bypassed, server error displayed inline.
- [ ] Multiple reviews from same reviewer allowed.
- [ ] For protected-bookmark counting, only distinct reviewer_ids with type=approve and state=submitted count.

### Boundary Constraints

- [ ] `body` max for Approve: 50,000 chars. 50,000 succeeds; 50,001 returns 422.
- [ ] `body` max for Request Changes: 65,535 chars. 65,535 succeeds; 65,536 returns 422.
- [ ] `body` max for Comment: 65,535 chars. 65,535 succeeds; 65,536 returns 422.
- [ ] `body` min: 0 for Approve/Comment; 1 (after trim) for Request Changes.
- [ ] Character counter shown when body length > 80% of max for selected type.
- [ ] Double-click on submit prevented — button disabled immediately on first click.
- [ ] Form state (selected type, body) preserved across tab switches within landing detail page.
- [ ] Unicode content preserved exactly in round-trip.
- [ ] Whitespace-only body for Request Changes blocked by client-side validation before API call.

## Design

### Web UI Design

#### Location

The review form renders within the Reviews tab of the landing request detail page at route `/:owner/:repo/landings/:number`. Positioned below the reviews timeline as a sticky/collapsible panel.

#### Review Form Layout

The form has three sections arranged vertically:

1. **Body textarea** with Write/Preview tabs above it. Minimum 120px height, expanding to 300px. Placeholder changes by type: Approve → "Leave a comment (optional)", Request Changes → "Describe what needs to change (required)", Comment → "Leave a comment (optional)". Character counter appears at 80% of max, turns red within 500 chars of limit.

2. **Review type selector** with three radio-button-style options: ✓ Approve (green), ✗ Request Changes (red), 💬 Comment (blue). Each shows description text. Disabled options have grayed-out styling, lock icon, cursor: not-allowed, and tooltip on hover.

3. **Submit button** with dynamic label reflecting selected type ("Submit: Approve" / "Submit: Request Changes" / "Submit: Comment"). Loading state shows spinner and "Submitting…" with all inputs disabled.

#### Disabled States

- **LR author**: Approve and Request Changes disabled with tooltip "You cannot approve/request changes on your own landing request."
- **Read-only access**: Approve and Request Changes disabled with tooltip "Write access required."
- **Closed/merged LR**: Entire form panel is muted with overlay message: "This landing request is [closed/merged] and cannot receive new reviews."
- **Request Changes with empty body**: Submit button disabled, validation message shown.

#### Submission Flow

- **Success**: Toast notification "Review submitted" with green checkmark. Timeline refreshes. Form resets (type → Comment, body → empty). Summary line updates.
- **Error**: Form stays open, content preserved. Inline error banner at top of form. For retryable errors (500, network): retry button in banner. Submit button re-enables.

#### Timeline Display

Each review in timeline shows: type badge (green ✓ / red ✗ / blue 💬 pill), reviewer avatar (32px) + linked username, relative timestamp with absolute tooltip, body rendered as markdown. Dismissed reviews show muted/gray styling with "Dismissed" badge.

#### Review Summary

Tab label: "Reviews (N)". Summary line: "N reviews · M approved · P changes requested". For protected bookmarks: "M of K required approvals" (amber if insufficient).

#### Keyboard Shortcuts

- `Ctrl+Enter` / `Cmd+Enter`: Submit review
- `Escape`: Close form with dirty-check confirmation if body has content
- Confirmation dialog: "Discard review? Your changes will be lost." with "Discard" (red) and "Keep editing" buttons.

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/landings/:number/reviews`

**Request:** `{ "type": "approve" | "request_changes" | "comment", "body": "optional text" }`

**Success:** 201 Created with `{ id, landing_request_id, reviewer: { id, login }, type, body, state: "submitted", created_at, updated_at }`

**Errors:** 401 (unauth), 403 (no write access / self-review), 404 (repo/LR not found), 422 (invalid type / LR not open / body too long / body required), 429 (rate limited with Retry-After header)

### SDK Shape

Shared `@codeplane/ui-core` hooks:
- `useCreateLandingReview(owner, repo, number)` → `{ mutate, loading, error }` — auto-invalidates review list and landing caches after success
- `useLandingReviews(owner, repo, number, options?)` → `{ data, total, loading, error, refetch }`
- `useLanding(owner, repo, number)` → `{ data, loading, error }` — used for author check and state check
- `useCurrentUser()` → `{ data, loading }` — used for self-review comparison

### Documentation

- **"Reviewing Landing Requests" guide**: Walkthrough of all three review types, when to use each, markdown body formatting, keyboard shortcuts. Include screenshots of form in each state.
- **"Landing Request Detail Page" guide**: Updated to reference the Reviews tab and review form.
- **"Keyboard Shortcuts Reference"**: Updated with review form shortcuts under Landing Requests section.
- **"Protected Bookmarks and Approvals" guide**: How approval reviews count toward thresholds, how Request Changes blocks merge, how dismissals interact with counts.

## Permissions & Security

### Authorization Roles

| Role | Can Approve | Can Request Changes | Can Comment | Can See Form |
|------|-------------|-------------------|-------------|-------------|
| Anonymous | ✗ (no form visible) | ✗ (no form visible) | ✗ (no form visible) | ✗ |
| Authenticated, no repo access | ✗ (404 — page not accessible) | ✗ (404) | ✗ (404) | ✗ |
| Read-only collaborator | ✗ (disabled with tooltip) | ✗ (disabled with tooltip) | ✓ | ✓ (Comment only) |
| Write collaborator | ✓ | ✓ | ✓ | ✓ |
| Landing request author (with write) | ✗ (disabled — self-review) | ✗ (disabled — self-review) | ✓ | ✓ (Comment only) |
| Repository admin | ✓ | ✓ | ✓ | ✓ |
| Organization owner | ✓ | ✓ | ✓ | ✓ |

### Self-Review Restriction

- Landing request author cannot submit `approve` or `request_changes` on their own LR. They may submit `comment`.
- Enforced client-side (UI disabling with tooltip comparing `currentUser.id === landingRequest.author.id`) AND server-side (403 response).
- Server-side enforcement is canonical — client-side is UX convenience only.

### Rate Limiting

- Review creation: 30 reviews per user per hour per repository.
- Review creation: 5 reviews per user per minute per landing request (burst protection).
- 429 responses include `Retry-After` header.
- UI displays rate limit error with countdown: "Rate limit exceeded. Try again in N seconds."

### Data Privacy

- Review bodies may contain freeform text (including names, emails). No PII scrubbing applied.
- Bodies only visible to users with read access to the repository.
- Private repo reviews return 404 (not 403) to non-members to avoid leaking repo existence.
- Reviewer identity (user ID, login) included in all responses — standard for collaboration tools.
- Markdown preview renders client-side only; no body content sent to external services.
- Review bodies are included in webhook payloads — webhook recipients must be trusted.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing_review.form_rendered` | Form component mounts | `landing_request_id`, `repo_id`, `owner`, `repo`, `landing_state`, `is_author`, `user_access_level`, `client: "web"` |
| `landing_review.type_selected` | Type selector changed | `landing_request_id`, `repo_id`, `review_type`, `previous_type`, `client: "web"` |
| `landing_review.body_started` | First character typed in body | `landing_request_id`, `repo_id`, `review_type`, `client: "web"` |
| `landing_review.preview_toggled` | Write/Preview toggled | `landing_request_id`, `repo_id`, `preview_mode`, `body_length`, `client: "web"` |
| `landing_review.submit_attempted` | Submit clicked or Ctrl+Enter pressed | `landing_request_id`, `repo_id`, `review_type`, `body_length`, `has_body`, `client: "web"` |
| `landing_review.created` | 201 response received | `review_id`, `landing_request_id`, `repo_id`, `reviewer_id`, `type`, `has_body`, `body_length`, `approval_count_after`, `time_to_submit_ms`, `client: "web"` |
| `landing_review.submit_failed` | 4xx/5xx response | `landing_request_id`, `repo_id`, `review_type`, `error_status`, `error_code`, `client: "web"` |
| `landing_review.self_review_blocked` | Author clicks disabled type option | `landing_request_id`, `repo_id`, `attempted_type`, `client: "web"` |
| `landing_review.form_abandoned` | Navigate away with unsaved content | `landing_request_id`, `repo_id`, `review_type`, `body_length`, `had_body_content`, `time_open_ms`, `client: "web"` |
| `landing_review.discard_confirmed` | Discard confirmed in dirty dialog | `landing_request_id`, `repo_id`, `review_type`, `body_length`, `client: "web"` |
| `landing_review.discard_cancelled` | Discard cancelled in dirty dialog | `landing_request_id`, `repo_id`, `client: "web"` |
| `landing_review.validation_error` | Client-side validation blocks submit | `landing_request_id`, `repo_id`, `review_type`, `field`, `error_code`, `client: "web"` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|------------|-------------------|
| Form render → submission rate | % of page loads where form renders resulting in successful submission | > 15% |
| Form completion rate | % of users who select a review type and eventually submit | > 70% |
| Time to first review | Median time from LR creation to first review | Decreasing over time |
| Time to submit | Median time from form render to submission | < 60s approve, < 3min request_changes |
| Quick approval rate | % of approvals submitted with no body | 30–50% |
| Abandon rate | % of forms with body > 10 chars abandoned | < 20% |
| Type distribution | Breakdown by type | 50–70% approve, 10–25% request_changes, 15–30% comment |
| Markdown preview usage | % of submissions with preview toggled | Track for feature value |
| Self-review block encounters | Frequency of blocked attempts | Low and stable |
| Error recovery rate | % of errors followed by successful retry within 5 min | > 80% |

## Observability

### Logging

| Event | Log Level | Structured Context |
|-------|-----------|-------------------|
| Review created successfully | `info` | `{ event: "landing_review_created", review_id, landing_request_id, repo_id, reviewer_id, type, body_length, client: "web" }` |
| Self-review blocked (server-side) | `warn` | `{ event: "landing_review_self_blocked", landing_request_id, repo_id, actor_id, type }` |
| Review creation failed (DB error) | `error` | `{ event: "landing_review_create_failed", landing_request_id, repo_id, reviewer_id, error_message, request_id }` |
| Invalid review type rejected | `warn` | `{ event: "landing_review_invalid_type", landing_request_id, repo_id, actor_id, type_submitted }` |
| Body exceeded max length | `warn` | `{ event: "landing_review_body_too_long", landing_request_id, repo_id, actor_id, body_length, max_allowed }` |
| Body required but empty | `warn` | `{ event: "landing_review_body_required", landing_request_id, repo_id, actor_id, type: "request_changes" }` |
| Unauthorized attempt (401) | `warn` | `{ event: "landing_review_unauthorized", landing_request_id, repo_id }` |
| Write access denied (403) | `warn` | `{ event: "landing_review_forbidden", landing_request_id, repo_id, actor_id }` |
| Landing request not found (404) | `warn` | `{ event: "landing_review_lr_not_found", landing_request_number, repo_id }` |
| Landing request not open (422) | `warn` | `{ event: "landing_review_lr_not_open", landing_request_id, repo_id, actor_id, lr_state }` |
| Rate limited (429) | `warn` | `{ event: "landing_review_rate_limited", repo_id, actor_id, retry_after }` |
| Slow creation (> 2s) | `warn` | `{ event: "landing_review_slow_create", landing_request_id, repo_id, duration_ms }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_reviews_created_total` | Counter | `type`, `repo_id`, `client` | Total reviews created |
| `codeplane_landing_review_create_duration_seconds` | Histogram | `type`, `status_code` | Creation endpoint latency |
| `codeplane_landing_review_errors_total` | Counter | `error_type` (validation/auth/forbidden/not_found/self_review/rate_limit/internal) | Errors by category |
| `codeplane_landing_review_self_blocked_total` | Counter | `repo_id`, `type` | Self-review blocks |
| `codeplane_landing_review_body_length_bytes` | Histogram | `type` | Body size distribution |
| `codeplane_landing_review_form_submissions_total` | Counter | `type`, `result` (success/client_validation_error/server_error) | Web form submissions |
| `codeplane_landing_review_form_abandons_total` | Counter | `had_content` | Web form abandonments |

### Alerts

#### Alert: `LandingReviewCreateErrorRateHigh`
- **Condition:** `rate(codeplane_landing_review_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "landing_review_create_failed"` entries in last 15 minutes.
  2. Verify database connectivity via health check query.
  3. Check `landing_request_reviews` table accessibility — look for locks or long-running transactions.
  4. Check disk space on database server.
  5. Review recent migrations affecting the reviews table.
  6. If transient, monitor 10 more minutes. If persistent, check connection pool utilization.
  7. Escalate to database on-call if deadlock or connection exhaustion is suspected.

#### Alert: `LandingReviewCreateLatencyHigh`
- **Condition:** `histogram_quantile(0.99, rate(codeplane_landing_review_create_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for `createLandingRequestReview`.
  2. Look for table locks or long transactions on `landing_request_reviews`.
  3. Check connection pool saturation.
  4. Check if a specific repository has unusually many reviews.
  5. Review recent index changes or migrations.
  6. If traffic-correlated, increase connection pool size temporarily.

#### Alert: `LandingReviewSelfBlockRateSpike`
- **Condition:** `rate(codeplane_landing_review_self_blocked_total[15m]) > 1`
- **Severity:** Info
- **Runbook:**
  1. Indicates potential UX confusion about self-review restrictions.
  2. Check logs for `client` field — if `web`, the client-side disabling may be broken.
  3. Verify `currentUser.id === landingRequest.author.id` comparison in the UI.
  4. If from a single user/automation, no action needed.

#### Alert: `LandingReviewFormAbandonRateHigh`
- **Condition:** `rate(codeplane_landing_review_form_abandons_total{had_content="true"}[1h]) / rate(codeplane_landing_review_form_submissions_total[1h]) > 0.5`
- **Severity:** Info
- **Runbook:**
  1. High abandon rate with content suggests usability issues.
  2. Check correlation with error rate increases.
  3. Check correlation with latency spikes.
  4. Review recent UI changes to the review form.
  5. Product/UX signal — no server-side action needed.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Database write failure | `landing_review_create_failed` log, 500 | Review not persisted | Client shows retry; DB health check |
| Auth service unavailable | 401 on valid tokens | All reviews fail | Auth health check; client prompts re-auth |
| Rate limit misconfiguration | 429 spike | Legitimate users blocked | Adjust thresholds |
| Self-review bypass (client bug) | Self-approvals in DB | Review integrity issue | Server enforcement is canonical; fix client |
| Session expiry mid-form | 401 on submit | Content potentially lost | Client preserves content; shows re-auth prompt |
| Notification fanout failure | Author not notified | Silent — not critical | Async retry queue |
| Concurrent double-submit | Two reviews created | Both valid | Button disables on first click |

## Verification

### API Integration Tests

- [ ] Approve with body: POST `type: "approve"`, `body: "LGTM"` → 201, correct response shape
- [ ] Approve without body: POST `type: "approve"`, no body → 201, body is empty string
- [ ] Approve with empty string body: `body: ""` → 201
- [ ] Approve with whitespace-only body: `body: "   \n  "` → 201, stored body is empty after trim
- [ ] Approve with max body (50,000 chars) → 201
- [ ] Approve with body exceeding max (50,001 chars) → 422 (body/too_long)
- [ ] Request Changes with body → 201
- [ ] Request Changes with empty body → 422 (body/missing_field)
- [ ] Request Changes with whitespace-only body → 422
- [ ] Request Changes with max body (65,535 chars) → 201
- [ ] Request Changes with body exceeding max (65,536 chars) → 422
- [ ] Request Changes with 1-char body → 201
- [ ] Comment with body → 201
- [ ] Comment without body → 201
- [ ] Comment with max body (65,535 chars) → 201
- [ ] Comment with body exceeding max (65,536 chars) → 422
- [ ] Case-insensitive type: `"APPROVE"` → 201, response type is `"approve"`
- [ ] Mixed-case type: `"Request_Changes"` → 201
- [ ] Markdown body preserved verbatim
- [ ] Unicode/emoji body preserved exactly
- [ ] Special characters (`<script>`, backticks, quotes) stored as-is
- [ ] Self-approval blocked → 403
- [ ] Self-request-changes blocked → 403
- [ ] Self-comment allowed → 201
- [ ] Unauthenticated → 401
- [ ] Read-only user approve → 403
- [ ] Read-only user comment → 201
- [ ] Write collaborator all types → 201
- [ ] Admin all types → 201
- [ ] Nonexistent LR → 404
- [ ] Nonexistent repo → 404
- [ ] Closed LR → 422
- [ ] Merged LR → 422
- [ ] Draft LR → 201
- [ ] Invalid type `"super_approve"` → 422
- [ ] Missing type `{}` → 422
- [ ] Null type `{ "type": null }` → 422
- [ ] Extra fields ignored → 201
- [ ] Multiple reviews from same reviewer → both 201
- [ ] Distinct approval count: 2 approvals same reviewer = count 1; 2 different reviewers = count 2
- [ ] Dismissed approval not counted
- [ ] Response shape: all fields present with correct types
- [ ] Timestamps valid ISO within last 60 seconds
- [ ] Review appears in GET reviews list after creation
- [ ] Rate limiting: exceed per-minute limit → 429 with Retry-After
- [ ] Non-JSON content type → 400 or 415

### Web UI E2E Tests (Playwright)

- [ ] Review form renders on landing detail Reviews tab with type selector, textarea, submit button
- [ ] Default type is Comment
- [ ] Type selector changes submit button text dynamically
- [ ] Approve with body: select, type, submit → toast, timeline shows green ✓ badge
- [ ] Approve without body: select, submit → success
- [ ] Request Changes with body: select, type, submit → timeline shows red ✗ badge
- [ ] Request Changes empty body: submit button disabled, validation message visible
- [ ] Request Changes whitespace-only body: submit button remains disabled
- [ ] Comment with body: select, type, submit → timeline shows blue 💬 badge
- [ ] Comment without body: submit → success
- [ ] Approve disabled for LR author with correct tooltip
- [ ] Request Changes disabled for LR author with correct tooltip
- [ ] Comment allowed for LR author
- [ ] Approve/Request Changes disabled for read-only user with tooltip
- [ ] Comment allowed for read-only user
- [ ] Form disabled for closed LR with explanatory message
- [ ] Form disabled for merged LR
- [ ] Review summary updates after submission
- [ ] Reviews tab count updates after submission
- [ ] Correct badges and styling in timeline for each type
- [ ] Markdown preview toggle: write → preview → write preserves content
- [ ] Character counter appears at 80% of max
- [ ] Character counter turns red within 500 chars of limit
- [ ] Ctrl+Enter submits review
- [ ] Cmd+Enter submits on macOS
- [ ] Escape with clean form: form collapses
- [ ] Escape with dirty form: discard dialog appears
- [ ] Discard dialog confirm: form clears and collapses
- [ ] Discard dialog cancel: form content preserved
- [ ] Discard dialog Escape: returns to form
- [ ] Loading state: spinner, "Submitting…", inputs disabled
- [ ] Form resets after successful submission
- [ ] Error banner on network failure, content preserved, retry button
- [ ] Error banner on 422 body too long
- [ ] Retry button works after error
- [ ] Double-click prevention: only one review created
- [ ] Form state preserved across tab switches (Reviews → Diff → Reviews)
- [ ] Unicode round-trip: emoji and CJK chars preserved
- [ ] Long body (50,000 chars) renders in timeline

### CLI E2E Tests

- [ ] `codeplane lr review <N> --action approve --body "LGTM"` → exit 0, JSON has `type: "approve"`
- [ ] `codeplane lr review <N> --action approve` (no body) → exit 0
- [ ] `codeplane lr review <N> --action request-changes --body "Fix tests"` → exit 0
- [ ] `codeplane lr review <N> --action request-changes` (no body) → non-zero exit, error
- [ ] `codeplane lr review <N> --action comment --body "Looks good"` → exit 0
- [ ] Text output for approve: "✓ Approved landing request #N"
- [ ] `--json` output matches response schema
- [ ] Approve on nonexistent LR → non-zero exit, error
- [ ] Approve as LR author → non-zero exit, self-review error
- [ ] Review list after submit shows new review
- [ ] Approve then dismiss via CLI works

### Cross-Client Consistency Tests

- [ ] Web review visible in CLI `lr review list` with correct type and body
- [ ] CLI review visible in web timeline with correct badge
- [ ] Review counts consistent across web, CLI, and API
- [ ] Dismiss from CLI reflected in web UI (dismissed styling)

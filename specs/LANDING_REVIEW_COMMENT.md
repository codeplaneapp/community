# LANDING_REVIEW_COMMENT

Specification for LANDING_REVIEW_COMMENT.

## High-Level User POV

When a developer reviews a landing request in Codeplane, they submit a review that carries a verdict — approve, request changes, or comment — along with an optional body message. Today, this review exists as a standalone record. Separately, a developer can leave inline diff comments tied to specific file paths and line numbers. But these two concepts are disconnected: there is no way to submit a batch of inline comments as part of a single review action.

The `LANDING_REVIEW_COMMENT` feature bridges this gap. It allows a reviewer to submit a review that includes both a top-level review body and one or more inline diff comments, all grouped together as a single atomic review action. When a reviewer approves a landing request and says "looks good, one nit on line 42 of auth.ts," that nit is attached to the review itself — not floating as a standalone comment in a separate timeline.

From the reviewer's perspective, the workflow is: open a landing request, read through the diff, leave inline comments on specific lines as you go, choose a review verdict, write an overall summary, and submit everything at once. The review and its associated inline comments appear together in the landing request's timeline, making it clear which comments belong to which review and which reviewer. Other participants can see the full review — verdict, summary, and all inline comments — as one cohesive unit of feedback.

This grouped model is familiar to developers who have used review systems on other forges. It makes review feedback easier to understand, easier to address, and easier to track. When a reviewer requests changes and attaches five inline comments, the landing request author can see all five comments in context of that review, address them, and push new changes. When the reviewer later approves, the old review's comments remain visible as history but are clearly superseded by the new approval.

The feature is available across all Codeplane surfaces: the web UI groups review comments visually under their parent review, the TUI displays them in a threaded format, the CLI can submit reviews with inline comments in a single command, and the API exposes review-scoped comment endpoints for agents and integrations to consume programmatically.

## Acceptance Criteria

### Definition of Done

- [ ] A review can be submitted with zero or more inline comments attached to it in a single atomic API call.
- [ ] Each review comment is linked to exactly one review via a `review_id` foreign key.
- [ ] Review comments are retrievable both as part of their parent review and independently via the landing request's comment list.
- [ ] Review comments appear in the landing request comment list with a `review_id` field that identifies the parent review.
- [ ] The landing request comment list continues to return standalone comments (those without a `review_id`) alongside review-attached comments in chronological order.
- [ ] Review comments can be listed filtered by a specific review ID.
- [ ] The web UI, TUI, CLI, and API all support creating reviews with attached inline comments.
- [ ] The web UI and TUI display review comments grouped under their parent review in the landing request timeline.
- [ ] Dismissing a review does not delete its attached comments — they remain visible but are marked as belonging to a dismissed review.
- [ ] Review comments inherit the same inline comment semantics: file path, line number, and diff side.
- [ ] Review comments support the same body content constraints as standalone comments.

### Input Constraints

- [ ] **Review comment body is required**: Each review comment must have a non-empty body after trimming whitespace. Empty or whitespace-only bodies return `422 Unprocessable Entity`.
- [ ] **Review comment body maximum length**: 65,535 characters. Bodies exceeding this limit return `422 Unprocessable Entity` with a clear error message.
- [ ] **Path is required for inline review comments**: If `line` is greater than 0, `path` must be a non-empty string. Missing path with a positive line number returns `422 Unprocessable Entity`.
- [ ] **Path maximum length**: 4,096 characters. Paths exceeding this limit return `422 Unprocessable Entity`.
- [ ] **Path must not contain null bytes**: Paths containing `\0` return `422 Unprocessable Entity`.
- [ ] **Line must be non-negative**: `line` must be an integer ≥ 0. Negative values return `422 Unprocessable Entity`.
- [ ] **Line zero means general review comment**: A review comment with `line: 0` and `path: ""` is a general comment attached to the review (not inline).
- [ ] **Side must be valid**: `side` must be one of `"left"`, `"right"`, or `"both"`. Invalid values return `422 Unprocessable Entity`. Empty side defaults to `"right"`.
- [ ] **Maximum comments per review**: A single review submission can include at most 100 inline comments. Submissions exceeding this limit return `422 Unprocessable Entity`.
- [ ] **Duplicate position handling**: Multiple review comments at the same file/line/side within one review are allowed — they are treated as separate comments.
- [ ] **Review type constraints still apply**: The review `type` must be `"approve"`, `"request_changes"`, or `"comment"`. The `body` is still required for `"request_changes"` and `"comment"` types.
- [ ] **Comments array is optional**: If the `comments` array is omitted or empty, the review is created without attached comments (backward compatible).

### Edge Cases

- [ ] **Empty comments array**: Submitting a review with `comments: []` creates the review with no attached comments — equivalent to current behavior.
- [ ] **Review with only inline comments and no body**: For `"approve"` type, the review can have an empty body but still include inline comments. For `"request_changes"` and `"comment"` types, the review body is still required even if inline comments are present.
- [ ] **Comments on files not in the diff**: The server accepts comments referencing any file path. It does not validate that the path exists in the landing request's change set.
- [ ] **Comments on line numbers beyond file length**: The server accepts any non-negative line number. It does not validate that the line exists in the file.
- [ ] **Unicode in paths**: File paths with Unicode characters (e.g., `src/日本語/file.ts`) are accepted and stored with full fidelity.
- [ ] **Self-review with comments**: A landing request author can submit a `"comment"` type review with inline comments on their own landing request. They cannot submit `"approve"` or `"request_changes"` even with comments attached.
- [ ] **Review on merged/closed landing request**: Reviews with comments cannot be submitted on merged or closed landing requests. The entire submission (review + comments) is rejected atomically.
- [ ] **Partial failure is not possible**: Either the review and all its comments are created, or none are. The operation is atomic.
- [ ] **Concurrent review submissions**: Two reviewers submitting reviews simultaneously on the same landing request both succeed independently.
- [ ] **Comments from deleted users**: If a user who authored review comments is later deleted, the comments remain visible with best-effort author resolution.
- [ ] **Very large review**: A review with exactly 100 inline comments, each with a 65,535-character body, should be accepted (within payload size limits).

## Design

### API Shape

#### Create Review with Comments (Enhanced Existing Endpoint)

The existing `POST /api/repos/:owner/:repo/landings/:number/reviews` endpoint is extended to accept an optional `comments` array:

**Request**:
```json
{
  "type": "request_changes",
  "body": "A few issues to address before landing.",
  "comments": [
    {
      "path": "src/auth/handler.ts",
      "line": 42,
      "side": "right",
      "body": "This error message should be more specific."
    },
    {
      "path": "src/auth/handler.ts",
      "line": 58,
      "side": "right",
      "body": "Missing null check here — could crash on invalid tokens."
    },
    {
      "path": "",
      "line": 0,
      "side": "right",
      "body": "General note: the overall approach is good, just needs these fixes."
    }
  ]
}
```

**Response** (`201 Created`):
```json
{
  "id": 7,
  "landing_request_id": 12,
  "reviewer": { "id": 5, "login": "alice" },
  "type": "request_changes",
  "body": "A few issues to address before landing.",
  "state": "submitted",
  "comments_count": 3,
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

The response now includes a `comments_count` field indicating how many inline comments are attached to this review. Existing clients that do not send `comments` continue to work without changes (the field defaults to `0`).

#### List Review Comments

**`GET /api/repos/:owner/:repo/landings/:number/reviews/:review_id/comments`**

Returns all comments attached to a specific review.

Query parameters:
- `page` (integer, default 1): Page number (1-indexed).
- `per_page` (integer, default 30, max 100): Comments per page.

**Response** (`200 OK`):
```json
[
  {
    "id": 101,
    "landing_request_id": 12,
    "review_id": 7,
    "author": { "id": 5, "login": "alice" },
    "path": "src/auth/handler.ts",
    "line": 42,
    "side": "right",
    "body": "This error message should be more specific.",
    "created_at": "2026-03-22T14:30:00.000Z",
    "updated_at": "2026-03-22T14:30:00.000Z"
  }
]
```

Response headers:
- `X-Total-Count`: Total number of comments for this review.
- `Link`: Standard pagination links.

**Error responses**:
- `404 Not Found`: Repository, landing request, or review not found.
- `400 Bad Request`: Invalid review_id format.

#### Enhanced Comment List Response

The existing `GET /api/repos/:owner/:repo/landings/:number/comments` endpoint is enhanced to include the optional `review_id` field:

```json
{
  "id": 101,
  "landing_request_id": 12,
  "review_id": 7,
  "author": { "id": 5, "login": "alice" },
  "path": "src/auth/handler.ts",
  "line": 42,
  "side": "right",
  "body": "This error message should be more specific.",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

The `review_id` is `null` for standalone comments not attached to any review. This is backward compatible.

Optional query parameter additions:
- `review_id` (integer): Filter comments to only those belonging to a specific review.
- `exclude_review_comments` (boolean, default `false`): If `true`, return only standalone comments.

#### List Reviews (Enhanced Response)

The existing `GET /api/repos/:owner/:repo/landings/:number/reviews` response now includes `comments_count`:

```json
{
  "id": 7,
  "landing_request_id": 12,
  "reviewer": { "id": 5, "login": "alice" },
  "type": "request_changes",
  "body": "A few issues to address before landing.",
  "state": "submitted",
  "comments_count": 3,
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

### SDK Shape

The landing service in `@codeplane/sdk` gains the following additions:

**Extended `CreateLandingReviewInput`**:
```typescript
interface CreateLandingReviewInput {
  type: string;
  body: string;
  comments?: CreateReviewCommentInput[];
}

interface CreateReviewCommentInput {
  path: string;
  line: number;
  side: string;
  body: string;
}
```

**New service methods**:
- `listReviewComments(viewer, owner, repo, number, reviewID, page, perPage)` — Returns paginated comments for a specific review.

**Enhanced response types**:
```typescript
interface LandingReviewResponse {
  id: number;
  landing_request_id: number;
  reviewer: LandingRequestAuthor;
  type: string;
  body: string;
  state: string;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

interface LandingCommentResponse {
  id: number;
  landing_request_id: number;
  review_id: number | null;
  author: LandingRequestAuthor;
  path: string;
  line: number;
  side: string;
  body: string;
  created_at: string;
  updated_at: string;
}
```

### Web UI Design

The landing request detail page's timeline view is enhanced to display review comments grouped under their parent review:

**Review card with inline comments**:
```
┌─────────────────────────────────────────────────────────────────┐
│  ✗  @alice requested changes                        2 hours ago │
│                                                                 │
│  A few issues to address before landing.                        │
│                                                                 │
│  ┌─ src/auth/handler.ts:42 ──────────────────────────────────┐ │
│  │  This error message should be more specific.              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ src/auth/handler.ts:58 ──────────────────────────────────┐ │
│  │  Missing null check here — could crash on invalid tokens. │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  3 comments on 1 file                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Review form enhancements**:
- When reviewing a landing request in the web UI, the diff viewer allows leaving inline comments as the reviewer reads through the code.
- Each inline comment entered during the diff review is held in a "pending review" state — visible only to the reviewer as draft annotations.
- A pending review badge appears showing the count of draft comments (e.g., "3 pending comments").
- When the reviewer opens the review submission form, they see all their pending inline comments listed alongside the review type selector and body textarea.
- Individual pending comments can be edited or removed before submission.
- Submitting the review sends the review type, body, and all pending inline comments in a single API call.
- If the reviewer navigates away without submitting, pending comments are preserved in local state for that landing request until the browser tab is closed.

**Diff viewer integration**:
- Inline review comments from submitted reviews are displayed alongside the diff at their respective file/line positions.
- Comments are grouped by review and display the reviewer's avatar, username, and the review verdict badge (✓, ✗, or 💬).
- Dismissed reviews' comments are shown with reduced opacity and a "dismissed" label.
- A "Start review" button appears in the diff gutter when hovering over a line, enabling the user to begin or add to their pending review.

### CLI Command

The `codeplane land review` command is enhanced to support inline comments:

```bash
# Submit a review with inline comments
codeplane land review 42 \
  --approve \
  --body "LGTM with one nit" \
  --comment "src/auth.ts:42:right:Use a more specific error type" \
  --comment "src/auth.ts:58:right:Add null check"

# Submit request-changes review with comments
codeplane land review 42 \
  --request-changes \
  --body "Several issues to fix" \
  --comment "src/handler.ts:10:right:This function is too long"

# Submit review with inline comments from a file
codeplane land review 42 \
  --approve \
  --body "Approved" \
  --comments-file review-comments.json
```

**New flags**:
- `--comment <path:line:side:body>`: Add an inline comment. Can be specified multiple times. Format: `filepath:line_number:side:comment_body`. Side defaults to `right` if omitted (`filepath:line_number:comment_body` is also accepted).
- `--request-changes`: Shorthand for `--type request_changes`. Mutually exclusive with `--approve`.
- `--comments-file <path>`: Path to a JSON file containing an array of comment objects `[{ "path": "...", "line": N, "side": "...", "body": "..." }]`.

**Structured output** (`--json`): The review response now includes `comments_count` and the full review object.

### TUI Design

The TUI review form (`TUI_LANDING_REVIEW_FORM`) is enhanced to support a pending comments workflow:

**Review form with pending comments**:
```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings > #12 > Review     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Landing #12: Update auth flow for SSO support               │
│  by @alice · open · 3 changes · target: main                 │
│                                                              │
│  ─── Review Type ──────────────────────────────────────────  │
│  ▸ ✓  Approve                                                │
│    ✗  Request Changes                                        │
│    💬 Comment                                                 │
│                                                              │
│  ─── Pending Comments (2) ─────────────────────────────────  │
│  📄 src/auth/handler.ts:42 (right)                           │
│    Use a more specific error type here.                      │
│  📄 src/auth/handler.ts:58 (right)                           │
│    Missing null check — could crash on invalid tokens.       │
│                                                              │
│  ─── Review Comment ──────────────────────────────────────── │
│    ┌──────────────────────────────────────────────────────┐  │
│    │ LGTM overall, just these two nits.                   │  │
│    └──────────────────────────────────────────────────────┘  │
│                                                              │
│                        [Submit Review]  [Cancel]             │
├──────────────────────────────────────────────────────────────┤
│ Status: Tab:next 1/2/3:type Ctrl+S:submit d:delete comment   │
└──────────────────────────────────────────────────────────────┘
```

**Pending comments in diff viewer**:
- When viewing a landing request diff and pressing `c` on a line, the user enters an inline comment that is added to the pending review.
- Pending comments are shown in the diff with a `(pending)` label and lighter color.
- The status bar shows "N pending review comments" when pending comments exist.
- Pressing `r` from the diff viewer with pending comments opens the review form pre-populated with those comments.

**New TUI keybindings**:
- `c` (in diff viewer, on a line): Add inline comment to pending review.
- `d` (in review form, on a pending comment): Delete a pending comment.
- `e` (in review form, on a pending comment): Edit a pending comment.

**Reviews tab enhancements**:
The `TUI_LANDING_REVIEWS_VIEW` shows inline comment counts per review:
```
✗  @alice   Request Changes   2 inline comments              2h ago
   A few issues to address before landing.
✓  @bob     Approved          0 inline comments               1h ago
```

Expanding a review with `Enter` shows its inline comments.

### Documentation

The following end-user documentation should be written:

1. **"Submitting reviews with inline comments"** — A guide explaining the review workflow: reading the diff, leaving inline comments, choosing a verdict, and submitting everything as one review. Covers the web UI, CLI, and TUI workflows.
2. **"Understanding the landing request timeline"** — Updated to explain how review comments are grouped under their parent review versus standalone comments.
3. **API reference update for `POST /reviews`** — Document the new `comments` array parameter, its constraints, and example payloads.
4. **API reference for `GET /reviews/:review_id/comments`** — Document the new endpoint for listing a specific review's comments.
5. **CLI reference update for `land review`** — Document the `--comment`, `--request-changes`, and `--comments-file` flags.

## Permissions & Security

### Authorization Roles

| Role | Create Review with Comments | List Review Comments | View Review Comments in Timeline |
|---|---|---|---|
| Anonymous | ✗ | Public repos only | Public repos only |
| Authenticated (no repo access) | ✗ (403) | Private repos: ✗ (404) | Private repos: ✗ (404) |
| Read-only collaborator | Comment-type only, with inline comments | ✓ | ✓ |
| Write collaborator | All types with inline comments | ✓ | ✓ |
| Landing request author | Comment-type only (self-review restriction), with inline comments | ✓ | ✓ |
| Admin | All types with inline comments (except self-review) | ✓ | ✓ |
| Repository owner | All types with inline comments (except self-review) | ✓ | ✓ |
| Organization owner | All types with inline comments in org repos (except self-review) | ✓ | ✓ |

### Rate Limiting

- `POST /reviews` with comments: Standard API rate limit (60 req/min per user). Each review submission counts as one request regardless of how many comments it contains.
- `GET /reviews/:review_id/comments`: Standard read rate limit (120 req/min per user).
- No separate per-comment rate limit — the 100-comment-per-review cap acts as a natural throttle.
- A single user creating more than 10 reviews in 5 minutes on the same landing request triggers a soft warning in the response header (`X-Review-Rate-Warning: true`) but does not block.

### Data Privacy

- Review comments follow the same visibility model as their parent landing request. No review comment is ever visible to a user who cannot see the landing request.
- Author information (user ID and login) is exposed in review comments. No additional PII (email, full name) is included in the comment response.
- Review comments are not deleted when a review is dismissed — they remain as historical records. Explicit comment deletion (if supported in the future) would require write access.
- File paths in inline comments may reveal internal codebase structure. This is consistent with existing diff and comment behavior and is governed by repository access controls.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|---|---|---|
| `landing.review.created_with_comments` | Review submitted with ≥1 comment | `repo_owner`, `repo_name`, `landing_number`, `review_type`, `body_length`, `comments_count`, `unique_files_count`, `reviewer_id`, `is_author`, `client` (web/cli/tui/api), `duration_ms` |
| `landing.review.comment_added_to_pending` | Inline comment added to pending review (web/TUI) | `repo_owner`, `repo_name`, `landing_number`, `file_path`, `line`, `side`, `body_length`, `pending_count`, `client` |
| `landing.review.comment_removed_from_pending` | Pending comment deleted before submission | `repo_owner`, `repo_name`, `landing_number`, `pending_count`, `client` |
| `landing.review.pending_comments_discarded` | User cancels review with pending comments | `repo_owner`, `repo_name`, `landing_number`, `discarded_count`, `client` |
| `landing.review_comments.listed` | Review comments listed by review ID | `repo_owner`, `repo_name`, `landing_number`, `review_id`, `page`, `per_page`, `total_count`, `client` |
| `landing.review.comments_expanded` | User expands review to see inline comments (web/TUI) | `repo_owner`, `repo_name`, `landing_number`, `review_id`, `comments_count`, `client` |

### Funnel Metrics & Success Indicators

- **Review + comments adoption rate**: Percentage of reviews submitted with ≥1 inline comment (target: >30% within 3 months of launch).
- **Pending comment completion rate**: Percentage of pending inline comments that are ultimately submitted as part of a review (vs. discarded). Target: >80%.
- **Comments per review distribution**: Histogram of comment counts per review — helps identify whether users are batching feedback effectively.
- **Time from first pending comment to review submission**: Measures how long the review session takes. Target median: <10 minutes.
- **Review comment engagement**: Percentage of review comments that receive a response (reply or resolution). Measures whether grouped feedback improves communication.
- **Client distribution**: Which surfaces (web, CLI, TUI, API) are used for review+comment workflows.

## Observability

### Logging

| Level | Event | Structured Context |
|---|---|---|
| `info` | Review created with comments | `landing_request_id`, `review_id`, `reviewer_id`, `review_type`, `comments_count`, `unique_files`, `total_body_bytes`, `request_id` |
| `info` | Review comments listed | `landing_request_id`, `review_id`, `page`, `per_page`, `total_count`, `request_id` |
| `warn` | Review comment validation failed | `landing_request_id`, `reviewer_id`, `field`, `error_code`, `comment_index`, `request_id` |
| `warn` | Review submission exceeds comment limit | `landing_request_id`, `reviewer_id`, `attempted_count`, `max_allowed`, `request_id` |
| `error` | Review comment creation failed (DB error) | `landing_request_id`, `review_id`, `comment_index`, `error_message`, `request_id` |
| `error` | Transaction rollback during review+comments | `landing_request_id`, `reviewer_id`, `comments_count`, `error_message`, `request_id` |
| `warn` | Rate limit soft warning triggered | `landing_request_id`, `reviewer_id`, `review_count_5m`, `request_id` |
| `debug` | Individual review comment created | `landing_request_id`, `review_id`, `comment_id`, `path`, `line`, `side`, `body_length` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_landing_review_comments_total` | Counter | `repo`, `review_type`, `status` (success/error) | Total review comments created |
| `codeplane_landing_review_comments_per_review` | Histogram | `repo`, `review_type` | Distribution of comments per review submission (buckets: 0, 1, 2, 5, 10, 25, 50, 100) |
| `codeplane_landing_review_with_comments_duration_seconds` | Histogram | `repo`, `review_type`, `status` | Latency of the create-review-with-comments operation (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0) |
| `codeplane_landing_review_comments_body_bytes` | Histogram | — | Distribution of individual comment body sizes in bytes (buckets: 50, 100, 250, 500, 1000, 5000, 10000, 65535) |
| `codeplane_landing_review_comments_list_total` | Counter | `repo`, `status` | Total list-review-comments requests |
| `codeplane_landing_review_comments_validation_errors_total` | Counter | `field`, `error_code` | Validation error counts by field and error type |
| `codeplane_landing_review_transaction_rollbacks_total` | Counter | `repo`, `reason` | Count of transaction rollbacks during review+comments creation |

### Alerts

#### `LandingReviewCommentCreationErrorRateHigh`
- **Condition**: `rate(codeplane_landing_review_comments_total{status="error"}[5m]) / rate(codeplane_landing_review_comments_total[5m]) > 0.05` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `review comment creation failed` entries. Filter by `request_id` to trace specific failures.
  2. Check database connectivity and query latency: run `SELECT 1` against the primary DB to verify connectivity.
  3. Check for deadlocks or long-running transactions in the database: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%landing_request_comments%'`.
  4. Check disk space on the database server — comment bodies can be large (up to 65KB each).
  5. If errors are isolated to specific repositories, check for corrupted landing request records.
  6. If errors are DB-related, consider restarting the database connection pool.
  7. Escalate to the platform team if the error rate does not decrease within 30 minutes.

#### `LandingReviewCommentLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_landing_review_with_comments_duration_seconds_bucket[5m])) > 5.0` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the `comments_per_review` histogram — high comment counts (near 100) increase transaction time.
  2. Check database query latency for INSERT operations on `landing_request_comments`.
  3. Check for index bloat on `landing_request_comments` table — run `REINDEX INDEX` if needed.
  4. Check server memory and CPU utilization — large review payloads with 100 comments × 65KB bodies can consume significant memory.
  5. Check for database lock contention on the `landing_request_comments` table.
  6. If the issue is payload-size-related, consider adding request body size limits at the HTTP layer.

#### `LandingReviewTransactionRollbacksHigh`
- **Condition**: `rate(codeplane_landing_review_transaction_rollbacks_total[5m]) > 1` for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Transaction rollbacks mean review+comment atomicity is being violated. Check for database deadlocks immediately.
  2. Review server logs for `Transaction rollback during review+comments` entries — the `error_message` field will indicate the root cause.
  3. Check if concurrent transactions on the same landing request are causing serialization failures.
  4. If deadlocks are the cause, check for missing indexes on `landing_request_id` or `review_id` columns.
  5. If the issue persists, temporarily increase transaction timeout or add advisory locks on the landing request during review creation.
  6. Page the database oncall if rollbacks continue for more than 15 minutes.

#### `LandingReviewCommentValidationErrorSpike`
- **Condition**: `rate(codeplane_landing_review_comments_validation_errors_total[5m]) > 50` for 5 minutes.
- **Severity**: Info
- **Runbook**:
  1. A spike in validation errors often indicates a misbehaving client or agent.
  2. Check the `field` and `error_code` labels to identify the most common validation failure.
  3. Cross-reference with auth logs to identify if a single user/agent is causing the spike.
  4. If the errors are `body:missing_field`, check if a client update shipped with a bug that omits comment bodies.
  5. If the errors are `comments:too_many`, an agent may be generating excessive comments — consider adding per-user throttling.
  6. This alert is informational; no immediate action required unless it correlates with user reports.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|---|---|---|---|
| Empty comment body in array | 422 | Entire review rejected; no partial creation | Client fixes the empty body and resubmits |
| Comment body exceeds 65,535 chars | 422 | Entire review rejected | Client truncates or splits the comment |
| More than 100 comments in array | 422 | Entire review rejected | Client splits into multiple reviews |
| Invalid side value in comment | 422 | Entire review rejected | Client corrects the side value |
| Path empty with line > 0 | 422 | Entire review rejected | Client provides the file path |
| Negative line number | 422 | Entire review rejected | Client corrects the line number |
| Landing request not found | 404 | No review or comments created | Client verifies landing request exists |
| Repository not found | 404 | No review or comments created | Client verifies repository exists |
| Permission denied | 403 | No review or comments created | User obtains appropriate access |
| Review on merged/closed LR | 422 | No review or comments created | Cannot be resolved; LR is immutable |
| Database transaction failure | 500 | Automatic rollback; no partial state | Retry the submission |
| Request body too large (HTTP layer) | 413 | Request rejected before processing | Reduce number/size of comments |
| Auth token expired | 401 | No review or comments created | Re-authenticate |
| Rate limited | 429 | No review or comments created | Wait for `Retry-After` duration |

## Verification

### API Integration Tests

- [ ] `LANDING_REVIEW_COMMENT — create review with zero comments returns 201 with comments_count 0`
- [ ] `LANDING_REVIEW_COMMENT — create review with one inline comment returns 201 with comments_count 1`
- [ ] `LANDING_REVIEW_COMMENT — create review with 5 inline comments on different files returns 201 with comments_count 5`
- [ ] `LANDING_REVIEW_COMMENT — create review with 100 inline comments (maximum) returns 201 with comments_count 100`
- [ ] `LANDING_REVIEW_COMMENT — create review with 101 inline comments returns 422`
- [ ] `LANDING_REVIEW_COMMENT — create approve review with inline comments and empty body returns 201`
- [ ] `LANDING_REVIEW_COMMENT — create request_changes review with inline comments and empty body returns 422 (body required)`
- [ ] `LANDING_REVIEW_COMMENT — create comment review with inline comments and empty body returns 422 (body required)`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with empty body in array returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with whitespace-only body returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with body at exactly 65,535 characters returns 201`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with body at 65,536 characters returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with path at 4,096 characters returns 201`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with path at 4,097 characters returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with path containing null byte returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with line 0 and empty path (general comment) returns 201`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with negative line returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with line > 0 and empty path returns 422`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with side "left" returns 201`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with side "right" returns 201`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with side "both" returns 201`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with empty side defaults to "right"`
- [ ] `LANDING_REVIEW_COMMENT — inline comment with invalid side "center" returns 422`
- [ ] `LANDING_REVIEW_COMMENT — multiple comments at the same file/line/side are allowed`
- [ ] `LANDING_REVIEW_COMMENT — review with comments on merged landing request returns 422`
- [ ] `LANDING_REVIEW_COMMENT — review with comments on closed landing request returns 422`
- [ ] `LANDING_REVIEW_COMMENT — self-review with comments (comment type) on own landing returns 201`
- [ ] `LANDING_REVIEW_COMMENT — self-review with comments (approve type) on own landing returns 422`
- [ ] `LANDING_REVIEW_COMMENT — unauthenticated user submitting review with comments returns 401`
- [ ] `LANDING_REVIEW_COMMENT — user without write access submitting review with comments returns 403`
- [ ] `LANDING_REVIEW_COMMENT — review with comments on nonexistent landing request returns 404`
- [ ] `LANDING_REVIEW_COMMENT — review with comments on nonexistent repository returns 404`
- [ ] `LANDING_REVIEW_COMMENT — atomicity: if any comment fails validation, no review or comments are created`
- [ ] `LANDING_REVIEW_COMMENT — unicode in comment body preserved correctly`
- [ ] `LANDING_REVIEW_COMMENT — unicode in file path preserved correctly`
- [ ] `LANDING_REVIEW_COMMENT — emoji in comment body preserved correctly`
- [ ] `LANDING_REVIEW_COMMENT — review comments array omitted (backward compatibility) returns 201 with comments_count 0`

### List Review Comments API Tests

- [ ] `LANDING_REVIEW_COMMENT — list comments for review with 0 comments returns empty array and X-Total-Count 0`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review with 3 comments returns all 3 in chronological order`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review respects page/per_page pagination`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review returns X-Total-Count header`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review with per_page > 100 clamps to 100`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review page beyond results returns empty array`
- [ ] `LANDING_REVIEW_COMMENT — list comments for nonexistent review returns 404`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review on private repo without access returns 404`
- [ ] `LANDING_REVIEW_COMMENT — list comments for review on public repo as anonymous succeeds`
- [ ] `LANDING_REVIEW_COMMENT — each comment in list includes review_id field matching the review`
- [ ] `LANDING_REVIEW_COMMENT — comments include correct author id and login`
- [ ] `LANDING_REVIEW_COMMENT — comments include correct path, line, side, body, and timestamps`

### Enhanced Comment List API Tests

- [ ] `LANDING_REVIEW_COMMENT — listing all comments includes review_id field (null for standalone, number for review comments)`
- [ ] `LANDING_REVIEW_COMMENT — filtering comments by review_id returns only that review's comments`
- [ ] `LANDING_REVIEW_COMMENT — filtering with exclude_review_comments=true returns only standalone comments`
- [ ] `LANDING_REVIEW_COMMENT — review comments and standalone comments interleave correctly in chronological order`

### Review List Enhancement Tests

- [ ] `LANDING_REVIEW_COMMENT — review list includes comments_count field for each review`
- [ ] `LANDING_REVIEW_COMMENT — review with 0 comments shows comments_count 0`
- [ ] `LANDING_REVIEW_COMMENT — review with 5 comments shows comments_count 5`
- [ ] `LANDING_REVIEW_COMMENT — dismissed review still shows correct comments_count`

### CLI Tests

- [ ] `LANDING_REVIEW_COMMENT — codeplane land review with --comment flag submits review with inline comment`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review with multiple --comment flags submits review with multiple inline comments`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --comment with path:line:body format (no side) defaults side to right`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --comment with path:line:side:body format includes side`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --request-changes with --comment flags submits request_changes review with comments`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --approve with --comment flags submits approval with comments`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --comments-file reads comments from JSON file`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --comments-file with invalid JSON returns error`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --comments-file with nonexistent file returns error`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review --json output includes comments_count`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review without --comment flag (backward compatibility) submits review without comments`
- [ ] `LANDING_REVIEW_COMMENT — codeplane land review with --comment flag containing colon in body handles parsing correctly`

### TUI Tests

- [ ] `LANDING_REVIEW_COMMENT — TUI review form displays pending comments section when comments exist`
- [ ] `LANDING_REVIEW_COMMENT — TUI review form pending comments section hidden when no comments`
- [ ] `LANDING_REVIEW_COMMENT — TUI diff viewer c key opens inline comment input`
- [ ] `LANDING_REVIEW_COMMENT — TUI diff viewer pending comment shown with (pending) label`
- [ ] `LANDING_REVIEW_COMMENT — TUI review form d key on pending comment deletes it`
- [ ] `LANDING_REVIEW_COMMENT — TUI review form e key on pending comment opens editor`
- [ ] `LANDING_REVIEW_COMMENT — TUI review form Ctrl+S submits review with all pending comments`
- [ ] `LANDING_REVIEW_COMMENT — TUI reviews tab shows inline comment count per review`
- [ ] `LANDING_REVIEW_COMMENT — TUI reviews tab expanding review with Enter shows inline comments`
- [ ] `LANDING_REVIEW_COMMENT — TUI status bar shows pending comment count during diff review`

### Web UI E2E Tests (Playwright)

- [ ] `LANDING_REVIEW_COMMENT — web diff viewer shows "Start review" button on line hover`
- [ ] `LANDING_REVIEW_COMMENT — web diff viewer inline comment creates pending review comment`
- [ ] `LANDING_REVIEW_COMMENT — web pending review badge shows correct count`
- [ ] `LANDING_REVIEW_COMMENT — web review form shows pending inline comments list`
- [ ] `LANDING_REVIEW_COMMENT — web review form allows editing pending comment before submit`
- [ ] `LANDING_REVIEW_COMMENT — web review form allows removing pending comment before submit`
- [ ] `LANDING_REVIEW_COMMENT — web review form submit sends review with all comments`
- [ ] `LANDING_REVIEW_COMMENT — web review form submit success shows review card with grouped comments in timeline`
- [ ] `LANDING_REVIEW_COMMENT — web review card shows inline comments grouped under review`
- [ ] `LANDING_REVIEW_COMMENT — web review card shows comments_count badge`
- [ ] `LANDING_REVIEW_COMMENT — web dismissed review shows inline comments with reduced opacity`
- [ ] `LANDING_REVIEW_COMMENT — web diff viewer shows submitted review comments at correct file/line positions`
- [ ] `LANDING_REVIEW_COMMENT — web navigating away preserves pending comments in local state`
- [ ] `LANDING_REVIEW_COMMENT — web e2e full review flow: navigate to diff → add inline comments → submit review → verify timeline`
- [ ] `LANDING_REVIEW_COMMENT — web e2e review with 100 inline comments displays all comments after submission`

### Atomicity and Consistency Tests

- [ ] `LANDING_REVIEW_COMMENT — if one comment in the array has invalid data, no review or comments are persisted`
- [ ] `LANDING_REVIEW_COMMENT — after failed submission, retrying with valid data succeeds`
- [ ] `LANDING_REVIEW_COMMENT — two concurrent review submissions on the same landing request both succeed`
- [ ] `LANDING_REVIEW_COMMENT — dismissing a review preserves its attached comments`
- [ ] `LANDING_REVIEW_COMMENT — review comments appear in the general comment list with correct review_id`
- [ ] `LANDING_REVIEW_COMMENT — standalone comments have null review_id in the comment list`

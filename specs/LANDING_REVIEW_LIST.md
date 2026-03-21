# LANDING_REVIEW_LIST

Specification for LANDING_REVIEW_LIST.

## High-Level User POV

When a user opens a landing request in Codeplane — whether through the web application, terminal UI, CLI, or an editor integration — they need to see the full history of review decisions that have been made on that landing request. Landing requests are Codeplane's jj-native alternative to pull requests, built around stacked changes proposed for landing into a target bookmark. Reviews are the formal mechanism by which collaborators signal their assessment of those changes: approving them for landing, requesting modifications, or providing structured review commentary.

The review list is the surface that answers the question "what is the review status of this landing request?" It presents every review submitted by reviewers — humans and agents alike — in chronological order, giving the reader a clear timeline of review decisions. Each review entry communicates a review type (approve, request changes, comment, or pending), the reviewer's identity, when the review was submitted, whether the review is still active or has been dismissed, and the review body explaining the reviewer's reasoning.

Unlike free-form comments, reviews carry formal weight. An approval moves the landing request closer to being eligible for merge. A "request changes" review signals that the reviewer believes modifications are necessary before landing. The review list makes this formal state visible at a glance so that landing request authors know whether they have sufficient approvals, which reviewers have concerns, and whether any earlier objections have been dismissed.

A user navigates to a landing request and the review list loads as part of the landing request detail. Reviews appear in chronological order (oldest first), each showing the reviewer's username, a review type indicator, the review body, a timestamp, and whether the review has been dismissed. For landing requests on protected bookmarks, the review list also communicates how many approvals have been collected versus how many are required.

The review list is available from every Codeplane surface. In the web UI, reviews render as a dedicated tab on the landing request detail page with rich markdown formatting and visual type indicators. In the TUI, reviews render as a keyboard-navigable tab panel within the landing detail screen with type-specific icons and responsive layout. In the CLI, users can list reviews for a landing request and receive them as structured JSON output suitable for scripting, automation, and agent consumption. Through the API, any client or integration can paginate through the full review history of a landing request.

For landing requests with many reviews — common on large stacks or contentious changes — the paginated list ensures that performance remains acceptable. The total review count is communicated via a response header so that clients can render accurate pagination controls and summary counts without fetching every review upfront.

## Acceptance Criteria

### Definition of Done

The landing request review list is successfully implemented when:

- [ ] The API endpoint `GET /api/repos/:owner/:repo/landings/:number/reviews` returns a paginated, chronologically ordered JSON array of reviews for the specified landing request
- [ ] The response includes `X-Total-Count` header accurately reflecting the total number of reviews on the landing request
- [ ] Pagination via `page`/`per_page` query parameters works correctly with defaults and boundary enforcement
- [ ] All client surfaces (web, TUI, CLI, editors) can consume and display the review list using the same API
- [ ] Private repository access controls are enforced — only users with read access can list reviews
- [ ] Each review includes: `id`, `landing_request_id`, `reviewer` (object with `id` and `login`), `type`, `body`, `state`, `created_at`, `updated_at`
- [ ] Reviews are ordered by `created_at` ascending, with ties broken by `id` ascending
- [ ] The response shape matches the established `LandingReviewResponse` contract across all clients
- [ ] Both submitted and dismissed reviews are returned in the list, with their state clearly indicated

### Input Constraints

- [ ] **Owner is required**: The `owner` path parameter must be a non-empty string. Missing or empty owner returns `400 Bad Request`
- [ ] **Repo is required**: The `repo` path parameter must be a non-empty string. Missing or empty repo returns `400 Bad Request`
- [ ] **Landing request number is required**: The `number` path parameter must be a non-empty string. Missing or empty number returns `400 Bad Request`
- [ ] **Landing request number must be a valid integer**: The `number` path parameter must parse as a valid positive integer. Non-integer values (e.g., `"abc"`, `"1.5"`) return `400 Bad Request`
- [ ] **Landing request number must be positive**: Landing request number `0` or negative numbers should result in the landing request not being found (`404 Not Found`)

### Pagination Constraints

- [ ] **Default page size**: When no pagination parameters are provided, the default page size is 30
- [ ] **Maximum page size**: The maximum allowed page size is 100. Requests for `per_page` > 100 return `400 Bad Request`
- [ ] **Minimum page size**: `per_page` must be a positive integer ≥ 1. Values ≤ 0 return `400 Bad Request`
- [ ] **Page defaults to 1**: When `page` is not provided, it defaults to 1. Pages are 1-indexed
- [ ] **Page must be a positive integer**: `page=0`, `page=-1`, and `page=abc` return `400 Bad Request`
- [ ] **Page beyond results**: Requesting a page beyond the total number of reviews returns an empty array `[]` with the correct `X-Total-Count` header

### Ordering

- [ ] **Chronological order**: Reviews are returned in ascending chronological order by `created_at`, with ties broken by ascending `id`
- [ ] **Order is not configurable**: The API does not accept a sort parameter. The order is always oldest-first

### Repository and Landing Request Constraints

- [ ] **Repository must exist**: The repository identified by `owner/repo` must exist. A non-existent repository returns `404 Not Found`
- [ ] **Private repository without access**: An authenticated user without access to a private repository receives `404 Not Found` (not `403`, to avoid leaking repository existence)
- [ ] **Private repository with read access**: An authenticated user with read access to a private repository can list reviews
- [ ] **Public repository**: Any user (authenticated or anonymous) can list reviews on landing requests in public repositories
- [ ] **Landing request must exist**: The landing request identified by `number` in the given repository must exist. A non-existent landing request returns `404 Not Found`
- [ ] **Landing request state does not affect listing**: Reviews are listable on open, draft, closed, and merged landing requests
- [ ] **Archived repository**: Reviews on landing requests in archived repositories are still listable (archiving prevents writes, not reads)

### Response Contract

- [ ] **Status code**: `200 OK` on success
- [ ] **Response body**: A JSON array of review objects. Each object contains: `id` (number), `landing_request_id` (number), `reviewer` (object with `id` (number) and `login` (string)), `type` (string — one of `"approve"`, `"comment"`, `"request_changes"`, `"pending"`), `body` (string), `state` (string — one of `"submitted"`, `"dismissed"`), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string)
- [ ] **X-Total-Count header**: The response includes an `X-Total-Count` header with the total number of reviews on the landing request (not just the current page count)
- [ ] **Empty landing request**: A landing request with zero reviews returns an empty array `[]` with `X-Total-Count: 0`
- [ ] **Timestamp format**: All timestamps are ISO 8601 strings (e.g., `"2026-03-22T14:30:00.000Z"`)
- [ ] **ID fields are numbers**: `id` and `landing_request_id` are JavaScript numbers, not strings
- [ ] **Reviewer object structure**: The `reviewer` field is an object with `id` (number) and `login` (string — the reviewer's username)

### Review Type Constraints

- [ ] **Type values**: The `type` field must be one of exactly four values: `"approve"`, `"comment"`, `"request_changes"`, `"pending"`
- [ ] **Approve with empty body**: Reviews of type `"approve"` may have an empty string `""` body
- [ ] **Pending with empty body**: Reviews of type `"pending"` may have an empty string `""` body
- [ ] **Comment requires body**: Reviews of type `"comment"` always have a non-empty body (enforced at creation time)
- [ ] **Request changes requires body**: Reviews of type `"request_changes"` always have a non-empty body (enforced at creation time)

### Review State Constraints

- [ ] **State values**: The `state` field must be one of exactly two values: `"submitted"` or `"dismissed"`
- [ ] **Both states are returned**: The list endpoint returns reviews in both `"submitted"` and `"dismissed"` states
- [ ] **No state filter**: The list endpoint does not accept a state filter parameter — all reviews are returned regardless of state
- [ ] **Dismissed reviews retain original type**: A dismissed review retains its original `type` value; only the `state` changes

### Edge Cases

- [ ] **Landing request with exactly one review**: Returns an array with one element and `X-Total-Count: 1`
- [ ] **Concurrent review creation during listing**: A review created after the count query but before the list query may cause the count to be one less than the actual items returned on the last page. This is acceptable eventual consistency
- [ ] **Reviews from deleted users**: If a user who submitted a review is subsequently deleted, the review should still be returned. If the user cannot be resolved, the API should handle this gracefully rather than returning a 500 error
- [ ] **Reviews with very long bodies**: Review bodies up to 65,535 characters are returned in full. No server-side truncation occurs on the list endpoint
- [ ] **Reviews with unicode content**: Reviews with emoji (🎉), CJK characters (漢字), RTL text (مرحبا), and special symbols (→ ≠ ∞) are returned with exact character fidelity
- [ ] **Reviews with markdown content**: Review bodies containing headings, code blocks, links, bold, italic, and tables are returned verbatim — no server-side rendering or sanitization
- [ ] **Multiple reviews by the same reviewer**: A reviewer may submit multiple reviews on the same landing request. All reviews are returned chronologically — the list endpoint does not deduplicate by reviewer
- [ ] **All reviews dismissed**: If every review on a landing request has been dismissed, the list returns all of them with `state: "dismissed"` and an accurate `X-Total-Count`
- [ ] **Mixed types and states**: A landing request may have reviews of all four types and both states. They appear interleaved in chronological order
- [ ] **Reviewer with special characters in username**: Usernames containing hyphens, underscores, and numbers are returned correctly
- [ ] **Zero change IDs on the landing request**: Reviews are listable even if the landing request has zero associated change IDs

### Boundary Constraints

- [ ] `per_page` range: 1–100 (integer)
- [ ] `page` range: 1–∞ (positive integer)
- [ ] `type` values: `"approve"`, `"comment"`, `"request_changes"`, `"pending"`
- [ ] `state` values: `"submitted"`, `"dismissed"`
- [ ] `body` maximum length: 65,535 characters
- [ ] `reviewer.login` maximum length: 39 characters
- [ ] `X-Total-Count` header: non-negative integer as string

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/landings/:number/reviews`

**Path Parameters**:
- `owner` (string, required): Repository owner username or organization name
- `repo` (string, required): Repository name
- `number` (integer, required): Landing request number within the repository

**Query Parameters**:
- `page` (integer, optional): 1-indexed page number. Default: 1
- `per_page` (integer, optional): Number of reviews per page. Default: 30. Maximum: 100

**Request Headers**:
- `Authorization: Bearer <PAT>` or session cookie (optional for public repos, required for private repos)

**Success Response** (`200 OK`):

Response Headers:
```
X-Total-Count: 5
```

Response Body:
```json
[
  {
    "id": 1,
    "landing_request_id": 37,
    "reviewer": { "id": 42, "login": "alice" },
    "type": "approve",
    "body": "",
    "state": "submitted",
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-20T10:00:00.000Z"
  },
  {
    "id": 2,
    "landing_request_id": 37,
    "reviewer": { "id": 55, "login": "bob" },
    "type": "request_changes",
    "body": "The error handling in the SSE reconnection path needs a `close()` call before re-creating the EventSource.",
    "state": "submitted",
    "created_at": "2026-03-20T11:30:00.000Z",
    "updated_at": "2026-03-20T11:30:00.000Z"
  },
  {
    "id": 3,
    "landing_request_id": 37,
    "reviewer": { "id": 42, "login": "alice" },
    "type": "comment",
    "body": "I agree with Bob — the cleanup path needs fixing.",
    "state": "dismissed",
    "created_at": "2026-03-20T14:00:00.000Z",
    "updated_at": "2026-03-21T09:00:00.000Z"
  }
]
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Missing or invalid owner, repo, number, or pagination params | `{ "message": "<specific error>" }` |
| `404 Not Found` | Repository does not exist, landing request does not exist, or private repo without access | `{ "message": "not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |
| `500 Internal Server Error` | Unexpected server failure | `{ "message": "internal server error" }` |

### SDK Shape

The `LandingService` in `@codeplane/sdk` exposes:

```typescript
listLandingReviews(
  viewer: User | null,
  owner: string,
  repo: string,
  number: number,
  page: number,
  perPage: number,
): Promise<Result<{ items: LandingReviewResponse[]; total: number }, APIError>>
```

Where:
```typescript
interface LandingReviewResponse {
  id: number;
  landing_request_id: number;
  reviewer: LandingRequestAuthor;
  type: string;
  body: string;
  state: string;
  created_at: string;
  updated_at: string;
}

interface LandingRequestAuthor {
  id: number;
  login: string;
}
```

The service method:
1. Resolves the landing request via `resolveReadableLanding()`, which validates the repository exists, the viewer has read access, and the landing request exists.
2. Normalizes pagination via `normalizePage()` (default 30, max 100, computes offset).
3. Queries `listLandingRequestReviews()` with `ORDER BY created_at ASC, id ASC`, `LIMIT`, and `OFFSET`.
4. Queries `countLandingRequestReviews()` for the total count.
5. Maps each row to `LandingReviewResponse`, resolving reviewers through an in-memory cache to avoid redundant user lookups.

### CLI Command

**Command**: `codeplane land reviews <number> [--repo OWNER/REPO] [--page N] [--per-page N] [--json]`

**Arguments**:
- `number` (positional, required): The landing request number whose reviews to list.

**Options**:
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.
- `--page` (optional): Page number (1-indexed). Default: 1.
- `--per-page` (optional): Number of reviews per page. Default: 30. Maximum: 100.
- `--json` (flag, optional): Output the raw JSON array of review objects.

**Output (default)**:
```
#1 ✓ @alice approved                                          2 days ago
   (no body)

#2 ✗ @bob request_changes                                     1 day ago
   The error handling in the SSE reconnection path needs a
   `close()` call before re-creating the EventSource.

#3 ● @alice comment [dismissed]                                1 day ago
   I agree with Bob — the cleanup path needs fixing.

Showing 3 of 5 reviews (page 1)
```

**Output (`--json`)**: The raw JSON array as returned by the API.

**Error handling**: Errors are routed through `handleLandingApiError()` which maps HTTP status codes to user-friendly CLI error messages:
- 404: `"Landing request #<number> not found in <owner>/<repo>."`
- 401: `"Authentication required. Run 'codeplane auth login'."`
- Network error: `"Failed to connect to Codeplane server."`

**Note**: The existing `land view` command already fetches reviews via `GET /api/repos/:owner/:repo/landings/:number/reviews?page=1&per_page=100` and includes them in the landing view output. The `land reviews` command provides a dedicated, paginated view.

### Web UI Design

**Location**: Landing request detail view at `/:owner/:repo/landings/:number`, rendered as a "Reviews" tab within the landing detail tab system.

**Tab Label**: "Reviews (N)" where N is the total count of submitted (non-dismissed) reviews. When N > 99, display as "Reviews (99+)".

**Summary Bar**: A single-line bar at the top of the reviews tab content area showing review status at a glance:
- Format: "N reviews · M approved · P changes requested"
- Counts only submitted (non-dismissed) reviews
- For protected bookmarks with required approvals: appends "· M of K required approvals" with a green checkmark when met or a yellow indicator when unmet

**Review List Section**:
- Positioned below the summary bar
- Reviews render as a vertical stack of review cards, each containing:
  - **Review type indicator**: Colored icon — green checkmark (approve), red cross (request_changes), blue circle (comment), gray circle (pending). Alongside a text label: "Approved", "Changes requested", "Comment", or "Pending"
  - **Reviewer line**: Avatar (if available) + `@username` (linked to user profile) + relative timestamp (e.g., "2 hours ago", "3 days ago"). Timestamps beyond 30 days display as absolute dates (e.g., "Feb 14, 2026")
  - **State badge**: For dismissed reviews, display a "Dismissed" badge in muted color. The entire review card is visually muted to distinguish dismissed reviews from active ones
  - **Body**: Rendered markdown with syntax-highlighted code blocks, clickable links, blockquotes, tables, task lists, and inline code. Approve reviews with empty bodies display the type indicator and reviewer line only
  - **Edited indicator**: If `updated_at` differs from `created_at`, show "(edited)" next to the timestamp

**Pagination**:
- Initial load fetches the first 30 reviews
- "Load more reviews" button appears at the bottom when `X-Total-Count` exceeds loaded count
- Loading skeleton/spinner while next page is fetched

**Empty State**: "No reviews yet." For authenticated write-access users, add "Submit a review" CTA.

**Loading State**: 3 skeleton placeholder cards with animated shimmer.

**Error State**: "Failed to load reviews." with "Retry" button.

### TUI UI

**Location**: Landing request detail screen, Reviews tab (keyboard `2` or `Tab`/`Shift+Tab` cycling).

**Tab Label**: "Reviews (N)" — N abbreviated as "99+" above 99.

**Summary Bar**: "N reviews · M approved · P changes requested" (adapts to terminal width).

**Review Entry**: Type icons (✓ green, ✗ red, ● blue, ○ gray), dismissed = strikethrough + muted, focused = reverse video primary accent.

**Responsive Breakpoints**:
- 80×24: Icon + @username + timestamp; body hidden, expand via Enter
- 120×40: + type label; first 3 lines of body visible
- 200×60+: Full body, summary bar with reviewer names

**Keyboard**: `j`/`k` navigate, `n`/`p` jump, `Enter` expand, `G`/`gg` endpoints, `Ctrl+D`/`Ctrl+U` page, `r` review form, `d` dismiss, `R` retry, `Tab`/`Shift+Tab` cycle tabs, `q` back.

**Pagination**: Page size 20, memory cap 200, 80% scroll trigger.

### VS Code Extension

Landing request reviews are visible through the landing request detail webview, which embeds the web UI's review tab. No separate VS Code-native review list is required.

### Neovim Plugin

Reviews can be listed via `:Codeplane land reviews <number>` or by viewing a landing request detail which includes reviews.

### Documentation

- **API Reference** (`docs/api-reference/landings.mdx`): Document `GET /api/repos/:owner/:repo/landings/:number/reviews` — parameters, pagination, response schema, review `type`/`state` fields, `X-Total-Count`, error codes, curl example
- **CLI Reference** (`docs/cli/land.mdx`): Document `land reviews` subcommand — arguments, options, pagination, default and `--json` output, examples
- **Landing Request Guide** (`docs/guides/landing-requests.mdx`): Explain review types (approve, request_changes, comment, pending), review states (submitted, dismissed), and protected bookmark approval requirements

## Permissions & Security

### Authorization Matrix

| Role | Can List Reviews? | Notes |
|------|-------------------|-------|
| **Repository Owner** | ✅ Yes | Full access |
| **Organization Admin** | ✅ Yes | Org-level admin implies repo read access |
| **Repository Admin** | ✅ Yes | Explicit admin on repo |
| **Team Member (write)** | ✅ Yes | Write implies read |
| **Team Member (read)** | ✅ Yes | Read access is sufficient for listing reviews |
| **Collaborator (write)** | ✅ Yes | Write implies read |
| **Collaborator (read)** | ✅ Yes | Read access is sufficient for listing reviews |
| **Authenticated (public repo, no explicit access)** | ✅ Yes | Public repos are readable by all authenticated users |
| **Anonymous / Unauthenticated (public repo)** | ✅ Yes | Public repos are readable anonymously |
| **Anonymous / Unauthenticated (private repo)** | ❌ No | Returns `404 Not Found` |
| **Authenticated (private repo, no access)** | ❌ No | Returns `404 Not Found` (not 403, to avoid leaking repo existence) |

### Rate Limiting

- **Per-user rate limit**: 300 requests per minute per authenticated user for the review list endpoint
- **Anonymous rate limit**: 60 requests per minute per IP address for unauthenticated access to public repositories
- **Global rate limit**: Inherits from the platform-wide API rate limiting middleware
- **PAT-based access**: Subject to the same rate limits as session-based access
- **`429 Too Many Requests`** response includes `Retry-After` header

### Data Privacy

- **PII exposure**: The `reviewer.login` and `reviewer.id` fields expose the identity of review authors. This is intentional — reviews are public attributions in a forge context
- **Review bodies**: Review bodies may contain `@mentions` referencing other usernames. Bodies may also contain user-authored content that could include sensitive information. The API does not filter or redact body content
- **Private repository protection**: For private repositories, the entire review list is gated behind read access. Unauthorized users receive `404` to prevent existence leakage
- **No body preview in headers**: The `X-Total-Count` header exposes only the count of reviews, not any body content, which is safe for logging and caching layers
- **No email addresses or tokens**: No email addresses, tokens, or credentials are included in the review list response

### Input Safety

- Review bodies are returned as-is from the database. Client-side rendering must sanitize markdown to prevent XSS when rendering to HTML (web UI)
- The `reviewer.login` field is rendered as text, not as executable content
- Pagination parameters are validated as integers on the server before use in queries — no SQL injection vector

## Telemetry & Product Analytics

### Business Events

**Event: `LandingReviewListed`**

Properties:
- `landing_request_id` (number): The internal landing request ID
- `landing_request_number` (number): The landing request number within the repo
- `repository_id` (string): The repository ID
- `repository_owner` (string): The repository owner name
- `repository_name` (string): The repository name
- `actor_id` (number | null): The authenticated user ID, or null for anonymous access
- `page` (number): The requested page number
- `per_page` (number): The requested page size
- `total_reviews` (number): The total review count from `X-Total-Count`
- `returned_count` (number): The number of reviews actually returned in this page
- `approved_count` (number): Reviews in this page with type `approve` and state `submitted`
- `changes_requested_count` (number): Reviews in this page with type `request_changes` and state `submitted`
- `comment_count` (number): Reviews in this page with type `comment` and state `submitted`
- `pending_count` (number): Reviews in this page with type `pending` and state `submitted`
- `dismissed_count` (number): Reviews in this page with state `dismissed`
- `source` (string): Client surface (`web`, `cli`, `tui`, `api`, `agent`, `vscode`, `neovim`)
- `is_authenticated` (boolean): Whether the request was authenticated
- `latency_ms` (number): Server-side processing time in milliseconds

**Event: `LandingReviewListViewed`**

Fired once per user session per landing request when reviews tab/list is first displayed:
- `landing_request_number` (number)
- `repository_owner` (string)
- `repository_name` (string)
- `source` (string)
- `total_reviews` (number)
- `approved_count` (number)
- `changes_requested_count` (number)
- `landing_state` (string): Current state of the landing request

**Event: `LandingReviewListPaginated`**

Fired when the user loads additional pages:
- `landing_request_number` (number)
- `repository_owner` (string)
- `repository_name` (string)
- `source` (string)
- `page_number` (number)
- `items_loaded_total` (number)
- `total_count` (number)

**Event: `LandingReviewListEmpty`**

Fired when user views a landing request with zero reviews:
- `landing_request_number` (number)
- `repository_owner` (string)
- `repository_name` (string)
- `source` (string)
- `landing_state` (string)

**Event: `LandingReviewListError`**

Fired on API failure:
- `landing_request_number` (number)
- `repository_owner` (string)
- `repository_name` (string)
- `source` (string)
- `error_type` (string): `network`, `timeout`, `auth`, `not_found`, `rate_limited`, `server_error`
- `http_status` (number | null)

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Review list load rate | — | Number of review list requests per day |
| Pagination depth | Average < 2 pages | Most reviews reviewable within first page |
| Page-2+ rate | > 10% for active repos | Indicates substantive multi-reviewer discussions |
| Empty landing request rate | < 50% | High values indicate landing requests not being reviewed |
| Error rate | < 0.5% | Percentage of requests resulting in 4xx/5xx |
| Cross-surface distribution | Web > 40%, CLI > 15%, TUI > 5% | Healthy multi-surface usage |
| Review-to-landing ratio | > 1.0 | Average reviews per landing request |
| P50 load time | < 500ms | Median time to data return |
| P95 load time | < 2000ms | 95th percentile load time |
| Approve-to-review ratio | 30–70% | Balance between approvals and other review types |

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `landing_review.listed` | `INFO` | `landing_request_id`, `landing_number`, `repo_id`, `repo_owner`, `repo_name`, `actor_id`, `page`, `per_page`, `total`, `returned_count`, `latency_ms` | On successful review list response |
| `landing_review.list_failed` | `WARN` | `landing_number`, `repo_owner`, `repo_name`, `actor_id`, `error_code`, `error_message` | On any non-2xx response |
| `landing_review.list_not_found` | `DEBUG` | `landing_number`, `repo_owner`, `repo_name`, `actor_id` | On 404 — landing request or repo not found |
| `landing_review.list_unauthorized` | `WARN` | `repo_owner`, `repo_name`, `request_ip` | On private repo access without credentials |
| `landing_review.list_pagination_invalid` | `WARN` | `repo_owner`, `repo_name`, `raw_page`, `raw_per_page` | On 400 — invalid pagination parameters |
| `landing_review.reviewer_resolve_failed` | `ERROR` | `landing_request_id`, `review_id`, `reviewer_id` | When a reviewer cannot be resolved from the user table |
| `landing_review.slow_query` | `WARN` | `repo_owner`, `repo_name`, `landing_number`, `page`, `per_page`, `duration_ms`, `total_count` | When query duration exceeds 1000ms |

All logs use structured JSON format with `request_id` for correlation.

### Prometheus Metrics

**Counters**:
- `codeplane_landing_reviews_listed_total` — Labels: `status` (`200`, `400`, `404`, `429`, `500`). Total review list API requests by status code
- `codeplane_landing_reviews_list_errors_total` — Labels: `error_type` (`validation`, `not_found`, `auth`, `rate_limited`, `internal`). Total failed review list requests by error category

**Histograms**:
- `codeplane_landing_review_list_duration_seconds` — Labels: none. Latency of review list requests. Buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`
- `codeplane_landing_review_list_result_count` — Labels: none. Distribution of result set sizes per request. Buckets: `[0, 1, 5, 10, 20, 30, 50, 100]`

**Gauges**:
- `codeplane_landing_review_list_inflight` — Labels: none. Number of review list requests currently in progress

### Alerts

#### Alert: `LandingReviewListErrorRateHigh`
- **Condition**: `rate(codeplane_landing_reviews_list_errors_total{error_type="internal"}[5m]) > 0.1` sustained for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_landing_reviews_list_errors_total` by `error_type` label to identify dominant error type
  2. If `internal` errors dominate: check server logs for `landing_review.list_failed` entries. Examine DB connection health and query latency
  3. Check if `listLandingRequestReviews` or `countLandingRequestReviews` SQL functions are failing — look for query timeout or connection pool exhaustion
  4. Check `landing_review.reviewer_resolve_failed` log entries. If reviewer resolution is failing for deleted users, consider adding a fallback placeholder reviewer object
  5. Check connection pool saturation via the inflight gauge. If high, consider increasing pool size
  6. Check recent deployments — consider rollback if error spike correlates with a deploy
  7. Verify database connectivity: `SELECT 1` against the primary database

#### Alert: `LandingReviewListLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_landing_review_list_duration_seconds_bucket[5m])) > 2` sustained for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency. The review list involves count + select + per-reviewer lookups — DB slowness compounds
  2. Run `EXPLAIN ANALYZE` on `listLandingRequestReviews` for a high-review-count landing. Ensure composite index on `(landing_request_id, created_at, id)`
  3. Check if high OFFSET values cause sequential scan overhead
  4. Check if reviewer resolution cache is defeated (many unique reviewers). Consider batch-loading reviewers
  5. Check PostgreSQL health: connection count, lock contention, vacuum status, disk I/O
  6. Consider keyset pagination on `(created_at, id)` for large review sets

#### Alert: `LandingReviewListNotFoundSpike`
- **Condition**: `rate(codeplane_landing_reviews_list_errors_total{error_type="not_found"}[5m]) > 10` sustained for 5 minutes
- **Severity**: Info
- **Runbook**:
  1. Check `landing_review.list_not_found` logs for specific repo/landing patterns
  2. If a single IP/user is generating 404s, may be scraping/probing — consider rate limiting or blocking
  3. If 404s correspond to recently deleted repos or purged landing requests, this is expected transient behavior

#### Alert: `LandingReviewListRateLimitSpike`
- **Condition**: `rate(codeplane_landing_reviews_list_errors_total{error_type="rate_limited"}[5m]) > 10` sustained for 3 minutes
- **Severity**: Info
- **Runbook**:
  1. Identify user/IP triggering rate limits from access logs
  2. Determine if legitimate automated client (CI, agent) or abuse
  3. If legitimate: consider higher rate-limit tier token
  4. If abuse: consider IP blocking or token revocation

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Invalid `page` parameter | 400 | Returns error with specific message | Client fixes parameter |
| Invalid `per_page` parameter | 400 | Returns error with specific message | Client fixes parameter |
| `per_page` > 100 | 400 | Returns "per_page must not exceed 100" | Client uses valid value |
| Landing request number not a number | 400 | Returns "invalid landing request number" | Client fixes parameter |
| Repository not found | 404 | Returns "not found" | Client verifies repo exists |
| Landing request not found | 404 | Returns "not found" | Client verifies number |
| Private repo without auth | 404 | Returns "not found" (not 401) | Client authenticates |
| Rate limit exceeded | 429 | Returns with `Retry-After` header | Client waits |
| DB count query fails | 500 | Entire request fails | Auto retry; check DB health |
| DB list query fails | 500 | Entire request fails | Auto retry; check DB health |
| Reviewer resolution fails | 500 | Entire request fails | Check deleted users; add fallback |
| Query timeout | 500 | Check query performance | Index optimization |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **API-LREV-LIST-001**: `GET /api/repos/:owner/:repo/landings/:number/reviews` returns `200` with empty array when landing request has no reviews
- [ ] **API-LREV-LIST-002**: Create 3 reviews (approve, request_changes, comment) then list. Verify `200`, array of 3 elements, `X-Total-Count: 3`
- [ ] **API-LREV-LIST-003**: Reviews are ordered by `created_at` ascending (oldest first)
- [ ] **API-LREV-LIST-004**: Verify each review has all required fields: `id` (positive number), `landing_request_id` (number), `reviewer` (object with `id` and `login`), `type` (string), `body` (string), `state` (string), `created_at` (valid ISO 8601), `updated_at` (valid ISO 8601)
- [ ] **API-LREV-LIST-005**: `reviewer` field is an object with exactly `id` (number) and `login` (string)
- [ ] **API-LREV-LIST-006**: `X-Total-Count` header is present and matches actual total
- [ ] **API-LREV-LIST-007**: Reviews on a closed landing request are still listable (`200`)
- [ ] **API-LREV-LIST-008**: Reviews on a merged landing request are still listable (`200`)
- [ ] **API-LREV-LIST-009**: Reviews on a draft landing request are still listable (`200`)
- [ ] **API-LREV-LIST-010**: Reviews on an archived repository's landing request are still listable (`200`)
- [ ] **API-LREV-LIST-011**: Unauthenticated request to public repo returns reviews (`200`)
- [ ] **API-LREV-LIST-012**: Authenticated request with PAT returns reviews (`200`)
- [ ] **API-LREV-LIST-013**: Landing request with exactly one review returns array with one element and `X-Total-Count: 1`
- [ ] **API-LREV-LIST-014**: Multiple reviews by the same reviewer are all returned (no deduplication)
- [ ] **API-LREV-LIST-015**: Both submitted and dismissed reviews are returned in the same list
- [ ] **API-LREV-LIST-016**: Dismissed reviews retain their original `type` value
- [ ] **API-LREV-LIST-017**: `created_at` and `updated_at` are valid ISO 8601 timestamps ending with `.000Z`

#### Review Type Tests

- [ ] **API-LREV-LIST-018**: Review with `type: "approve"` and empty body is returned correctly
- [ ] **API-LREV-LIST-019**: Review with `type: "approve"` and non-empty body is returned correctly
- [ ] **API-LREV-LIST-020**: Review with `type: "comment"` has a non-empty body
- [ ] **API-LREV-LIST-021**: Review with `type: "request_changes"` has a non-empty body
- [ ] **API-LREV-LIST-022**: Review with `type: "pending"` is returned correctly
- [ ] **API-LREV-LIST-023**: Mixed types (all four) appear in chronological order

#### Review State Tests

- [ ] **API-LREV-LIST-024**: All reviews dismissed — list returns all with `state: "dismissed"` and correct `X-Total-Count`
- [ ] **API-LREV-LIST-025**: Mixed states (submitted and dismissed) returned in chronological order
- [ ] **API-LREV-LIST-026**: Dismissed review has `updated_at` different from `created_at`

#### Pagination Tests

- [ ] **API-LREV-LIST-027**: Default pagination (no params) returns at most 30 reviews
- [ ] **API-LREV-LIST-028**: Create 35 reviews. GET without pagination params. Verify 30 returned, `X-Total-Count: 35`
- [ ] **API-LREV-LIST-029**: `?page=1&per_page=10` returns exactly 10 reviews when more exist
- [ ] **API-LREV-LIST-030**: `?page=2&per_page=10` returns items 11–20
- [ ] **API-LREV-LIST-031**: Last partial page returns remaining reviews correctly
- [ ] **API-LREV-LIST-032**: Page beyond results returns empty array with correct `X-Total-Count`
- [ ] **API-LREV-LIST-033**: `?per_page=1` returns exactly 1 review
- [ ] **API-LREV-LIST-034**: `?per_page=100` returns up to 100 reviews (maximum valid size)
- [ ] **API-LREV-LIST-035**: `?per_page=101` returns `400 Bad Request`
- [ ] **API-LREV-LIST-036**: `?per_page=0` returns `400 Bad Request`
- [ ] **API-LREV-LIST-037**: `?per_page=-1` returns `400 Bad Request`
- [ ] **API-LREV-LIST-038**: `?page=0` returns `400 Bad Request`
- [ ] **API-LREV-LIST-039**: `?page=-1` returns `400 Bad Request`
- [ ] **API-LREV-LIST-040**: `?page=abc` returns `400 Bad Request`
- [ ] **API-LREV-LIST-041**: Full traversal: create 75 reviews, fetch pages 1–3 with `per_page=30`. Verify 30 + 30 + 15 = 75 total with no duplicates and no gaps
- [ ] **API-LREV-LIST-042**: Consistent ordering across pages: last review on page N has earlier `created_at` (or equal and lower `id`) than first review on page N+1

#### Content Tests

- [ ] **API-LREV-LIST-043**: Review body with 65,535 characters is returned in full (maximum valid body size)
- [ ] **API-LREV-LIST-044**: Review body with unicode: emoji (🎉), CJK (漢字), RTL (مرحبا), special symbols (→ ≠ ∞) round-trip correctly
- [ ] **API-LREV-LIST-045**: Review body with markdown (headings, code blocks, links, bold, italic, tables) returned verbatim
- [ ] **API-LREV-LIST-046**: Reviewer with hyphens, underscores, numbers in username returned correctly

#### Access Control Tests

- [ ] **API-LREV-LIST-047**: Private repo, authenticated with read access returns `200`
- [ ] **API-LREV-LIST-048**: Private repo, authenticated without access returns `404`
- [ ] **API-LREV-LIST-049**: Private repo, unauthenticated returns `404`
- [ ] **API-LREV-LIST-050**: Public repo, unauthenticated returns `200`

#### Error Handling Tests

- [ ] **API-LREV-LIST-051**: Non-existent repository returns `404`
- [ ] **API-LREV-LIST-052**: Non-existent owner returns `404`
- [ ] **API-LREV-LIST-053**: Non-existent landing request number returns `404`
- [ ] **API-LREV-LIST-054**: Landing request number `"abc"` returns `400`
- [ ] **API-LREV-LIST-055**: Landing request number `0` returns `404`
- [ ] **API-LREV-LIST-056**: Landing request number `-1` returns `400` or `404`
- [ ] **API-LREV-LIST-057**: Landing request number `"1.5"` returns `400`
- [ ] **API-LREV-LIST-058**: Creating a review then listing shows it at the end (newest by `created_at`)
- [ ] **API-LREV-LIST-059**: Response time for landing request with 100 reviews is under 2 seconds

### CLI E2E Tests

- [ ] **CLI-LREV-LIST-001**: `land reviews <number> --repo OWNER/REPO` returns formatted review list
- [ ] **CLI-LREV-LIST-002**: `land reviews <number> --json` returns valid JSON array matching API response shape
- [ ] **CLI-LREV-LIST-003**: Each review in default output shows type indicator (✓/✗/●/○), reviewer, type, and timestamp
- [ ] **CLI-LREV-LIST-004**: Dismissed reviews show `[dismissed]` indicator in default output
- [ ] **CLI-LREV-LIST-005**: `land reviews <number> --page 2 --per-page 5` returns correct subset
- [ ] **CLI-LREV-LIST-006**: `land reviews 99999` for non-existent landing request shows user-friendly error
- [ ] **CLI-LREV-LIST-007**: `land reviews <number>` without `--repo` resolves repo from working directory
- [ ] **CLI-LREV-LIST-008**: Empty reviews state outputs "No reviews on landing request #N"
- [ ] **CLI-LREV-LIST-009**: `land reviews <number> --per-page 100` returns up to 100 results (max valid)
- [ ] **CLI-LREV-LIST-010**: `land reviews <number> --json` includes all fields: `id`, `landing_request_id`, `reviewer`, `type`, `body`, `state`, `created_at`, `updated_at`
- [ ] **CLI-LREV-LIST-011**: Creating a review then running `land reviews` includes it in the result
- [ ] **CLI-LREV-LIST-012**: `land view <number>` also includes reviews in its output (existing integration)

### Web UI E2E Tests (Playwright)

- [ ] **WEB-LREV-LIST-001**: Navigating to `/:owner/:repo/landings/:number` and selecting Reviews tab renders the review list
- [ ] **WEB-LREV-LIST-002**: Reviews tab label shows count: "Reviews (N)"
- [ ] **WEB-LREV-LIST-003**: Summary bar shows "N reviews · M approved · P changes requested"
- [ ] **WEB-LREV-LIST-004**: Each review shows type indicator, reviewer username, timestamp, and body
- [ ] **WEB-LREV-LIST-005**: Approve review shows green checkmark indicator
- [ ] **WEB-LREV-LIST-006**: Request changes review shows red cross indicator
- [ ] **WEB-LREV-LIST-007**: Comment review shows blue circle indicator
- [ ] **WEB-LREV-LIST-008**: Dismissed review shows "Dismissed" badge and muted styling
- [ ] **WEB-LREV-LIST-009**: Approve review with empty body renders without empty body placeholder
- [ ] **WEB-LREV-LIST-010**: Empty state displays "No reviews yet." message
- [ ] **WEB-LREV-LIST-011**: Loading skeleton appears while reviews are loading
- [ ] **WEB-LREV-LIST-012**: Error state shows "Failed to load reviews." with "Retry" button
- [ ] **WEB-LREV-LIST-013**: Click "Retry" after error reloads reviews successfully
- [ ] **WEB-LREV-LIST-014**: Pagination: create 35 reviews, initial load shows 30, "Load more" loads remaining
- [ ] **WEB-LREV-LIST-015**: Markdown renders in review body (code blocks, bold, links)
- [ ] **WEB-LREV-LIST-016**: Reviewer username links to user profile
- [ ] **WEB-LREV-LIST-017**: Relative timestamps display correctly
- [ ] **WEB-LREV-LIST-018**: Timestamps beyond 30 days display as absolute dates
- [ ] **WEB-LREV-LIST-019**: Reviews tab loads within 3 seconds for landing request with 50 reviews

### TUI E2E Tests

- [ ] **TUI-LREV-LIST-001**: Reviews tab renders at 120×40 with populated reviews — summary bar, icons, type labels, body previews
- [ ] **TUI-LREV-LIST-002**: Reviews tab renders at 80×24 minimum — icon + username + timestamp only, bodies hidden
- [ ] **TUI-LREV-LIST-003**: Empty state shows "No reviews yet. Press r to submit a review."
- [ ] **TUI-LREV-LIST-004**: `j`/`k` navigation moves focus between review entries
- [ ] **TUI-LREV-LIST-005**: `Enter` expands/collapses body at compact terminal size (80×24)
- [ ] **TUI-LREV-LIST-006**: `r` opens review submission form
- [ ] **TUI-LREV-LIST-007**: `d` on focused review shows dismiss confirmation dialog
- [ ] **TUI-LREV-LIST-008**: Dismiss confirmation → Enter confirms → review state updates to dismissed
- [ ] **TUI-LREV-LIST-009**: Dismiss confirmation → Esc cancels → no state change
- [ ] **TUI-LREV-LIST-010**: Dismissed review shows strikethrough muted styling
- [ ] **TUI-LREV-LIST-011**: Summary bar counts update after dismiss
- [ ] **TUI-LREV-LIST-012**: Pagination triggers when scrolling past 80% of loaded content
- [ ] **TUI-LREV-LIST-013**: Memory cap of 200 reviews shows cap message
- [ ] **TUI-LREV-LIST-014**: Error state shows "Press R to retry"
- [ ] **TUI-LREV-LIST-015**: `R` retries failed request
- [ ] **TUI-LREV-LIST-016**: Tab switch preserves review state on return
- [ ] **TUI-LREV-LIST-017**: Review type icons render with correct ANSI colors
- [ ] **TUI-LREV-LIST-018**: Resize preserves focus and recalculates layout

### Cross-Surface Consistency Tests

- [ ] **XSURF-LREV-LIST-001**: Create a review via API, list via CLI — review appears with matching fields
- [ ] **XSURF-LREV-LIST-002**: Create a review via CLI, list via API — review appears with matching fields
- [ ] **XSURF-LREV-LIST-003**: Dismiss a review via API, verify dismissed state appears in CLI list and web UI
- [ ] **XSURF-LREV-LIST-004**: All clients (API, CLI, web, TUI) return the same `X-Total-Count` for the same landing request
- [ ] **XSURF-LREV-LIST-005**: Review ordering is consistent across all clients (oldest first by `created_at`, then `id`)

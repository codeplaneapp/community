# LANDING_COMMENT_LIST

Specification for LANDING_COMMENT_LIST.

## High-Level User POV

When a user opens a landing request in Codeplane — whether from the web application, terminal UI, CLI, or an editor integration — they see the full chronological conversation that has taken place on that landing request. The comment list is the primary collaboration surface for code review discussion: it presents every comment made by humans and agents in the order they were posted, giving the reader a clear timeline of review feedback, questions, technical discussion, and decisions.

Landing request comments are richer than issue comments because they can be tied to specific locations in the diff. A comment may be a general discussion comment on the landing request as a whole, or it may be an inline comment anchored to a specific file path, line number, and side of the diff (the "before" or "after" version of the code). This dual nature — general comments and inline diff comments displayed together — gives reviewers a complete picture of all feedback in a single chronological stream.

A user navigates to a landing request and the comment list loads automatically beneath the landing request summary. Comments appear in chronological order (oldest first), each showing the author's username, a timestamp, and the full body. For inline comments, the file path and line number context are displayed alongside the comment so readers understand exactly which part of the code is under discussion. For landing requests with many comments, the list is paginated so that the initial page loads quickly and additional comments load on demand.

The comment list is available from every Codeplane surface. In the web UI, comments render inline on the landing request detail page with rich markdown formatting and diff-context annotations for inline comments. In the TUI, comments render as styled terminal text with file path and line number context clearly formatted. In the CLI, a user can fetch comments for a landing request and receive them as structured JSON output suitable for scripting, automation, and agent consumption. Through the API, any client or integration can paginate through the full comment history of a landing request.

For landing requests with hundreds of review comments — common on large change stacks — the paginated list ensures that performance remains acceptable. The total comment count is communicated via a response header so that clients can render accurate pagination controls without fetching every comment upfront.

## Acceptance Criteria

### Definition of Done

The landing request comment list is successfully implemented when:

- The API returns a paginated, chronologically ordered array of comments for a given landing request.
- The `X-Total-Count` response header accurately reflects the total number of comments on the landing request.
- Pagination via `page`/`per_page` query parameters works correctly.
- All client surfaces (web, TUI, CLI, editors) can consume and display the comment list.
- Private repository access controls are enforced — only users with read access can list comments.
- Inline diff comments include file path, line number, and side context.
- General (non-inline) comments are returned with empty/zero path, line, and default side values.
- The response shape matches the established `LandingCommentResponse` contract across all clients.

### Input Constraints

- [ ] **Owner is required**: The `owner` path parameter must be a non-empty string. Missing or empty owner returns `400 Bad Request`.
- [ ] **Repo is required**: The `repo` path parameter must be a non-empty string. Missing or empty repo returns `400 Bad Request`.
- [ ] **Landing request number is required**: The `number` path parameter must be a non-empty string. Missing or empty number returns `400 Bad Request`.
- [ ] **Landing request number must be a valid integer**: The `number` path parameter must parse as a valid positive integer. Non-integer values (e.g., `"abc"`, `"1.5"`) return `400 Bad Request`.
- [ ] **Landing request number must be positive**: Landing request number `0` or negative numbers should result in the landing request not being found (`404 Not Found`).

### Pagination Constraints

- [ ] **Default page size**: When no pagination parameters are provided, the default page size is 30.
- [ ] **Maximum page size**: The maximum allowed page size is 100. Requests for `per_page` > 100 are clamped to 100.
- [ ] **Minimum page size**: `per_page` must be a positive integer. Values ≤ 0 default to 30.
- [ ] **Page defaults to 1**: When `page` is not provided, it defaults to 1. Pages are 1-indexed.
- [ ] **Page beyond results**: Requesting a page beyond the total number of comments returns an empty array `[]` with the correct `X-Total-Count` header.

### Ordering

- [ ] **Chronological order**: Comments are returned in ascending chronological order by `created_at`, with ties broken by ascending `id`.
- [ ] **Order is not configurable**: The API does not accept a sort parameter. The order is always oldest-first.

### Repository and Landing Request Constraints

- [ ] **Repository must exist**: The repository identified by `owner/repo` must exist. A non-existent repository returns `404 Not Found`.
- [ ] **Private repository without access**: An authenticated user without access to a private repository receives `404 Not Found` (not `403`, to avoid leaking repository existence).
- [ ] **Private repository with read access**: An authenticated user with read access to a private repository can list comments.
- [ ] **Public repository**: Any user (authenticated or anonymous) can list comments on landing requests in public repositories.
- [ ] **Landing request must exist**: The landing request identified by `number` in the given repository must exist. A non-existent landing request returns `404 Not Found`.
- [ ] **Landing request state does not affect listing**: Comments are listable on open, merged, and closed landing requests.
- [ ] **Archived repository**: Comments on landing requests in archived repositories are still listable (archiving prevents writes, not reads).

### Response Contract

- [ ] **Status code**: `200 OK` on success.
- [ ] **Response body**: A JSON array of comment objects. Each object contains: `id` (number), `landing_request_id` (number), `author` (object with `id` (number) and `login` (string)), `path` (string), `line` (number), `side` (string — one of `"left"`, `"right"`, `"both"`), `body` (string), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
- [ ] **X-Total-Count header**: The response includes an `X-Total-Count` header with the total number of comments on the landing request (not just the current page count).
- [ ] **Empty landing request**: A landing request with zero comments returns an empty array `[]` with `X-Total-Count: 0`.
- [ ] **Timestamp format**: All timestamps are ISO 8601 strings (e.g., `"2026-03-22T14:30:00.000Z"`).
- [ ] **ID fields are numbers**: `id` and `landing_request_id` are JavaScript numbers, not strings.
- [ ] **Author object structure**: The `author` field is an object with `id` (number) and `login` (string — the author's username).
- [ ] **Inline comment fields**: For general comments (not anchored to a diff line), `path` is an empty string, `line` is `0`, and `side` defaults to `"right"`.

### Edge Cases

- [ ] **Landing request with exactly one comment**: Returns an array with one element and `X-Total-Count: 1`.
- [ ] **Concurrent comment creation during listing**: A comment created after the count query but before the list query may cause the count to be one less than the actual items returned on the last page. This is acceptable eventual consistency.
- [ ] **Comments from deleted users**: If a user who authored a comment is subsequently deleted, the comment should still be returned. If the user cannot be resolved, the API should handle this gracefully rather than returning a 500 error.
- [ ] **Comments with very long bodies**: Comments with bodies up to 65,535 characters are returned in full. No server-side truncation occurs on the list endpoint.
- [ ] **Comments with unicode content**: Comments with emoji (🎉), CJK characters (漢字), RTL text (مرحبا), and special symbols (→ ≠ ∞) are returned with exact character fidelity.
- [ ] **Comments with markdown content**: Comment bodies containing headings, code blocks, links, bold, italic, and tables are returned verbatim — no server-side rendering or sanitization.
- [ ] **Mix of general and inline comments**: A landing request may have both general comments (`path=""`, `line=0`) and inline comments (`path="src/foo.ts"`, `line=42`). Both types appear interleaved in chronological order.
- [ ] **Inline comment with side="left"**: Comments on the "before" side of the diff are correctly returned with `side: "left"`.
- [ ] **Inline comment with side="both"**: Comments spanning both sides of the diff are correctly returned with `side: "both"`.
- [ ] **Comment body with only whitespace**: Should not exist (creation rejects empty/whitespace-only bodies), but if present in the database, should be returned as-is.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/landings/:number/comments`

**Path Parameters**:
- `owner` (string, required): Repository owner username or organization name.
- `repo` (string, required): Repository name.
- `number` (integer, required): Landing request number within the repository.

**Query Parameters**:
- `page` (integer, optional): 1-indexed page number. Default: 1.
- `per_page` (integer, optional): Number of comments per page. Default: 30. Maximum: 100.

**Request Headers**:
- `Authorization: Bearer <PAT>` or session cookie (optional for public repos, required for private repos)

**Success Response** (`200 OK`):

Response Headers:
```
X-Total-Count: 12
```

Response Body:
```json
[
  {
    "id": 1,
    "landing_request_id": 5,
    "author": { "id": 1, "login": "alice" },
    "path": "",
    "line": 0,
    "side": "right",
    "body": "This change stack looks good overall. A few comments on the second change.",
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-20T10:00:00.000Z"
  },
  {
    "id": 2,
    "landing_request_id": 5,
    "author": { "id": 2, "login": "bob" },
    "path": "src/services/landing.ts",
    "line": 42,
    "side": "right",
    "body": "This null check should use `!== undefined` rather than a truthy check — `0` is a valid value here.",
    "created_at": "2026-03-20T11:30:00.000Z",
    "updated_at": "2026-03-20T12:00:00.000Z"
  }
]
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Missing or invalid owner, repo, number, or pagination params | `{ "message": "<specific error>" }` |
| `404 Not Found` | Repository does not exist, landing request does not exist, or private repo without access | `{ "message": "not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

### SDK Shape

The `LandingService` in `@codeplane/sdk` exposes:

```typescript
listLandingComments(
  viewer: User | null,
  owner: string,
  repo: string,
  number: number,
  page: number,
  perPage: number
): Promise<Result<{ items: LandingCommentResponse[]; total: number }, APIError>>
```

Where:
```typescript
interface LandingCommentResponse {
  id: number;
  landing_request_id: number;
  author: LandingRequestAuthor;
  path: string;
  line: number;
  side: string;
  body: string;
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
3. Queries `listLandingRequestComments()` with `ORDER BY created_at ASC, id ASC`, `LIMIT`, and `OFFSET`.
4. Queries `countLandingRequestComments()` for the total count.
5. Maps each row to `LandingCommentResponse`, resolving authors through an in-memory cache to avoid redundant user lookups.

### CLI Command

**Command**: `codeplane land comments <number> [--repo OWNER/REPO] [--page N] [--per-page N] [--json]`

**Arguments**:
- `number` (positional, required): The landing request number whose comments to list.

**Options**:
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.
- `--page` (optional): Page number (1-indexed). Default: 1.
- `--per-page` (optional): Number of comments per page. Default: 30. Maximum: 100.
- `--json` (flag, optional): Output the raw JSON array of comment objects.

**Output (default)**:
```
#1 @alice · 2 days ago
  This change stack looks good overall. A few comments on the second change.

#2 @bob · 1 day ago [src/services/landing.ts:42 (right)]
  This null check should use `!== undefined` rather than a truthy check —
  `0` is a valid value here.

Showing 2 of 12 comments (page 1)
```

**Output (`--json`)**: The raw JSON array as returned by the API.

**Error handling**: Errors are routed through `handleLandingApiError()` which maps HTTP status codes to user-friendly CLI error messages:
- 404: `"Landing request #<number> not found in <owner>/<repo>."`
- 401: `"Authentication required. Run 'codeplane auth login'."`
- Network error: `"Failed to connect to Codeplane server."`

### Web UI Design

**Location**: Landing request detail view at `/:owner/:repo/landings/:number`

**Comment List Section**:
- Positioned below the landing request summary and change stack, separated by a visual divider.
- Section header: "Comments (N)" where N is the total comment count.
- Comments render as a vertical stack of comment cards, each containing:
  - **Author line**: Avatar (if available) + `@username` (linked to user profile) + relative timestamp (e.g., "2 hours ago", "3 days ago"). Timestamps beyond 30 days display as absolute dates (e.g., "Feb 14, 2026").
  - **Inline context badge** (for inline comments only): A code-styled badge showing `file/path.ts:42 (right)` that links to the corresponding location in the diff viewer. General comments do not show this badge.
  - **Body**: Rendered markdown with syntax-highlighted code blocks, clickable links, rendered images, blockquotes, tables, task lists, and inline code.
  - **Edited indicator**: If `updated_at` differs from `created_at`, show "(edited)" next to the timestamp with a tooltip showing the last edit time.

**Pagination**:
- Initial load fetches the first 30 comments.
- A "Load more comments" button appears at the bottom when `X-Total-Count` exceeds the loaded count.
- Alternatively, infinite scroll triggers loading the next page when the user scrolls near the bottom.
- A loading skeleton/spinner appears while the next page is being fetched.
- The total count displayed in the section header remains accurate throughout pagination.

**Empty State**:
- When the landing request has zero comments, display: "No comments yet." followed by the comment creation form for authenticated users with write access.

**Loading State**:
- While the initial comment list is loading, display skeleton placeholder cards (3 placeholder cards with animated shimmer).

**Error State**:
- If the comment list fails to load, display an inline error: "Failed to load comments." with a "Retry" button.

### TUI UI

**Location**: Landing request detail screen, below the landing request summary.

**Section Separator**: `─── Comments (N) ───` where N is the total comment count.

**Comment Rendering**:
- Each comment displays as:
  - First line: `@username` (bold, primary color) + relative timestamp (dim/muted text)
  - Second line (inline comments only): `  📎 file/path.ts:42 (right)` (dim, distinct style)
  - Following lines: Comment body rendered as styled terminal text with basic markdown support (bold, italic, code blocks as indented blocks, inline code with backtick styling).
  - Empty line between comments as visual separator.

**Pagination**:
- First 30 comments load when the landing detail screen opens.
- Next page loads automatically at 80% scroll depth.
- Maximum 500 comments held in memory. If exceeded, show: `"Showing latest 500 comments. Use the API for full history."`

**Navigation Keybindings**:
- `j` / `k`: Scroll up/down through comments.
- `n` / `p`: Jump to next/previous comment.
- `Enter` on an inline comment: Navigate to the diff viewer at the referenced file and line.
- Focused comment highlighted with a left-side vertical accent bar (`│` in primary color).

### Editor Integrations

**VS Code**: Landing request comments are visible through the landing request detail webview, which embeds the web UI's comment list. No separate VS Code-native comment list is required.

**Neovim**: Comments can be listed via the CLI integration: `:Codeplane land comments <number>` or through a Telescope picker for browsing landing request comments.

### Documentation

The following documentation must be provided:

- **API Reference** (`docs/api-reference/landings.mdx`): Document the `GET /api/repos/:owner/:repo/landings/:number/comments` endpoint with query parameters, pagination behavior, response schema including the inline-comment fields (`path`, `line`, `side`), `X-Total-Count` header semantics, error codes, and a curl example.
- **CLI Reference** (`docs/cli/land.mdx`): Document the `land comments` subcommand with arguments, options, pagination flags, default and `--json` output formats, and example usage showing both general and inline comments.
- **Landing Request Guide** (`docs/guides/landing-requests.mdx`): Reference the comment list as part of the landing request review workflow, explaining the difference between general comments and inline diff comments.

## Permissions & Security

### Authorization Matrix

| Role | Can List Comments? | Notes |
|------|---------------------|-------|
| **Repository Owner** | ✅ Yes | Full access |
| **Organization Admin** | ✅ Yes | Org-level admin implies repo read access |
| **Repository Admin** | ✅ Yes | Explicit admin on repo |
| **Team Member (write)** | ✅ Yes | Write implies read |
| **Team Member (read)** | ✅ Yes | Read access is sufficient for listing comments |
| **Collaborator (write)** | ✅ Yes | Write implies read |
| **Collaborator (read)** | ✅ Yes | Read access is sufficient for listing comments |
| **Authenticated (public repo, no explicit access)** | ✅ Yes | Public repos are readable by all authenticated users |
| **Anonymous / Unauthenticated (public repo)** | ✅ Yes | Public repos are readable anonymously |
| **Anonymous / Unauthenticated (private repo)** | ❌ No | Returns `404 Not Found` |
| **Authenticated (private repo, no access)** | ❌ No | Returns `404 Not Found` (not 403, to avoid leaking repo existence) |

### Rate Limiting

- **Per-user rate limit**: 60 requests per minute per authenticated user for comment list endpoints.
- **Anonymous rate limit**: 30 requests per minute per IP address for unauthenticated access to public repositories.
- **Global rate limit**: Inherits from the platform-wide API rate limiting middleware.
- **PAT-based access**: Subject to the same rate limits as session-based access.

### Data Privacy

- **PII exposure**: The `author.login` and `author.id` fields expose the identity of comment authors. This is intentional — comments are public attributions in a forge context.
- **Inline comment paths**: The `path` field may reveal internal file structure for private repositories. This is acceptable because the comment list is gated behind repository read access.
- **Comment bodies**: Comment bodies may contain @mentions referencing other usernames. Bodies may also contain user-authored content that could include sensitive information. The API does not filter or redact body content.
- **Private repository protection**: For private repositories, the entire comment list is gated behind read access. Unauthorized users receive `404` to prevent existence leakage.
- **No body preview in headers**: The `X-Total-Count` header exposes only the count of comments, not any body content, which is safe for logging and caching layers.

## Telemetry & Product Analytics

### Business Events

**Event: `LandingCommentListed`**

Properties:
- `landing_request_id` (number): The internal landing request ID.
- `landing_request_number` (number): The landing request number within the repo.
- `repository_id` (string): The repository ID.
- `repository_owner` (string): The repository owner name.
- `repository_name` (string): The repository name.
- `actor_id` (number | null): The authenticated user ID, or null for anonymous access.
- `page` (number): The requested page number.
- `per_page` (number): The requested page size.
- `total_comments` (number): The total comment count from `X-Total-Count`.
- `returned_count` (number): The number of comments actually returned in this page.
- `inline_comment_count` (number): The number of comments in this page where `path` is non-empty (inline diff comments).
- `general_comment_count` (number): The number of comments in this page where `path` is empty (general comments).
- `source` (string): The client surface that requested the list (`"web"`, `"cli"`, `"tui"`, `"api"`, `"agent"`, `"vscode"`, `"neovim"`).
- `is_authenticated` (boolean): Whether the request was authenticated.
- `latency_ms` (number): Server-side processing time in milliseconds.

### Funnel Metrics & Success Indicators

- **Comment list load rate**: Number of landing comment list requests per day. Indicates engagement with landing request review flows.
- **Pagination depth**: Distribution of page numbers requested. Higher pages indicate landing requests with rich review discussion — a sign of deep code review engagement.
- **Page-2+ rate**: Percentage of comment list requests for page > 1. High values suggest landing requests have substantive review discussions.
- **Inline vs. general ratio**: Ratio of inline diff comments to general comments. Higher inline ratios suggest reviewers are engaging with the code at the line level, which correlates with higher review quality.
- **Cross-surface distribution**: Breakdown of comment list requests by source. Healthy product shows usage across web, CLI, TUI, and API.
- **Empty landing request rate**: Percentage of comment list requests that return zero comments. High values may indicate landing requests are being created but not reviewed.
- **Error rate**: Percentage of comment list requests that result in 4xx or 5xx. Should remain below 0.5%.
- **Comment-to-landing ratio**: Average number of comments per landing request. Used as a proxy for review culture health.

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `landing_comment.listed` | `INFO` | `landing_request_id`, `landing_number`, `repo_id`, `repo_owner`, `repo_name`, `actor_id`, `page`, `per_page`, `total`, `returned_count`, `latency_ms` | On successful comment list response |
| `landing_comment.list_failed` | `WARN` | `landing_number`, `repo_owner`, `repo_name`, `actor_id`, `error_code`, `error_message` | On any non-2xx response |
| `landing_comment.list_not_found` | `DEBUG` | `landing_number`, `repo_owner`, `repo_name`, `actor_id` | On 404 — landing request or repo not found |
| `landing_comment.list_unauthorized` | `WARN` | `repo_owner`, `repo_name`, `request_ip` | On private repo access without credentials |
| `landing_comment.list_pagination_invalid` | `WARN` | `repo_owner`, `repo_name`, `raw_page`, `raw_per_page` | On 400 — invalid pagination parameters |
| `landing_comment.author_resolve_failed` | `ERROR` | `landing_request_id`, `comment_id`, `user_id` | When an author cannot be resolved from the user table (e.g., deleted user) |

### Prometheus Metrics

**Counters**:
- `codeplane_landing_comments_listed_total` — Labels: `repo_owner`, `source` (`web`/`cli`/`tui`/`api`/`agent`). Total successful comment list requests.
- `codeplane_landing_comments_list_errors_total` — Labels: `error_code` (`400`, `404`, `429`, `500`). Total failed comment list requests.

**Histograms**:
- `codeplane_landing_comment_list_duration_seconds` — Labels: `source`. Latency of comment list requests (DB count + list query). Buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]`.
- `codeplane_landing_comment_list_result_count` — Labels: none. Distribution of result set sizes per request. Buckets: `[0, 1, 5, 10, 20, 30, 50, 100]`.

**Gauges**:
- `codeplane_landing_comment_list_inflight` — Labels: none. Number of comment list requests currently in progress.

### Alerts

#### Alert: `LandingCommentListErrorRateHigh`
- **Condition**: `rate(codeplane_landing_comments_list_errors_total{error_code=~"5.."}[5m]) > 0.1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_landing_comments_list_errors_total` by `error_code` label to identify the dominant error type.
  2. If `500` errors dominate: check server logs for `landing_comment.list_failed` entries. Examine DB connection health and query latency. Check if `listLandingRequestComments` or `countLandingRequestComments` is failing.
  3. Check PostgreSQL query performance. The list query uses `ORDER BY created_at ASC, id ASC` with `LIMIT`/`OFFSET` — if the `landing_request_comments` table is very large and missing an index on `(landing_request_id, created_at, id)`, queries on landing requests with many comments may time out.
  4. Check `landing_comment.author_resolve_failed` log entries. If author resolution is failing for deleted users, the error originates in the author cache resolution path and may need a fallback to a placeholder author object.
  5. Check connection pool saturation via the inflight gauge. If high, consider increasing pool size or identifying slow-running queries from other features.
  6. If `429` errors dominate: review rate limit configuration. Check if a scraper or misbehaving client is hammering the endpoint.

#### Alert: `LandingCommentListLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_landing_comment_list_duration_seconds_bucket[5m])) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency metrics. The comment list involves two sequential queries (count + select with pagination), so DB slowness has a compounding effect.
  2. Run `EXPLAIN ANALYZE` on the `listLandingRequestComments` query for a high-comment-count landing request. Ensure the `landing_request_comments` table has a composite index on `(landing_request_id, created_at, id)`.
  3. Check if high `OFFSET` values are causing sequential scan overhead. Landing requests with thousands of comments where users request high page numbers will have expensive offset-based pagination.
  4. Check if the author resolution cache is being defeated. If every comment has a unique author, the cache provides no benefit and each comment triggers a separate user lookup query. Consider batch-loading authors.
  5. Check overall PostgreSQL health: connection count, lock contention, vacuum status, disk I/O.
  6. If the issue is offset-based performance on very large comment sets, consider migrating to keyset (cursor) pagination on `(created_at, id)` instead of offset.

#### Alert: `LandingCommentListNotFoundSpike`
- **Condition**: `rate(codeplane_landing_comments_list_errors_total{error_code="404"}[5m]) > 10` sustained for 5 minutes.
- **Severity**: Info
- **Runbook**:
  1. A spike in 404s may indicate a client bug generating requests for non-existent landing requests or repositories.
  2. Check structured logs for `landing_comment.list_not_found` entries to identify the specific `repo_owner`/`repo_name`/`landing_number` patterns.
  3. If a single IP or user is generating the 404s, they may be scraping or probing. Consider whether rate limiting or blocking is appropriate.
  4. If the 404s correspond to recently deleted repositories or merged/closed landing requests that have been purged, this is expected transient behavior.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| DB count query fails | Returns `500 Internal Server Error`. No partial response. | Automatic client retry. Check DB health. |
| DB list query fails | Returns `500 Internal Server Error`. No partial response. | Automatic client retry. Check DB health. |
| Count query succeeds but list query fails | Returns `500`. Count is not exposed in response. | No inconsistency — the entire request fails atomically. |
| Author resolution fails for a comment | Returns `500`. The entire request fails if any author cannot be resolved. | Check if the user was deleted. Consider adding a fallback "unknown user" author. |
| Landing request exists but all comments deleted | Returns `200` with empty array and `X-Total-Count: 0`. | Expected behavior. No action needed. |
| Very large offset (e.g., page 10000) | Returns `200` with empty array. May be slow due to offset scan. | The offset query may be expensive. Monitor latency alerts. |
| Repository deleted between auth check and query | Returns `404`. | Expected race condition. No data corruption. |
| Network timeout during response streaming | Client receives partial JSON or connection reset. | Client should retry. Server-side the request completes normally. |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **List comments on a landing request with comments**: Create a landing request, add 3 comments (mix of general and inline), then GET the comment list. Verify `200` status, the response is an array of 3 elements, `X-Total-Count` is `3`, comments are ordered by `created_at` ascending.
- [ ] **List comments on a landing request with no comments**: Create a landing request with no comments, GET the comment list. Verify `200` status, the response is an empty array `[]`, and `X-Total-Count` is `0`.
- [ ] **Verify comment field shapes**: List comments and verify each comment has: `id` (positive number), `landing_request_id` (number matching the landing request), `author` (object with `id` (number) and `login` (string)), `path` (string), `line` (non-negative number), `side` (string), `body` (non-empty string), `created_at` (valid ISO 8601), `updated_at` (valid ISO 8601).
- [ ] **Verify chronological ordering**: Create 5 comments with distinct bodies in sequence. List them and verify the order matches creation order (oldest first).
- [ ] **List comments on a closed landing request**: Close a landing request that has comments, then list its comments. Verify `200` and all comments are returned.
- [ ] **List comments on a merged landing request**: Merge a landing request that has comments, then list its comments. Verify `200` and all comments are returned.
- [ ] **List comments on an archived repository's landing request**: Archive a repository, then list comments on one of its landing requests. Verify `200` — read access is preserved on archived repos.
- [ ] **List comments as anonymous user on a public repo**: Without authentication, GET comments on a public repo landing request. Verify `200` and comments are returned.
- [ ] **List comments with PAT authentication**: Use a PAT in the `Authorization` header. Verify `200`.
- [ ] **Verify X-Total-Count header accuracy**: Add 5 comments to a landing request. List with `per_page=2`. Verify `X-Total-Count` is `5` regardless of the page size.
- [ ] **Verify inline comment fields**: Create a comment with `path="src/foo.ts"`, `line=42`, `side="right"`. List comments and verify the returned comment has these exact field values.
- [ ] **Verify general comment defaults**: Create a comment with no `path`, `line`, or `side` fields. List comments and verify `path` is `""`, `line` is `0`, and `side` is `"right"`.
- [ ] **Verify side="left" inline comment**: Create a comment with `side="left"`. List and verify `side` is `"left"`.
- [ ] **Verify side="both" inline comment**: Create a comment with `side="both"`. List and verify `side` is `"both"`.
- [ ] **Mix of general and inline comments**: Create 2 general comments and 3 inline comments. List all. Verify 5 comments returned with correct field values for each type, all in chronological order.
- [ ] **Verify comment with edited timestamp**: Create a comment, update its body (if update endpoint exists), then list comments. Verify the updated comment has `updated_at` different from `created_at`.
- [ ] **List comments with maximum body length**: Create a comment with a 65,535-character body. List comments. Verify the full body is returned without truncation.
- [ ] **List comments with body at maximum + 1 length**: Attempt to create a comment with a 65,536-character body. Verify the creation is rejected or the body is truncated predictably, then verify the list endpoint handles any stored comments correctly.
- [ ] **Verify comment with markdown content**: Create a comment with headings, code blocks, links, bold, italic, images, and tables. List comments. Verify the body is returned verbatim.
- [ ] **Verify comment with unicode content**: Create comments with emoji (🎉), CJK characters (漢字), RTL text (مرحبا), and special symbols (→ ≠ ∞). List comments. Verify exact round-trip of all characters.
- [ ] **Author object structure**: List comments and verify `author` is an object with exactly `id` (number) and `login` (string), not a flat `user_id` or `commenter` string.

#### Pagination Tests

- [ ] **Default pagination (no params)**: Create 35 comments. GET without pagination params. Verify 30 comments returned and `X-Total-Count` is `35`.
- [ ] **Explicit page 1**: Create 25 comments. GET with `?page=1&per_page=10`. Verify 10 comments returned, `X-Total-Count` is `25`.
- [ ] **Page 2**: Create 25 comments. GET with `?page=2&per_page=10`. Verify 10 comments returned, starting from the 11th comment.
- [ ] **Last partial page**: Create 25 comments. GET with `?page=3&per_page=10`. Verify 5 comments returned.
- [ ] **Page beyond results**: Create 5 comments. GET with `?page=2&per_page=10`. Verify empty array `[]` returned with `X-Total-Count: 5`.
- [ ] **per_page=1**: Create 3 comments. GET with `?per_page=1`. Verify exactly 1 comment returned.
- [ ] **per_page=100 (maximum)**: Create 150 comments. GET with `?per_page=100`. Verify exactly 100 comments returned.
- [ ] **per_page exceeds maximum (101)**: GET with `?per_page=101`. Verify the value is clamped to 100 (returns at most 100 results).
- [ ] **Full traversal**: Create 75 comments. Fetch page 1 (`per_page=30`), page 2 (`per_page=30`), and page 3 (`per_page=30`). Verify 30 + 30 + 15 = 75 total comments with no duplicates and no gaps.
- [ ] **Consistent ordering across pages**: Create 50 comments. Fetch pages 1 and 2 with `per_page=25`. Verify the last comment on page 1 has an earlier `created_at` (or equal `created_at` and lower `id`) than the first comment on page 2.

#### Access Control Tests

- [ ] **Private repo, authenticated with read access**: Verify `200` and comments are returned.
- [ ] **Private repo, authenticated without access**: Verify `404 Not Found`.
- [ ] **Private repo, unauthenticated**: Verify `404 Not Found`.
- [ ] **Public repo, unauthenticated**: Verify `200` and comments are returned.

#### Error Handling Tests

- [ ] **Non-existent repository**: GET comments for a non-existent `owner/repo`. Verify `404`.
- [ ] **Non-existent landing request number**: GET comments for a valid repo but non-existent landing number. Verify `404`.
- [ ] **Landing request number is not a number**: GET with `number="abc"`. Verify `400`.
- [ ] **Landing request number is zero**: GET with `number=0`. Verify `404`.
- [ ] **Landing request number is negative**: GET with `number=-1`. Verify `400` or `404`.
- [ ] **Landing request number is a float**: GET with `number="1.5"`. Verify `400`.

### CLI Tests

- [ ] **List comments via CLI**: Create a landing request with comments, run `codeplane land comments <number> --repo OWNER/REPO`. Verify output shows comment authors, timestamps, and bodies.
- [ ] **List comments via CLI with --json**: Run with `--json` flag. Verify output is a valid JSON array matching the API response shape.
- [ ] **List comments with pagination flags**: Run with `--page 2 --per-page 5`. Verify the correct subset of comments is returned.
- [ ] **CLI error for non-existent landing request**: Run `codeplane land comments 99999 --repo OWNER/REPO`. Verify a user-friendly error message.
- [ ] **CLI resolves repo from working directory**: Inside a repository with a jj remote configured, run `codeplane land comments <number>` without `--repo`. Verify comments are fetched from the correct repository.
- [ ] **Inline comment context in CLI output**: Verify inline comments show `[file/path.ts:42 (right)]` context in default (non-JSON) output.

### Web UI E2E Tests (Playwright)

- [ ] **Comment list renders on landing detail page**: Navigate to a landing request with comments. Verify the comment list section is visible with the correct comment count in the header.
- [ ] **Comments display author and timestamp**: Verify each comment shows the author username and a formatted timestamp.
- [ ] **Inline comment shows file path badge**: Create an inline comment on `src/foo.ts:42`. Navigate to the landing detail. Verify the comment displays a file path badge.
- [ ] **General comment does not show file path badge**: Verify general comments do not display a file/line badge.
- [ ] **Empty state**: Navigate to a landing request with no comments. Verify the "No comments yet." empty state is displayed.
- [ ] **Pagination loads more comments**: Create 35 comments. Navigate to the landing detail. Verify the first 30 are shown. Click "Load more" or scroll to trigger pagination. Verify additional comments appear.
- [ ] **Loading skeleton on initial load**: Navigate to a landing request. Verify skeleton placeholder cards appear while comments are loading (intercept network to slow the response).
- [ ] **Error state with retry**: Intercept the comment list API to return 500. Navigate to the landing detail. Verify the error message "Failed to load comments." and a "Retry" button are shown. Click retry and verify comments load on success.
- [ ] **Markdown renders in comment body**: Create a comment with markdown (code block, bold, link). Verify the body renders as formatted HTML, not raw markdown.
- [ ] **Edited indicator**: Create a comment, edit it. Navigate to the landing detail. Verify "(edited)" appears next to the timestamp.

### TUI Tests

- [ ] **Comments section renders in landing detail**: Open a landing request in the TUI. Verify the `─── Comments (N) ───` section header appears.
- [ ] **Comment navigation with j/k**: Verify `j` and `k` keys scroll through comments and the focused comment is highlighted with a vertical accent bar.
- [ ] **Inline comment shows file context**: Verify inline comments display the `📎 file/path.ts:42 (right)` context line.
- [ ] **Empty state**: Open a landing request with no comments. Verify the comment section shows the zero-count header and no comment entries.

# ISSUE_COMMENT_LIST

Specification for ISSUE_COMMENT_LIST.

## High-Level User POV

When a user opens an issue in Codeplane — whether from the web application, terminal UI, CLI, or an editor integration — they see the full chronological conversation that has happened on that issue. The comment list is the backbone of issue collaboration: it presents every comment made by humans and agents in the order they were posted, giving the reader a clear timeline of discussion, investigation, decisions, and progress toward resolution.

A user navigates to an issue and the comment list loads automatically beneath the issue body. Comments appear in chronological order (oldest first), each showing the author's username, a relative or absolute timestamp, and the full markdown-rendered body. For issues with many comments, the list is paginated so that the first page loads quickly and additional comments load on demand as the user scrolls or requests the next page.

The comment list is available from every Codeplane surface. In the web UI, comments render inline on the issue detail page with rich markdown formatting, code syntax highlighting, and embedded media. In the TUI, comments render as styled terminal text beneath a clear separator. In the CLI, a user can fetch comments for an issue and receive them as structured JSON output suitable for scripting, automation, and agent consumption. Through the API, any client or integration can paginate through the full comment history of an issue.

The comment list also serves as the foundation for related collaboration features. Each comment in the list carries the information needed for users to react with emoji, edit their own comments, or delete comments they authored. Timeline events — such as label changes, assignee updates, and state transitions — may be interleaved with comments in certain UI surfaces to provide a unified activity feed, but the comment list API itself returns only user-authored comments in a clean, predictable shape.

For large issues with hundreds of comments, the paginated list ensures that performance remains acceptable and that clients can load exactly the window of comments they need. The total comment count is communicated via a response header so that clients can render accurate pagination controls and progress indicators without fetching every comment upfront.

## Acceptance Criteria

### Definition of Done

The comment list is successfully implemented when:

- The API returns a paginated, chronologically ordered array of comments for a given issue.
- The `X-Total-Count` response header accurately reflects the total number of comments on the issue.
- Both cursor-based and legacy page/per_page pagination modes work correctly.
- All client surfaces (web, TUI, CLI, editors) can consume and display the comment list.
- Private repository access controls are enforced — only users with read access can list comments.
- The response shape matches the established `IssueCommentResponse` contract across all clients.

### Input Constraints

- [ ] **Owner is required**: The `owner` path parameter must be a non-empty string. Missing or empty owner returns `400 Bad Request` with message `"owner is required"`.
- [ ] **Repo is required**: The `repo` path parameter must be a non-empty string. Missing or empty repo returns `400 Bad Request` with message `"repository name is required"`.
- [ ] **Issue number is required**: The `number` path parameter must be a non-empty string. Missing or empty number returns `400 Bad Request` with message `"issue number is required"`.
- [ ] **Issue number must be a valid integer**: The `number` path parameter must parse as a valid integer. Non-integer values (e.g., `"abc"`, `"1.5"`) return `400 Bad Request` with message `"invalid issue number"`.
- [ ] **Issue number must be positive**: Issue number `0` or negative numbers should result in the issue not being found (`404 Not Found`).

### Pagination Constraints

- [ ] **Default page size**: When no pagination parameters are provided, the default page size is 30.
- [ ] **Maximum page size**: The maximum allowed page size is 100. Requests for `per_page` > 100 return `400 Bad Request` with message `"per_page must not exceed 100"`. Requests for `limit` > 100 are silently clamped to 100.
- [ ] **Minimum page size**: `per_page` or `limit` must be a positive integer. Values ≤ 0 return `400 Bad Request`.
- [ ] **Cursor-based pagination**: Accepts `cursor` and `limit` query parameters. An empty cursor returns the first page. The cursor is an opaque offset string.
- [ ] **Legacy pagination**: Accepts `page` and `per_page` query parameters. `page` defaults to 1. Pages are 1-indexed.
- [ ] **Invalid page value**: Non-integer or non-positive `page` values return `400 Bad Request` with message `"invalid page value"`.
- [ ] **Invalid limit value**: Non-integer or non-positive `limit` values return `400 Bad Request` with message `"invalid limit value"`.
- [ ] **Page beyond results**: Requesting a page beyond the total number of comments returns an empty array `[]` with the correct `X-Total-Count` header.

### Ordering

- [ ] **Chronological order**: Comments are returned in ascending chronological order by `created_at`, with ties broken by ascending `id`.
- [ ] **Order is not configurable**: The API does not accept a sort parameter. The order is always oldest-first.

### Repository and Issue Constraints

- [ ] **Repository must exist**: The repository identified by `owner/repo` must exist. A non-existent repository returns `404 Not Found`.
- [ ] **Private repository without access**: An authenticated user without access to a private repository receives `404 Not Found` (not `403`, to avoid leaking repository existence).
- [ ] **Private repository with read access**: An authenticated user with read access to a private repository can list comments.
- [ ] **Public repository**: Any user (authenticated or anonymous) can list comments on issues in public repositories.
- [ ] **Issue must exist**: The issue identified by the `number` in the given repository must exist. A non-existent issue returns `404 Not Found`.
- [ ] **Issue state does not affect listing**: Comments are listable on both open and closed issues.
- [ ] **Archived repository**: Comments on issues in archived repositories are still listable (archiving prevents writes, not reads).

### Response Contract

- [ ] **Status code**: `200 OK` on success.
- [ ] **Response body**: A JSON array of comment objects. Each object contains: `id` (number), `issue_id` (number), `user_id` (number), `commenter` (string — username), `body` (string), `type` (string — always `"comment"`), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
- [ ] **X-Total-Count header**: The response includes an `X-Total-Count` header with the total number of comments on the issue (not just the current page count).
- [ ] **Empty issue**: An issue with zero comments returns an empty array `[]` with `X-Total-Count: 0`.
- [ ] **Timestamp format**: All timestamps are ISO 8601 strings (e.g., `"2026-03-22T14:30:00.000Z"`).
- [ ] **ID fields are numbers**: `id`, `issue_id`, and `user_id` are JavaScript numbers, not strings.
- [ ] **Type field**: The `type` field is always `"comment"` for user-authored comments.

### Edge Cases

- [ ] **Issue with exactly one comment**: Returns an array with one element and `X-Total-Count: 1`.
- [ ] **Requesting with both cursor and page params**: When both `cursor` and `page` query params are present, legacy pagination (`page`/`per_page`) takes precedence since the presence of `page` or `per_page` is checked first.
- [ ] **Concurrent comment creation during listing**: A comment created after the count query but before the list query may cause the count to be one less than the actual items returned on the last page. This is acceptable eventual consistency.
- [ ] **Comments from deleted users**: If a user who authored a comment is subsequently deleted, the comment remains in the list with the original `commenter` username preserved.
- [ ] **Comments with very long bodies**: Comments with bodies up to 65,535 characters are returned in full. No server-side truncation occurs on the list endpoint.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/issues/:number/comments`

**Path Parameters**:
- `owner` (string, required): Repository owner username or organization name.
- `repo` (string, required): Repository name.
- `number` (integer, required): Issue number within the repository.

**Query Parameters (cursor-based pagination)**:
- `cursor` (string, optional): Opaque pagination cursor. Empty or absent for the first page.
- `limit` (integer, optional): Number of comments to return. Default: 30. Maximum: 100.

**Query Parameters (legacy pagination)**:
- `page` (integer, optional): 1-indexed page number. Default: 1.
- `per_page` (integer, optional): Number of comments per page. Default: 30. Maximum: 100.

**Request Headers**:
- `Authorization: Bearer <PAT>` or session cookie (optional for public repos, required for private repos)

**Success Response** (`200 OK`):

Response Headers:
```
X-Total-Count: 42
```

Response Body:
```json
[
  {
    "id": 1,
    "issue_id": 7,
    "user_id": 1,
    "commenter": "alice",
    "body": "I can reproduce this on the latest main bookmark.",
    "type": "comment",
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-20T10:00:00.000Z"
  },
  {
    "id": 2,
    "issue_id": 7,
    "user_id": 2,
    "commenter": "bob",
    "body": "The root cause is in the `resolveBookmark` function. See change `kxqpznmt`.",
    "type": "comment",
    "created_at": "2026-03-20T11:30:00.000Z",
    "updated_at": "2026-03-20T12:00:00.000Z"
  }
]
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Missing or invalid owner, repo, number, or pagination params | `{ "message": "<specific error>" }` |
| `404 Not Found` | Repository does not exist, issue does not exist, or private repo without access | `{ "message": "not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

### SDK Shape

The `IssueService` in `@codeplane/sdk` exposes:

```typescript
listIssueComments(
  viewer: AuthUser | null,
  owner: string,
  repo: string,
  number: number,
  page: number,
  perPage: number
): Promise<{ items: IssueCommentResponse[]; total: number }>
```

Where:
```typescript
interface IssueCommentResponse {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;
  created_at: string;
  updated_at: string;
}
```

The service method:
1. Resolves the issue via `resolveReadableIssue()`, which validates the repository exists and the viewer has read access.
2. Normalizes pagination via `normalizePage()` (default 30, max 100, computes offset).
3. Queries `dbCountIssueCommentsByIssue()` for the total count.
4. Queries `dbListIssueComments()` with `ORDER BY created_at ASC, id ASC`, `LIMIT`, and `OFFSET`.
5. Maps each row to `IssueCommentResponse` via `mapIssueComment()`.

### CLI Command

**Command**: `codeplane issue comments <number> [--repo OWNER/REPO] [--page N] [--per-page N] [--json]`

**Arguments**:
- `number` (positional, required): The issue number whose comments to list.

**Options**:
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.
- `--page` (optional): Page number (1-indexed). Default: 1.
- `--per-page` (optional): Number of comments per page. Default: 30. Maximum: 100.
- `--json` (flag, optional): Output the raw JSON array of comment objects.

**Output (default)**:
```
#1 @alice · 2 days ago
  I can reproduce this on the latest main bookmark.

#2 @bob · 1 day ago
  The root cause is in the `resolveBookmark` function.
  See change `kxqpznmt`.

Showing 2 of 42 comments (page 1)
```

**Output (`--json`)**: The raw JSON array as returned by the API.

**Error handling**: Errors are routed through `handleIssueApiError()` which maps HTTP status codes to user-friendly CLI error messages:
- 404: `"Issue #<number> not found in <owner>/<repo>."`
- 401: `"Authentication required. Run 'codeplane auth login'."`
- Network error: `"Failed to connect to Codeplane server."`

### Web UI Design

**Location**: Issue detail view at `/:owner/:repo/issues/:number`

**Comment List Section**:
- Positioned below the issue body, separated by a horizontal rule or visual divider.
- Section header: "Comments (N)" where N is the total comment count from the issue's `comment_count` field.
- Comments render as a vertical stack of comment cards, each containing:
  - **Author line**: Avatar (if available) + `@username` (linked to user profile) + relative timestamp (e.g., "2 hours ago", "3 days ago"). Timestamps beyond 30 days display as absolute dates (e.g., "Feb 14, 2026").
  - **Body**: Rendered markdown with syntax-highlighted code blocks, clickable links, rendered images, blockquotes, tables, task lists, and inline code.
  - **Actions**: Each comment shows subtle action icons on hover — edit (pencil) and delete (trash) for the comment author's own comments. Reaction picker appears on hover.
  - **Edited indicator**: If `updated_at` differs from `created_at`, show "(edited)" next to the timestamp with a tooltip showing the last edit time.

**Pagination**:
- Initial load fetches the first 30 comments.
- A "Load more comments" button appears at the bottom when `X-Total-Count` exceeds the loaded count.
- Alternatively, infinite scroll triggers loading the next page when the user scrolls near the bottom.
- A loading skeleton/spinner appears while the next page is being fetched.
- The total count displayed in the section header remains accurate throughout pagination.

**Empty State**:
- When the issue has zero comments, display: "No comments yet. Be the first to comment." (followed by the comment creation form for authenticated users).

**Loading State**:
- While the initial comment list is loading, display skeleton placeholder cards (3 placeholder cards with animated shimmer).

**Error State**:
- If the comment list fails to load, display an inline error: "Failed to load comments." with a "Retry" button.

### TUI UI

**Location**: Issue detail screen, below the issue body.

**Section Separator**: `─── Comments (N) ───` where N is the total comment count.

**Comment Rendering**:
- Each comment displays as:
  - First line: `@username` (bold, primary color) + relative timestamp (dim/muted text)
  - Following lines: Comment body rendered as styled terminal text with basic markdown support (bold, italic, code blocks as indented blocks, inline code with backtick styling).
  - Empty line between comments as visual separator.

**Timeline Interleaving**:
- Timeline events (label changes, assignee changes, state transitions) may be interleaved with comments in chronological order.
- Timeline events render as single-line entries with a distinct style (e.g., dim text with a `·` prefix): `· @alice added label 'bug' · 3 hours ago`

**Pagination**:
- First 30 items load when the issue detail screen opens.
- Next page loads automatically at 80% scroll depth.
- Maximum 500 items held in memory. If exceeded, show: `"Showing latest 500 items. Use the API for full history."`

**Navigation Keybindings**:
- `j` / `k`: Scroll up/down through comments.
- `n` / `p`: Jump to next/previous comment (skipping timeline events).
- Focused comment highlighted with a left-side vertical accent bar (e.g., `│` in primary color).

**Author Indicators**:
- Comments authored by the current user show `[edit]` and `[delete]` indicators after the timestamp.

### Editor Integrations

**VS Code**: Issue comments are visible through the issue detail webview, which embeds the web UI's comment list. No separate VS Code-native comment list is needed.

**Neovim**: Comments can be listed via the CLI integration: `:Codeplane issue comments <number>` or through Telescope picker for browsing comments.

### Documentation

The following documentation must be provided:

- **API Reference** (`docs/api-reference/issues.mdx`): Document the `GET /api/repos/:owner/:repo/issues/:number/comments` endpoint with query parameters, pagination behavior, response schema, `X-Total-Count` header semantics, error codes, and a curl example demonstrating both cursor-based and legacy pagination.
- **CLI Reference** (`docs/cli/issue.mdx`): Document the `issue comments` subcommand with arguments, options, pagination flags, default and `--json` output formats, and example usage.
- **Pagination Guide** (`docs/guides/pagination.mdx`): Reference this endpoint as an example of the platform's dual cursor/page pagination model, explaining how to iterate through all comments.

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

- **PII exposure**: The `commenter` and `user_id` fields expose the identity of comment authors. This is intentional — comments are public attributions in a forge context.
- **Comment bodies**: Comment bodies may contain @mentions referencing other usernames. Bodies may also contain user-authored content that could include sensitive information. The API does not filter or redact body content.
- **Private repository protection**: For private repositories, the entire comment list is gated behind read access. Unauthorized users receive `404` to prevent existence leakage.
- **No body preview in headers**: The `X-Total-Count` header exposes only the count of comments, not any body content, which is safe for logging and caching layers.

## Telemetry & Product Analytics

### Business Events

**Event: `IssueCommentListed`**

Properties:
- `issue_id` (number): The issue ID whose comments were listed.
- `issue_number` (number): The issue number.
- `repository_id` (string): The repository ID.
- `repository_owner` (string): The repository owner name.
- `repository_name` (string): The repository name.
- `actor_id` (number | null): The authenticated user ID, or null for anonymous access.
- `page` (number): The requested page number.
- `per_page` (number): The requested page size.
- `total_comments` (number): The total comment count from `X-Total-Count`.
- `returned_count` (number): The number of comments actually returned in this page.
- `source` (string): The client surface that requested the list (`"web"`, `"cli"`, `"tui"`, `"api"`, `"agent"`, `"vscode"`, `"neovim"`).
- `is_authenticated` (boolean): Whether the request was authenticated.
- `latency_ms` (number): Server-side processing time in milliseconds.

### Funnel Metrics & Success Indicators

- **Comment list load rate**: Number of comment list requests per day. Indicates engagement with issue detail views.
- **Pagination depth**: Distribution of page numbers requested. Higher pages indicate users reading through long discussions — a sign of deep engagement.
- **Page-2+ rate**: Percentage of comment list requests for page > 1. High values suggest issues have rich discussions and users are reading them.
- **Cross-surface distribution**: Breakdown of comment list requests by source. Healthy product shows usage across web, CLI, TUI, and API.
- **Empty issue rate**: Percentage of comment list requests that return zero comments. High values may indicate issues are created but not discussed.
- **Error rate**: Percentage of comment list requests that result in 4xx or 5xx. Should remain below 0.5%.
- **Cache hit rate**: If caching is introduced, the percentage of requests served from cache vs. database.

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `issue_comment.listed` | `INFO` | `issue_id`, `issue_number`, `repo_id`, `repo_owner`, `repo_name`, `actor_id`, `page`, `per_page`, `total`, `returned_count`, `latency_ms` | On successful comment list response |
| `issue_comment.list_failed` | `WARN` | `issue_number`, `repo_owner`, `repo_name`, `actor_id`, `error_code`, `error_message` | On any non-2xx response |
| `issue_comment.list_not_found` | `DEBUG` | `issue_number`, `repo_owner`, `repo_name`, `actor_id` | On 404 — issue or repo not found |
| `issue_comment.list_unauthorized` | `WARN` | `repo_owner`, `repo_name`, `request_ip` | On private repo access without credentials |
| `issue_comment.list_pagination_invalid` | `WARN` | `repo_owner`, `repo_name`, `raw_page`, `raw_per_page`, `raw_cursor`, `raw_limit` | On 400 — invalid pagination parameters |

### Prometheus Metrics

**Counters**:
- `codeplane_issue_comments_listed_total` — Labels: `repo_owner`, `source` (`web`/`cli`/`tui`/`api`/`agent`). Total successful comment list requests.
- `codeplane_issue_comments_list_errors_total` — Labels: `error_code` (`400`, `404`, `429`, `500`). Total failed comment list requests.

**Histograms**:
- `codeplane_issue_comment_list_duration_seconds` — Labels: `source`. Latency of comment list requests (DB count + list query). Buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]`.
- `codeplane_issue_comment_list_result_count` — Labels: none. Distribution of result set sizes per request. Buckets: `[0, 1, 5, 10, 20, 30, 50, 100]`.

**Gauges**:
- `codeplane_issue_comment_list_inflight` — Labels: none. Number of comment list requests currently in progress.

### Alerts

#### Alert: `IssueCommentListErrorRateHigh`
- **Condition**: `rate(codeplane_issue_comments_list_errors_total{error_code=~"5.."}[5m]) > 0.1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_comments_list_errors_total` by `error_code` label to identify the dominant error type.
  2. If `500` errors dominate: check server logs for `issue_comment.list_failed` entries. Examine DB connection health and query latency. Check if `dbListIssueComments` or `dbCountIssueCommentsByIssue` is failing.
  3. Check PostgreSQL query performance. The list query uses `ORDER BY created_at ASC, id ASC` with `LIMIT`/`OFFSET` — if the `issue_comments` table is very large and missing an index on `(issue_id, created_at, id)`, queries on issues with many comments may time out.
  4. Check connection pool saturation via the inflight gauge. If high, consider increasing pool size or identifying slow-running queries from other features.
  5. If `429` errors dominate: review rate limit configuration. Check if a scraper or misbehaving client is hammering the endpoint.

#### Alert: `IssueCommentListLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_comment_list_duration_seconds_bucket[5m])) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency metrics. The comment list involves two sequential queries (count + select with pagination), so DB slowness has a compounding effect.
  2. Run `EXPLAIN ANALYZE` on the `dbListIssueComments` query for a high-comment-count issue. Ensure the `issue_comments` table has a composite index on `(issue_id, created_at, id)`.
  3. Check if high `OFFSET` values are causing sequential scan overhead. Issues with thousands of comments where users request high page numbers will have expensive offset-based pagination.
  4. Check overall PostgreSQL health: connection count, lock contention, vacuum status, disk I/O.
  5. If the issue is offset-based performance on very large comment sets, consider migrating to keyset (cursor) pagination on `(created_at, id)` instead of offset.

#### Alert: `IssueCommentListNotFoundSpike`
- **Condition**: `rate(codeplane_issue_comments_list_errors_total{error_code="404"}[5m]) > 10` sustained for 5 minutes.
- **Severity**: Info
- **Runbook**:
  1. A spike in 404s may indicate a client bug generating requests for non-existent issues or repositories.
  2. Check structured logs for `issue_comment.list_not_found` entries to identify the specific `repo_owner`/`repo_name`/`issue_number` patterns.
  3. If a single IP or user is generating the 404s, they may be scraping or probing. Consider whether rate limiting or blocking is appropriate.
  4. If the 404s correspond to recently deleted repositories or issues, this is expected transient behavior.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| DB count query fails | Returns `500 Internal Server Error`. No partial response. | Automatic client retry. Check DB health. |
| DB list query fails | Returns `500 Internal Server Error`. No partial response. | Automatic client retry. Check DB health. |
| Count query succeeds but list query fails | Returns `500`. Count is not exposed in response. | No inconsistency — the entire request fails atomically. |
| Issue exists but all comments deleted | Returns `200` with empty array and `X-Total-Count: 0`. | Expected behavior. No action needed. |
| Very large offset (e.g., page 10000) | Returns `200` with empty array. May be slow due to offset scan. | The offset query may be expensive. Monitor latency alerts. |
| Repository deleted between auth check and query | Returns `404`. | Expected race condition. No data corruption. |
| Network timeout during response streaming | Client receives partial JSON or connection reset. | Client should retry. Server-side the request completes normally. |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **List comments on an issue with comments**: Create an issue, add 3 comments, then GET the comment list. Verify `200` status, the response is an array of 3 elements, `X-Total-Count` is `3`, comments are ordered by `created_at` ascending.
- [ ] **List comments on an issue with no comments**: Create an issue with no comments, GET the comment list. Verify `200` status, the response is an empty array `[]`, and `X-Total-Count` is `0`.
- [ ] **Verify comment field shapes**: List comments and verify each comment has: `id` (positive number), `issue_id` (number matching the issue), `user_id` (positive number), `commenter` (non-empty string), `body` (non-empty string), `type` (string, value `"comment"`), `created_at` (valid ISO 8601), `updated_at` (valid ISO 8601).
- [ ] **Verify chronological ordering**: Create 5 comments with distinct bodies in sequence. List them and verify the order matches creation order (oldest first).
- [ ] **List comments on a closed issue**: Close an issue that has comments, then list its comments. Verify `200` and all comments are returned.
- [ ] **List comments on an archived repository's issue**: Archive a repository, then list comments on one of its issues. Verify `200` — read access is preserved on archived repos.
- [ ] **List comments as anonymous user on a public repo**: Without authentication, GET comments on a public repo issue. Verify `200` and comments are returned.
- [ ] **List comments with PAT authentication**: Use a PAT in the `Authorization` header. Verify `200`.
- [ ] **Verify X-Total-Count header accuracy**: Add 5 comments to an issue. List with `per_page=2`. Verify `X-Total-Count` is `5` regardless of the page size.
- [ ] **Verify comment with edited timestamp**: Create a comment, update its body, then list comments. Verify the updated comment has `updated_at` different from `created_at`.
- [ ] **List comments with maximum body length**: Create a comment with a 65,535-character body. List comments. Verify the full body is returned without truncation.
- [ ] **Verify comment with markdown content**: Create a comment with headings, code blocks, links, bold, italic, images, and tables. List comments. Verify the body is returned verbatim (no server-side rendering or sanitization).
- [ ] **Verify comment with unicode content**: Create comments with emoji (🎉), CJK characters (漢字), RTL text (مرحبا), and special symbols (→ ≠ ∞). List comments. Verify exact round-trip of all characters.
- [ ] **List comments after deleting a comment**: Create 3 comments, delete the second one, list comments. Verify only 2 comments are returned and `X-Total-Count` is `2`.

#### Pagination Tests

- [ ] **Default pagination (no params)**: Create 35 comments. GET without pagination params. Verify 30 comments returned and `X-Total-Count` is `35`.
- [ ] **Explicit page 1**: GET with `?page=1&per_page=10`. Create 25 comments. Verify 10 comments returned, `X-Total-Count` is `25`.
- [ ] **Page 2**: Create 25 comments. GET with `?page=2&per_page=10`. Verify 10 comments returned, starting from the 11th comment.
- [ ] **Last partial page**: Create 25 comments. GET with `?page=3&per_page=10`. Verify 5 comments returned.
- [ ] **Page beyond results**: Create 5 comments. GET with `?page=2&per_page=10`. Verify empty array `[]` returned with `X-Total-Count: 5`.
- [ ] **per_page=1**: Create 3 comments. GET with `?per_page=1`. Verify exactly 1 comment returned.
- [ ] **per_page=100 (maximum)**: Create 150 comments. GET with `?per_page=100`. Verify exactly 100 comments returned.
- [ ] **per_page exceeds maximum (101)**: GET with `?per_page=101`. Verify `400 Bad Request`.
- [ ] **Cursor-based pagination first page**: Create 35 comments. GET with `?limit=10`. Verify 10 comments returned.
- [ ] **Cursor-based pagination second page**: GET with `?cursor=10&limit=10`. Verify 10 comments returned starting from the 11th comment.
- [ ] **Cursor-based limit clamped to 100**: Create 150 comments. GET with `?limit=200`. Verify 100 comments returned (clamped, no error).
- [ ] **Full iteration through all pages**: Create 75 comments. Iterate through pages with `per_page=30` (pages 1, 2, 3). Verify all 75 unique comments are collected across pages with no duplicates.
- [ ] **Pagination does not miss or duplicate during page iteration**: Create 50 comments. Iterate through all pages with `per_page=10`. Collect all IDs. Verify all 50 IDs are unique and cover the full set.

#### Validation & Error Path

- [ ] **Invalid page value (non-integer)**: GET with `?page=abc`. Verify `400 Bad Request`.
- [ ] **Invalid page value (zero)**: GET with `?page=0`. Verify `400 Bad Request`.
- [ ] **Invalid page value (negative)**: GET with `?page=-1`. Verify `400 Bad Request`.
- [ ] **Invalid per_page value (non-integer)**: GET with `?per_page=abc`. Verify `400 Bad Request`.
- [ ] **Invalid per_page value (zero)**: GET with `?per_page=0`. Verify `400 Bad Request`.
- [ ] **Invalid per_page value (negative)**: GET with `?per_page=-1`. Verify `400 Bad Request`.
- [ ] **Invalid limit value (non-integer)**: GET with `?limit=abc`. Verify `400 Bad Request`.
- [ ] **Invalid limit value (zero)**: GET with `?limit=0`. Verify `400 Bad Request`.
- [ ] **Invalid limit value (negative)**: GET with `?limit=-1`. Verify `400 Bad Request`.
- [ ] **Non-existent repository**: GET `/api/repos/no-owner/no-repo/issues/1/comments`. Verify `404`.
- [ ] **Non-existent issue number**: GET `/api/repos/:owner/:repo/issues/99999/comments` for a valid repo. Verify `404`.
- [ ] **Issue number zero**: GET with issue number `0`. Verify `404`.
- [ ] **Negative issue number**: GET with issue number `-1`. Verify `400` or `404`.
- [ ] **Non-integer issue number**: GET with issue number `abc`. Verify `400`.
- [ ] **Private repo, no access (authenticated)**: Authenticate as a user with no access to a private repo. GET comments. Verify `404` (not `403`).
- [ ] **Private repo, no access (anonymous)**: GET comments on a private repo without auth. Verify `404`.
- [ ] **Private repo, with read access**: Authenticate as a user with read access. GET comments. Verify `200`.

#### Concurrency & Performance

- [ ] **Concurrent comment list requests**: Send 20 concurrent GET requests to the same issue's comment list. Verify all return `200` with identical results.
- [ ] **Comment creation during listing**: Start a comment list request, concurrently create a new comment, then verify both operations succeed independently.
- [ ] **Large comment set pagination**: Create 500 comments on an issue. Paginate through all of them with `per_page=100` (5 pages). Verify all 500 comments are retrieved without missing any.

### CLI Integration Tests

- [ ] **`codeplane issue comments <number>`**: List comments via CLI with default output. Verify output contains comment author, relative timestamp, and body text for each comment.
- [ ] **`codeplane issue comments <number> --json`**: List comments with JSON output. Verify returned JSON is a valid array of comment objects with all expected fields.
- [ ] **`codeplane issue comments <number> --repo OWNER/REPO`**: List comments using explicit repo flag. Verify success.
- [ ] **`codeplane issue comments <number> --page 2 --per-page 5`**: Verify pagination works from CLI.
- [ ] **CLI error: non-existent issue**: Run `codeplane issue comments 99999`. Verify CLI outputs a not-found error.
- [ ] **CLI error: non-existent repo**: Run `codeplane issue comments 1 --repo no/repo`. Verify CLI outputs a not-found error.
- [ ] **CLI: empty comment list**: List comments on an issue with no comments. Verify CLI displays an appropriate empty state message.
- [ ] **CLI: JSON output for empty list**: List comments on an issue with no comments using `--json`. Verify CLI outputs `[]`.

### E2E Playwright Tests (Web UI)

- [ ] **Comment list renders on issue detail**: Navigate to `/:owner/:repo/issues/:number` for an issue with comments. Verify the comment list section is visible with the correct comment count header.
- [ ] **Comments display correct content**: Verify each comment shows the author username, a timestamp, and the body text.
- [ ] **Comments render in chronological order**: Create 3 comments with known bodies. Navigate to the issue. Verify comments appear in order (oldest first).
- [ ] **Markdown rendering in comments**: Create a comment with markdown formatting (heading, code block, bold, link). Navigate to the issue. Verify the body renders as formatted HTML.
- [ ] **Empty comment list shows empty state**: Navigate to an issue with no comments. Verify the empty state message is displayed.
- [ ] **Pagination loads more comments**: Create 35 comments. Navigate to the issue. Verify 30 comments initially visible. Click "Load more" or scroll to bottom. Verify remaining 5 comments load.
- [ ] **Comment count in header matches**: Navigate to an issue with N comments. Verify the "Comments (N)" header shows the correct count.
- [ ] **Edited indicator on updated comments**: Update a comment's body. Navigate to the issue. Verify "(edited)" indicator appears next to the updated comment's timestamp.
- [ ] **Comment list loading state**: Mock slow API. Navigate to issue detail. Verify skeleton loading placeholders appear while comments are loading.
- [ ] **Comment list error state**: Mock API failure. Navigate to issue detail. Verify error message appears with a retry button.
- [ ] **Anonymous user can view comments on public repo**: Log out. Navigate to a public repo issue with comments. Verify comments are visible.
- [ ] **Private repo requires authentication**: Log out. Navigate to a private repo issue. Verify redirect to login or 404 page.

### TUI Integration Tests

- [ ] **Comment list renders in issue detail**: Open issue detail in TUI. Verify comments section appears with separator and comment count.
- [ ] **Comments display author and timestamp**: Verify each comment shows `@username` and a relative timestamp.
- [ ] **Navigation with j/k scrolls through comments**: Verify `j` and `k` keys scroll through the comment list.
- [ ] **Navigation with n/p jumps between comments**: Verify `n` and `p` keys jump to next/previous comment, skipping timeline events.
- [ ] **Focused comment shows accent bar**: Verify the currently focused comment has a left-side vertical accent bar.
- [ ] **Pagination on scroll**: Create 35 comments. Open issue detail. Verify initial load of 30 items. Scroll to bottom and verify next page loads.
- [ ] **Empty comment list shows empty message**: Open issue detail for issue with no comments. Verify appropriate empty state.

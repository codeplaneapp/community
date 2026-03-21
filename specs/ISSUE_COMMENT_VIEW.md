# ISSUE_COMMENT_VIEW

Specification for ISSUE_COMMENT_VIEW.

## High-Level User POV

When a Codeplane user encounters a reference to a specific comment on an issue — whether from a notification, a webhook payload, a direct URL containing a comment anchor, a cross-reference in another issue, or an API integration — they need to retrieve and view that individual comment in full detail. The ISSUE_COMMENT_VIEW feature provides the ability to fetch and display a single issue comment by its unique identifier, giving the user the comment's full markdown body, its author, when it was written, and whether it has been edited since creation.

This is distinct from browsing the full comment timeline on an issue (ISSUE_COMMENT_LIST) or creating a new comment (ISSUE_COMMENT_CREATE). ISSUE_COMMENT_VIEW serves the precise use case of deep-linking to, inspecting, or programmatically retrieving one specific comment. A developer clicking a notification that says "@bob commented on issue #42" lands directly on that comment. An agent that received a webhook event for `issue_comment.created` can fetch the comment by ID to read its content. A CLI user debugging a workflow that was triggered by a comment can retrieve that exact comment to understand what was said.

In the web UI, viewing a single comment manifests as scroll-anchoring to the comment within the issue detail timeline, with the target comment visually highlighted so it stands out from the surrounding conversation. In the CLI, the user runs `codeplane issue comment view <comment-id>` and receives the comment's full content, attribution, and metadata. In the TUI, navigating to a comment by ID scrolls the issue detail screen to the target comment and applies focus highlighting. In editor integrations, comment deep-links open the relevant issue detail view scrolled to the referenced comment.

The value of ISSUE_COMMENT_VIEW is precision: rather than loading an entire issue timeline and visually scanning for the comment that matters, the user goes directly to the one comment that is relevant. This is especially valuable on high-traffic issues with dozens or hundreds of comments, and it is essential for agent-driven workflows where programmatic access to individual comment content is a core integration pattern.

## Acceptance Criteria

### Definition of Done

The ISSUE_COMMENT_VIEW feature is complete when:

- A single issue comment can be retrieved by its ID via the API, CLI, TUI, web UI, and editor integrations.
- The returned comment includes all fields: `id`, `issue_id`, `user_id`, `commenter`, `body`, `type`, `created_at`, `updated_at`.
- The web UI supports deep-linking to a specific comment within the issue detail timeline via URL anchor.
- The CLI provides a dedicated subcommand for viewing a single comment with both human-readable and JSON output.
- The TUI supports navigating to a specific comment by ID within the issue detail view.
- All error cases (not found, unauthorized, forbidden, invalid ID) produce correct, user-friendly error responses.
- Documentation covers the API endpoint, CLI command, web deep-link format, and programmatic access patterns.

### Input Constraints

- [ ] **Comment ID is required**: The `:id` path parameter must be present and must be a positive integer. Missing, zero, negative, or non-integer values must return `400 Bad Request` with `{ "message": "invalid comment id" }`.
- [ ] **Comment ID maximum**: Comment IDs are 64-bit integers. Values exceeding `2^63 - 1` must return `400 Bad Request`.
- [ ] **Repository scoping**: The comment is scoped to a repository via the `/:owner/:repo/` path prefix. The comment must belong to an issue in the specified repository; a valid comment ID in a different repository must return `404 Not Found`.
- [ ] **Owner format**: The `:owner` path parameter must be a valid username (1–39 characters, alphanumeric plus hyphens, no leading/trailing hyphens). Invalid formats return `400 Bad Request`.
- [ ] **Repo name format**: The `:repo` path parameter must be a valid repository name (1–100 characters, alphanumeric plus hyphens, dots, and underscores). Invalid formats return `400 Bad Request`.

### Response Constraints

- [ ] **Response shape**: The response must be a JSON object with exactly the fields: `id` (number), `issue_id` (number), `user_id` (number), `commenter` (string), `body` (string), `type` (string, always `"comment"`), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
- [ ] **Edited detection**: When `updated_at` differs from `created_at`, clients must interpret this as the comment having been edited and display an "edited" indicator.
- [ ] **Body content integrity**: The `body` field is returned exactly as stored, preserving all markdown, whitespace, emoji, CJK characters, and special symbols without transformation.
- [ ] **Body maximum length**: Comment bodies may be up to 65,535 characters. Clients should handle rendering of the full body (or truncate at 50,000 characters with a truncation notice for terminal-based clients).
- [ ] **Timestamps**: `created_at` and `updated_at` are valid ISO 8601 timestamps. Both are always present and non-null.

### Error Handling

- [ ] **Comment not found**: A valid but nonexistent comment ID returns `404 Not Found` with `{ "message": "comment not found" }`, not an empty body or `200`.
- [ ] **Repository not found**: A nonexistent `owner/repo` combination returns `404 Not Found` with `{ "message": "not found" }`.
- [ ] **Cross-repository access**: A comment ID that exists in repository A accessed via the path for repository B returns `404 Not Found`.
- [ ] **Unauthenticated on private repo**: Accessing a comment in a private repository without authentication returns `404 Not Found` (not `401` or `403`, to avoid leaking repository existence).
- [ ] **Insufficient access on private repo**: An authenticated user without read access to a private repository receives `404 Not Found`.
- [ ] **Invalid comment ID format**: Non-integer, floating-point, empty, or special-character comment IDs return `400 Bad Request`.

### Edge Cases

- [ ] **Deleted comment**: A comment that was previously deleted returns `404 Not Found`. There is no "soft delete" state; deletion is permanent.
- [ ] **Comment on deleted issue**: If the parent issue has been deleted, the comment returns `404 Not Found`.
- [ ] **Comment on archived repository**: Comments in archived repositories remain readable. Archiving does not affect read access.
- [ ] **Comment on locked issue**: Comments on locked issues remain readable. Locking affects comment creation, not viewing.
- [ ] **Very large body (65,535 chars)**: The API returns the full body. Terminal clients truncate at 50,000 characters with a notice.
- [ ] **Empty body edge**: While comment creation requires a non-empty body, a comment whose body was set to empty via a data migration or direct DB edit should still return without error, rendering as an empty body.
- [ ] **Concurrent deletion**: If a comment is deleted between the time a user clicks a deep-link and the time the request reaches the server, a `404` is returned gracefully.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/issues/comments/:id`

**Request Headers**:
- `Authorization: Bearer <PAT>` or session cookie (required for private repositories, optional for public)

**Path Parameters**:
- `:owner` — Repository owner (username or organization name)
- `:repo` — Repository name
- `:id` — Comment ID (positive integer)

**Success Response** (`200 OK`):
```json
{
  "id": 100,
  "issue_id": 12345,
  "user_id": 2,
  "commenter": "bob",
  "body": "I can reproduce this. The EventSource object is never closed before creating a new one.",
  "type": "comment",
  "created_at": "2026-03-20T11:00:00.000Z",
  "updated_at": "2026-03-20T11:00:00.000Z"
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Comment ID is non-integer, zero, or negative | `{ "message": "invalid comment id" }` |
| `400 Bad Request` | Comment ID is missing from path | `{ "message": "comment id is required" }` |
| `404 Not Found` | Repository does not exist | `{ "message": "not found" }` |
| `404 Not Found` | Comment does not exist | `{ "message": "comment not found" }` |
| `404 Not Found` | Private repo, unauthenticated or insufficient access | `{ "message": "not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

**Headers**: No pagination headers are set on single-resource responses.

### SDK Shape

The `IssueService` in `@codeplane/sdk` exposes:

```typescript
getIssueComment(
  viewer: AuthUser | null,
  owner: string,
  repo: string,
  commentId: number
): Promise<IssueCommentResponse>
```

Where `IssueCommentResponse` is:

```typescript
interface IssueCommentResponse {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;       // always "comment"
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}
```

The service:
1. Validates `commentId` is a positive integer (throws `badRequest` otherwise).
2. Resolves the repository by owner and name (throws `notFound` if missing).
3. Checks the viewer has at least read access to the repository (throws `notFound` for private repos without access).
4. Queries the comment by ID (throws `notFound` if comment does not exist).
5. Returns the mapped comment response.

The `@codeplane/ui-core` package provides:

```typescript
useIssueComment(owner: string, repo: string, commentId: number): {
  comment: IssueCommentResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### CLI Command

**Command**: `codeplane issue comment view <comment-id> [--repo OWNER/REPO] [--json]`

**Arguments**:
- `comment-id` (positional, required): The numeric ID of the comment to view. Validated as a positive integer.

**Options**:
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.
- `--json` (optional): Output full JSON response instead of human-readable text.

**Text output** (human-readable):
```
Comment #100 on issue #42
@bob · 2 days ago · edited

I can reproduce this. The EventSource object is never closed
before creating a new one.
```

The human-readable output includes:
- Comment ID and parent issue number in the header line
- `@commenter` in the attribution line
- Relative timestamp (matching the conventions: "just now", "5m ago", "2h ago", "3d ago", or absolute "Jan 15, 2025" for dates older than 30 days)
- "edited" suffix when `updated_at !== created_at`
- Full comment body rendered as plain text

**JSON output** (`--json`): The full `IssueCommentResponse` JSON object.

**Error handling**:
- `404` → `"Comment #<id> not found in <OWNER/REPO>"`
- `400` → `"Invalid comment ID: <input>"`
- `401` → `"Authentication required. Run 'codeplane auth login'."`
- No auth configured → `"Not authenticated. Run 'codeplane auth login'."`

### Web UI Design

**Deep-link URL format**: `/:owner/:repo/issues/:number#comment-:id`

Example: `/alice/frontend/issues/42#comment-100`

**Behavior when navigating to a comment deep-link**:

1. The issue detail page loads at `/:owner/:repo/issues/:number`.
2. The URL hash `#comment-:id` is parsed to extract the target comment ID.
3. If the comment list is not yet loaded or the target comment is not in the initially loaded page, the page automatically paginates until the target comment is loaded into the DOM.
4. Once the target comment is present, the page scrolls smoothly to the comment's position.
5. The target comment is visually highlighted with a transient highlight effect: a subtle background color pulse (e.g., light yellow → transparent over 2 seconds) that draws the user's eye to the referenced comment.
6. The comment's anchor element has a stable `id="comment-{id}"` attribute for CSS targeting and browser-native anchor scroll fallback.

**Comment anchor in the timeline**:
- Every comment in the issue timeline renders with a permanent anchor `id="comment-{id}"`.
- Hovering over the comment's timestamp reveals a link icon (🔗) or shows the comment's direct URL in a tooltip.
- Clicking the timestamp or link icon copies the comment deep-link URL to the clipboard and briefly flashes a "Link copied" confirmation.
- The URL in the browser address bar updates (via `replaceState`) to include the comment anchor when a comment is focused or clicked.

**Edge cases in web UI**:
- If the hash references a comment ID that does not exist in the issue's timeline (wrong issue, deleted comment), the page loads normally without scrolling or highlighting and no error is shown.
- If the comment is on page 3 of a paginated timeline, all preceding pages are fetched before scrolling. A loading indicator is shown during this process.
- Browser back/forward navigation with comment anchors works correctly.
- The highlight animation only plays once per navigation; revisiting the same anchor via back/forward does not re-trigger it.

### TUI UI

**Comment focus by ID**:

When the TUI issue detail screen is opened with a target comment ID (e.g., from a notification or command palette), the screen:

1. Loads the issue detail and comment list.
2. Paginates through comments if necessary to find the target comment.
3. Sets focus on the target comment (highlighted with the left-side `│` accent bar in primary color).
4. Scrolls the viewport to center the focused comment.

**Navigation from notification screen**:
- Selecting a notification of type `issue_comment` pushes the issue detail screen with the comment ID as context, triggering the focus-by-ID behavior.

**Command palette integration**:
- `:goto comment <id>` within the issue detail screen sets focus on the specified comment, loading additional pages if necessary.

**Rendering of a single focused comment** follows the same visual spec as TUI_ISSUE_COMMENT_LIST:
- `@username` in bold primary color (ANSI 33)
- Relative timestamp in muted color (ANSI 245)
- "edited" indicator when `updated_at !== created_at`
- `(you)` suffix for own comments
- Full markdown body via `<markdown>` component
- Left-side `│` accent bar in primary color for the focused comment
- Body truncated at 50,000 characters with "Comment truncated. View full comment on web." notice

### Editor Integrations

**VS Code**: Notification interactions and comment-linked webview panels open the issue detail view scrolled to the referenced comment. The `#comment-{id}` anchor is passed to the webview URL.

**Neovim**: `:Codeplane issue comment view <id> [--repo OWNER/REPO]` opens a read-only buffer displaying the comment content with markdown syntax highlighting. The buffer header shows the comment ID, parent issue number, commenter, and timestamp.

### Documentation

The following documentation must be provided:

- **API Reference** (`docs/api-reference/issues.mdx`): Document the `GET /api/repos/:owner/:repo/issues/comments/:id` endpoint with full request/response schema, error codes, a curl example, and a note about cross-repository scoping behavior.
- **CLI Reference** (`docs/cli/issue.mdx`): Document the `issue comment view` subcommand with arguments, options, example output (both text and JSON), and error messages.
- **Deep-linking guide** (`docs/guides/issue-comments.mdx`): Document the URL anchor format for comment deep-links, how to share comment links, and how notifications link to specific comments.
- **Webhook payload reference** (`docs/api-reference/webhooks.mdx`): Ensure the `issue_comment` webhook event documentation references the comment `id` field that can be used with the GET endpoint to retrieve the full comment.

## Permissions & Security

### Authorization Matrix

| Role | Can View Comment? | Notes |
|------|-------------------|-------|
| **Anonymous (public repo)** | ✅ Yes | Comments on public repos are publicly readable |
| **Authenticated (public repo, no explicit access)** | ✅ Yes | Same as anonymous |
| **Read-Only Collaborator** | ✅ Yes | Read access is sufficient for viewing |
| **Team Member (read)** | ✅ Yes | Read access is sufficient |
| **Team Member (write)** | ✅ Yes | Superset of read |
| **Collaborator (write)** | ✅ Yes | Superset of read |
| **Repository Admin** | ✅ Yes | Full access |
| **Organization Admin** | ✅ Yes | Full access |
| **Repository Owner** | ✅ Yes | Full access |
| **Anonymous (private repo)** | ❌ No | Returns `404` (not `401` or `403`) |
| **Authenticated (private repo, no access)** | ❌ No | Returns `404` (not `403`) |

### Rate Limiting

- **Per-user rate limit**: 300 requests per minute per authenticated user for read endpoints (shared across all GET issue endpoints).
- **Per-IP rate limit (unauthenticated)**: 60 requests per minute per IP address for public repository reads.
- **Burst tolerance**: Up to 30 requests in a 1-second burst window, then smoothed to the per-minute rate.
- **No per-repository rate limit for reads**: Unlike comment creation (which has a per-repo limit), reads are only user/IP limited.

### Data Privacy

- **PII exposure**: The `commenter` field exposes the username of the comment author. The `user_id` field exposes the internal user ID. Both are intentional and consistent with forge semantics.
- **Private repository masking**: For private repositories, unauthenticated or unauthorized access returns `404` rather than `401`/`403` to avoid confirming repository existence.
- **Comment body**: May contain @mentions referencing other users, code snippets, or free-text. No PII scanning is performed on comment bodies.
- **Audit logging**: Read access to comments is not individually logged to avoid excessive audit volume. Bulk access patterns are monitored via rate limiting and anomaly detection.

## Telemetry & Product Analytics

### Business Events

**Event: `IssueCommentViewed`**

Fired when a single comment is retrieved via any surface.

Properties:
- `comment_id` (number): The ID of the viewed comment.
- `issue_id` (number): The parent issue ID.
- `issue_number` (number): The parent issue number (resolved server-side if available, null otherwise).
- `repository_id` (string): The repository ID.
- `repository_owner` (string): The repository owner name.
- `repository_name` (string): The repository name.
- `viewer_id` (number | null): The authenticated viewer's user ID, or null for anonymous access.
- `viewer_is_comment_author` (boolean): Whether the viewer is the comment's author.
- `comment_age_hours` (number): Hours since the comment was created.
- `comment_was_edited` (boolean): Whether `updated_at !== created_at`.
- `source` (string): The client surface that triggered the view (`"web"`, `"web_deeplink"`, `"cli"`, `"tui"`, `"api"`, `"agent"`, `"vscode"`, `"neovim"`).
- `latency_ms` (number): Server-side processing time.

**Event: `IssueCommentDeepLinked`** (web-specific)

Fired when a user navigates to an issue detail page with a `#comment-{id}` anchor.

Properties:
- `comment_id` (number): The target comment ID from the URL anchor.
- `issue_number` (number): The issue number from the URL path.
- `repository_owner` (string): From the URL path.
- `repository_name` (string): From the URL path.
- `comment_found` (boolean): Whether the target comment was successfully located and scrolled to.
- `pages_loaded_to_find` (number): How many pagination pages were fetched to locate the comment (0 if in first page).
- `scroll_latency_ms` (number): Time from page mount to comment scroll completion.
- `referrer` (string): The referring page/surface (notification, external link, internal navigation).

### Funnel Metrics & Success Indicators

- **Comment view rate**: Views of individual comments per day. Indicates how often users need deep-link or single-comment access rather than browsing the full timeline.
- **Deep-link resolution rate**: Percentage of `#comment-{id}` deep-link navigations that successfully find and scroll to the target comment. Target: >99%.
- **Deep-link referrer breakdown**: Distribution of deep-link sources (notifications, external links, in-app cross-references). Indicates which surfaces drive comment-level navigation.
- **Comment view to reply conversion**: Percentage of single-comment views that result in a new comment creation on the same issue within 5 minutes. Indicates engagement depth.
- **API consumer distribution**: Breakdown of `IssueCommentViewed` by `source`. Healthy product shows API and agent usage alongside human client usage.
- **Error rate**: Percentage of comment view attempts returning 4xx/5xx. Should remain below 0.5%.
- **Latency p95**: 95th percentile latency for single comment retrieval. Target: <100ms.

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `issue_comment.viewed` | `INFO` | `comment_id`, `issue_id`, `repo_id`, `viewer_id`, `latency_ms` | On successful comment retrieval |
| `issue_comment.view_not_found` | `WARN` | `comment_id`, `repo_owner`, `repo_name`, `viewer_id` | Comment ID does not exist |
| `issue_comment.view_repo_not_found` | `WARN` | `repo_owner`, `repo_name`, `viewer_id` | Repository does not exist |
| `issue_comment.view_forbidden` | `WARN` | `comment_id`, `repo_owner`, `repo_name`, `viewer_id` | Viewer lacks read access to private repo |
| `issue_comment.view_bad_request` | `WARN` | `comment_id_raw`, `repo_owner`, `repo_name`, `error` | Invalid comment ID format |
| `issue_comment.view_error` | `ERROR` | `comment_id`, `repo_owner`, `repo_name`, `error`, `stack` | Unexpected server error during retrieval |

### Prometheus Metrics

**Counters**:
- `codeplane_issue_comment_views_total` — Labels: `status` (`200`, `400`, `404`, `429`, `500`), `source` (`web`, `cli`, `tui`, `api`, `agent`). Total comment view requests.
- `codeplane_issue_comment_deeplinks_total` — Labels: `result` (`found`, `not_found`). Total web deep-link attempts.

**Histograms**:
- `codeplane_issue_comment_view_duration_seconds` — Labels: none. Latency of single comment retrieval (DB query + permission check). Buckets: `[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]`.
- `codeplane_issue_comment_deeplink_scroll_duration_seconds` — Labels: none. Client-side time from page mount to comment scroll (reported via telemetry). Buckets: `[0.1, 0.25, 0.5, 1, 2, 5, 10]`.

**Gauges**:
- `codeplane_issue_comment_view_inflight` — Labels: none. Number of comment view requests currently in progress.

### Alerts

#### Alert: `IssueCommentViewErrorRateHigh`
- **Condition**: `rate(codeplane_issue_comment_views_total{status="500"}[5m]) / rate(codeplane_issue_comment_views_total[5m]) > 0.02` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `issue_comment.view_error` entries. Examine the `error` and `stack` fields.
  2. Check database connectivity and query latency. The view endpoint runs a single query (`dbGetIssueCommentByID`), so DB unavailability directly causes 500s.
  3. Check if the error is isolated to specific repositories (possible data corruption) or global (infrastructure issue).
  4. Verify the service registry is initializing correctly — a `null` service reference would cause 500s on all comment operations.
  5. Check connection pool health. High concurrency with an exhausted pool manifests as timeouts logged as 500s.

#### Alert: `IssueCommentView404RateSpike`
- **Condition**: `rate(codeplane_issue_comment_views_total{status="404"}[5m]) > 50` sustained for 10 minutes, AND the 404 rate represents >80% of total traffic.
- **Severity**: Info
- **Runbook**:
  1. Check if a popular notification or integration is generating deep-links to deleted or nonexistent comments.
  2. Review `issue_comment.view_not_found` log entries to identify the most-requested nonexistent comment IDs.
  3. If 404s correlate with a bulk comment deletion event, this is expected and the alert is informational. Acknowledge and monitor for natural resolution.
  4. If 404s are caused by a misconfigured webhook or integration sending incorrect comment IDs, contact the integration owner.

#### Alert: `IssueCommentViewLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_comment_view_duration_seconds_bucket[5m])) > 0.5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. The comment view is a single DB query plus a permission check. High latency almost always indicates database performance issues.
  2. Check the `issue_comments` table index on `id` (primary key). If missing or degraded, rebuild.
  3. Check database connection pool metrics. Latency spikes when the pool is saturated and queries queue.
  4. Check for long-running transactions or table locks on the `issue_comments` table from other operations (e.g., bulk deletes, migrations).
  5. If latency is specific to large comments, check if the `body` column is being transferred as a TOAST segment and evaluate whether a body-length-based optimization is needed.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| DB query fails (connection error) | Returns `500 Internal Server Error` | Client retries. Check DB health. |
| DB query times out | Returns `500 Internal Server Error` with timeout context | Check DB load, connection pool, query plan. |
| Comment ID overflow (exceeds bigint range) | Returns `400 Bad Request` | No action needed — input validation. |
| Repository resolution fails (stale cache) | Returns `404 Not Found` | Repository lookup is cache-consistent; verify repo exists. |
| Permission check fails (auth service unavailable) | Returns `500 Internal Server Error` | Check auth service/session store health. |
| Deep-link target comment on a later pagination page | Web UI fetches pages until found or exhausted | No server action; client-side logic handles pagination. |
| Deep-link target comment deleted between notification and view | Page loads without scrolling; no error shown | Expected behavior. |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **Retrieve a comment by ID**: Create an issue, add a comment, extract the comment `id` from the creation response, then GET `/api/repos/:owner/:repo/issues/comments/:id`. Verify `200` status, returned `id` matches, `body` matches the created comment, `commenter` matches the actor, `type` is `"comment"`, `created_at` and `updated_at` are valid ISO 8601 and equal.
- [ ] **Retrieve an edited comment**: Create a comment, then PATCH it with a new body. GET the comment by ID. Verify `body` reflects the update, `updated_at` differs from `created_at`.
- [ ] **Retrieve a comment on a closed issue**: Create an issue, add a comment, close the issue. GET the comment by ID. Verify `200` — viewing comments on closed issues is allowed.
- [ ] **Retrieve a comment on a locked issue**: Create an issue, lock it, then add a comment as admin. GET the comment by ID as a read-only user. Verify `200` — locking affects creation, not viewing.
- [ ] **Retrieve a comment on an archived repository**: Archive the repository. GET a previously created comment by ID. Verify `200` — archiving does not affect read access.
- [ ] **Retrieve a comment with markdown content**: Create a comment with headings, code blocks, links, lists, bold, italic, and images. GET it by ID. Verify the body is returned verbatim without transformation.
- [ ] **Retrieve a comment with emoji and unicode**: Create a comment with emoji (🎉), CJK characters (漢字), and special symbols (→ ≠ ∞). GET it by ID. Verify exact round-trip preservation.
- [ ] **Retrieve a comment with maximum body length (65,535 chars)**: Create a comment with exactly 65,535 characters. GET it by ID. Verify the full body is returned without truncation.
- [ ] **Retrieve a comment with very short body (1 char)**: Create a comment with body `"x"`. GET it by ID. Verify `200` and body is `"x"`.
- [ ] **Retrieve a comment using PAT authentication**: Use a PAT in the `Authorization` header instead of session cookies. GET a comment. Verify `200`.
- [ ] **Retrieve a comment on a public repo as anonymous**: GET a comment on a public repo without any auth credentials. Verify `200`.
- [ ] **Retrieve the same comment multiple times**: GET the same comment ID 5 times in sequence. Verify all return identical responses (no mutation on read).
- [ ] **Response field completeness**: Verify the response contains exactly `id`, `issue_id`, `user_id`, `commenter`, `body`, `type`, `created_at`, `updated_at` — no extra fields, no missing fields.
- [ ] **Timestamps are ISO 8601**: Verify `created_at` and `updated_at` parse as valid ISO 8601 dates.

#### Error Path

- [ ] **Comment not found (valid ID, no such comment)**: GET `/api/repos/:owner/:repo/issues/comments/999999`. Verify `404` with `{ "message": "comment not found" }`.
- [ ] **Comment ID zero**: GET with comment ID `0`. Verify `400` with `{ "message": "invalid comment id" }`.
- [ ] **Comment ID negative**: GET with comment ID `-1`. Verify `400`.
- [ ] **Comment ID non-integer (string)**: GET with comment ID `abc`. Verify `400`.
- [ ] **Comment ID non-integer (float)**: GET with comment ID `3.14`. Verify `400`.
- [ ] **Comment ID empty**: GET `/api/repos/:owner/:repo/issues/comments/`. Verify `400` or `404` (route not matched).
- [ ] **Comment ID extremely large**: GET with comment ID `99999999999999999999`. Verify `400` (exceeds integer range).
- [ ] **Repository not found**: GET `/api/repos/no-such-owner/no-such-repo/issues/comments/1`. Verify `404`.
- [ ] **Cross-repository access**: Create a comment in repo A. GET it using repo B's path prefix. Verify `404`.
- [ ] **Private repo, unauthenticated**: GET a comment in a private repo without auth. Verify `404` (not `401`).
- [ ] **Private repo, authenticated but no access**: Authenticate as a user with no access to a private repo. GET a comment. Verify `404` (not `403`).
- [ ] **Deleted comment**: Create a comment, delete it, then GET by ID. Verify `404`.
- [ ] **Comment on deleted issue**: Create an issue with a comment, delete the issue, then GET the comment by ID. Verify `404`.
- [ ] **Body exceeds maximum length retrieval (65,536 chars)**: If a body of 65,536 characters were stored (e.g., via migration), verify the API returns it without error (read path is not length-gated).

#### Concurrency & Edge Cases

- [ ] **Concurrent reads**: GET the same comment from 10 concurrent requests. Verify all return `200` with identical data and no errors.
- [ ] **Read after immediate create**: Create a comment and immediately GET it by the returned ID in the same test. Verify read-after-write consistency.
- [ ] **Read after immediate update**: Create a comment, PATCH it, and immediately GET it. Verify the response reflects the update.
- [ ] **Read after immediate delete**: Create a comment, DELETE it, and immediately GET it. Verify `404`.

### CLI Integration Tests

- [ ] **`codeplane issue comment view <id>`**: View a comment via CLI in text mode. Verify output contains `Comment #<id>`, `@<commenter>`, relative timestamp, and full body text.
- [ ] **`codeplane issue comment view <id> --json`**: View a comment with JSON output. Verify returned JSON matches `IssueCommentResponse` schema with all fields.
- [ ] **`codeplane issue comment view <id> --repo OWNER/REPO`**: View a comment using explicit repo flag. Verify success.
- [ ] **Edited comment indicator**: View an edited comment. Verify "edited" appears in the text output.
- [ ] **CLI error: nonexistent comment**: Run `codeplane issue comment view 999999`. Verify CLI outputs "Comment #999999 not found".
- [ ] **CLI error: invalid comment ID**: Run `codeplane issue comment view abc`. Verify CLI outputs an invalid ID error.
- [ ] **CLI error: unauthenticated**: Run without prior `auth login` against a private repo. Verify CLI outputs an authentication error.
- [ ] **CLI: comment body with special characters**: Create a comment with quotes, backslashes, newlines, and tabs. View it. Verify exact content displayed.
- [ ] **CLI: very long comment body (65,535 chars)**: Create a max-length comment, view it. Verify the body is displayed in full (or truncated with notice in narrow terminals).

### E2E Playwright Tests (Web UI)

- [ ] **Deep-link scrolls to comment**: Navigate to `/:owner/:repo/issues/:number#comment-:id`. Verify the page scrolls to the target comment and it is visible in the viewport.
- [ ] **Deep-link highlight animation**: Navigate to a comment deep-link. Verify the target comment has a transient highlight effect (background color animation).
- [ ] **Deep-link to comment on later page**: Create an issue with 40+ comments. Navigate to `#comment-{last-comment-id}`. Verify all pages are loaded and the page scrolls to the correct comment.
- [ ] **Deep-link to nonexistent comment**: Navigate to `/:owner/:repo/issues/:number#comment-999999`. Verify the page loads normally without error and does not scroll.
- [ ] **Comment anchor link copy**: Hover over a comment's timestamp, click the link icon. Verify the clipboard contains the comment deep-link URL.
- [ ] **Browser back/forward with comment anchors**: Navigate to a deep-link, then navigate elsewhere, then press back. Verify the comment anchor is restored.
- [ ] **Comment `id` attribute in DOM**: Verify each comment in the timeline has an HTML element with `id="comment-{id}"`.
- [ ] **Multiple comments: only target highlighted**: Navigate to a deep-link. Verify only the target comment is highlighted; other comments render normally.
- [ ] **Deep-link from notification**: Click a notification of type `issue_comment`. Verify navigation to the issue detail with the target comment scrolled into view.

### TUI Integration Tests

- [ ] **Navigate to comment from notification**: Select an `issue_comment` notification. Verify the issue detail screen opens with the target comment focused and visible.
- [ ] **Comment focus indicator**: After navigating to a specific comment by ID, verify the left-side `│` accent bar is rendered in primary color on the correct comment.
- [ ] **Pagination to find comment**: Issue with 50+ comments; navigate to a comment on page 2. Verify pages load automatically and the comment is focused.
- [ ] **Comment not found in TUI**: Navigate to a comment ID that doesn't exist. Verify the issue detail screen opens without focus error, defaulting to the first comment.

### Webhook & Integration Tests

- [ ] **Webhook payload contains retrievable comment ID**: Create a webhook subscribing to `issue_comment` events. Create a comment. Extract the `id` from the webhook delivery payload. GET `/api/repos/:owner/:repo/issues/comments/:id`. Verify `200` and the comment matches.
- [ ] **Agent retrieves comment by ID from workflow trigger**: Define a workflow triggered by `issue_comment.created`. When the workflow runs, use the comment ID from the trigger payload to GET the comment via the API. Verify the comment is retrievable.

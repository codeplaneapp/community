# LANDING_COMMENT_CREATE

Specification for LANDING_COMMENT_CREATE.

## High-Level User POV

When a developer is reviewing a landing request — Codeplane's jj-native equivalent of a pull request — they need to leave feedback, ask questions, and discuss the proposed changes with the author and other collaborators. The landing comment creation feature lets any authenticated user with write access to a repository add a comment to an open landing request.

Comments come in two flavors. A **general discussion comment** is a free-form message about the landing request as a whole — for example, "This looks good but I want to see tests before we land it." An **inline diff comment** is anchored to a specific file path and line number within the diff, letting the reviewer point directly at a piece of code and say, "This should use `useMemo` to avoid re-renders." Both types appear in a single chronological timeline on the landing request, giving participants a complete picture of the review conversation without toggling between tabs.

From the web UI, the developer writes their comment in a markdown-enabled text area at the bottom of the landing request's comments section, or initiates an inline comment directly from the diff viewer by clicking a line. From the CLI, they run `codeplane land comment <number> --body "feedback text"` to add a general comment quickly without leaving the terminal. From the TUI, they press `c` while viewing a landing request to open a compose area, type their markdown, and press `Ctrl+S` to submit. Across all surfaces, the comment appears immediately in the timeline — in the TUI and web UI this is an optimistic insertion that finalizes once the server confirms creation.

The feature supports full markdown in comment bodies: headings, lists, code blocks with syntax highlighting, bold, italic, links, and blockquotes. This lets reviewers include code snippets, reference files, and format detailed technical feedback clearly.

Commenting on a landing request is a core collaboration action. It drives the review conversation, helps teams converge on decisions about whether changes are ready to land, and provides a persistent, searchable record of the reasoning behind code decisions. When a user is @mentioned in a comment, they receive a notification so they can respond promptly.

## Acceptance Criteria

### Core behavior
- [ ] An authenticated user with write access to the repository can create a comment on any landing request in that repository.
- [ ] A comment may be a **general discussion comment** (no file/line context) or an **inline diff comment** (anchored to a file path, line number, and diff side).
- [ ] On successful creation, the server returns a `201 Created` response with the full comment object including server-assigned `id`, `created_at`, and `updated_at`.
- [ ] The newly created comment appears in the landing request's comment timeline in chronological order.
- [ ] Comments support full markdown content in the `body` field.
- [ ] @mentions in the comment body trigger notification fanout to the mentioned users.

### Input validation
- [ ] `body` is **required**. An empty string or whitespace-only string returns a validation error (`422`) with `{ resource: "LandingComment", field: "body", code: "missing_field" }`.
- [ ] `body` must not exceed **262,144 characters** (256 KiB). Bodies exceeding this limit return a `422` validation error.
- [ ] `line` must be a non-negative integer (`>= 0`). A negative value returns a validation error (`422`) with `{ resource: "LandingComment", field: "line", code: "invalid" }`.
- [ ] If `line > 0`, then `path` is **required** (non-empty). An inline comment targeting a line without a file path returns a validation error (`422`) with `{ resource: "LandingComment", field: "path", code: "missing_field" }`.
- [ ] `path` must not exceed **4,096 characters**. Paths exceeding this limit return a `422` validation error.
- [ ] `side` must be one of `"left"`, `"right"`, or `"both"`. If empty or omitted, it defaults to `"right"`. Any other value returns a validation error (`422`) with `{ resource: "LandingComment", field: "side", code: "invalid" }`.
- [ ] For general comments, `path` defaults to `""`, `line` defaults to `0`, and `side` defaults to `"right"`.
- [ ] Leading and trailing whitespace in `body` is preserved as submitted (server stores the raw body; only empty-check uses trimmed value).
- [ ] Leading and trailing whitespace in `path` is trimmed by the server.
- [ ] `side` is normalized to lowercase by the server.

### Authorization
- [ ] Unauthenticated requests return `401 Unauthorized`.
- [ ] Authenticated users without write access to the repository return `403 Forbidden`.
- [ ] Creating a comment on a non-existent repository returns `404 Not Found`.
- [ ] Creating a comment on a non-existent landing request number returns `404 Not Found`.

### Edge cases
- [ ] Comments can be added to landing requests in any state: `open`, `closed`, `merged`.
- [ ] A comment with `line = 0` and a non-empty `path` is treated as a general file-level comment (valid).
- [ ] A comment with `line = 0` and `path = ""` is a general discussion comment (valid).
- [ ] Unicode content in `body` (emoji, CJK, RTL text) is accepted and preserved.
- [ ] Body containing only newlines (no visible characters) is rejected as empty.
- [ ] A request with no JSON body at all, or a malformed JSON payload, returns `400 Bad Request`.
- [ ] Concurrent comment creation from multiple users on the same landing request succeeds without conflict.
- [ ] The `Content-Type: application/json` header is required for the POST request (enforced by middleware).

### Definition of Done
- [ ] Server route, service method, and database query all function end-to-end.
- [ ] All validation rules produce correct error responses.
- [ ] CLI `land comment` command creates comments successfully.
- [ ] Web UI comment creation form submits successfully and updates the timeline.
- [ ] TUI comment creation via `c` + `Ctrl+S` submits successfully.
- [ ] @mention notification fanout fires for mentioned users.
- [ ] All E2E tests (API, CLI, web, TUI) pass.
- [ ] Telemetry events fire with correct properties.
- [ ] Observability metrics and structured logs are emitted.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/landings/:number/comments`

**Authentication:** Required. Session cookie, PAT (`Authorization: token <token>`), or OAuth2 bearer token.

**Request Headers:**
- `Content-Type: application/json` (required)
- `Authorization: token <pat>` (if using PAT auth)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization name |
| `repo` | string | Repository name |
| `number` | integer | Landing request number |

**Request Body:**

```json
{
  "body": "This should use useMemo to avoid re-renders.",
  "path": "src/components/Header.tsx",
  "line": 42,
  "side": "right"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `body` | string | **Yes** | — | Markdown comment content. 1–262,144 characters. |
| `path` | string | No | `""` | File path for inline comments. Required if `line > 0`. Max 4,096 characters. |
| `line` | integer | No | `0` | Line number for inline comments. Must be `>= 0`. `0` means general comment. |
| `side` | string | No | `"right"` | Diff side: `"left"`, `"right"`, or `"both"`. |

**Success Response:** `201 Created`

```json
{
  "id": 47,
  "landing_request_id": 12,
  "author": {
    "id": 5,
    "login": "alice"
  },
  "path": "src/components/Header.tsx",
  "line": 42,
  "side": "right",
  "body": "This should use useMemo to avoid re-renders.",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body shape |
|--------|-----------|------------|
| `400` | Malformed JSON or missing Content-Type | `{ "message": "..." }` |
| `401` | Not authenticated | `{ "message": "authentication required" }` |
| `403` | No write access to repository | `{ "message": "forbidden" }` |
| `404` | Repository or landing request not found | `{ "message": "not found" }` |
| `422` | Validation failure (empty body, negative line, etc.) | `{ "message": "Validation Failed", "errors": [{ "resource": "LandingComment", "field": "body", "code": "missing_field" }] }` |
| `429` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

### SDK Shape

The `LandingService` in `@codeplane/sdk` exposes:

```typescript
interface CreateLandingCommentInput {
  path: string;
  line: number;
  side: string;
  body: string;
}

interface LandingCommentResponse {
  id: number;
  landing_request_id: number;
  author: { id: number; login: string };
  path: string;
  line: number;
  side: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// Service method
createLandingComment(
  actor: User,
  owner: string,
  repo: string,
  number: number,
  req: CreateLandingCommentInput,
): Promise<Result<LandingCommentResponse, APIError>>
```

### CLI Command

**Command:** `codeplane land comment <number>`

**Synopsis:**
```
codeplane land comment <number> --body <text> [--repo OWNER/REPO]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<number>` | Landing request number (positive integer) |

**Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--body` | string | Yes | Comment body text (markdown supported) |
| `--repo` | string | No | Repository in `OWNER/REPO` format. Inferred from cwd if omitted. |

**Output (default):**
```
Added a comment to landing request #42
```

**Output (--json):**
Full `LandingCommentResponse` JSON object.

**Error output:**
```
error: Comment body cannot be empty
error: Landing request #999 not found
error: Permission denied — write access required
```

### Web UI Design

**General comment creation:**
- A text area appears at the bottom of the landing request comments tab/section.
- The text area supports markdown with a preview toggle.
- A "Comment" submit button is positioned below the text area.
- The submit button is disabled when the text area is empty or when a submission is in-flight.
- On successful submission, the text area clears and the new comment appears at the bottom of the timeline with an optimistic insertion.
- If the user is not authenticated, the text area is replaced with a "Sign in to comment" prompt.
- If the user lacks write access, the text area is replaced with a "Write access required to comment" message.

**Inline comment creation (from diff viewer):**
- Hovering over a diff line reveals a `+` button in the gutter.
- Clicking the `+` opens an inline comment form directly below the diff line.
- The form includes a markdown text area and a "Comment" submit button.
- The `path`, `line`, and `side` are automatically populated from the diff context.
- On submission, the inline comment appears both in the diff view and in the main comments timeline.

**Comment rendering in timeline:**
- Each comment shows: author avatar + `@username`, relative timestamp, and markdown-rendered body.
- Inline comments show a file context header: `📄 path:line (side)` above the body.
- New comments from the current user show a `(you)` indicator.
- The comments section header shows `Comments (N)` where N is the total count.

### TUI UI

**Comment creation flow:**
1. User presses `c` while viewing a landing request detail screen.
2. A multiline text area opens at the bottom of the comments section.
3. User types markdown content. `Enter` inserts newlines.
4. `Ctrl+S` submits the comment.
5. On success: text area closes, optimistic comment appears with `⏳ just now`, finalizes to server data.
6. `Esc` cancels. If non-empty, a discard confirmation (`y`/`n`) appears.

**Status bar hints:**
- While composing: `Ctrl+S:submit │ Esc:cancel`
- While browsing comments: `n/p:comments │ c:comment │ ?:help`

### Neovim Plugin API

The Neovim plugin does not directly expose a landing comment creation command in the current design. Users can create comments via the CLI command `codeplane land comment` from Neovim's terminal or command line.

### Documentation

The following end-user documentation should be written:

1. **CLI reference for `land comment`**: Synopsis, arguments, options, examples of general and inline comments, JSON output example, common error messages and their meaning.
2. **API reference for `POST /api/repos/:owner/:repo/landings/:number/comments`**: Full request/response schema, authentication requirements, validation rules, error codes with examples.
3. **Web UI guide: Commenting on landing requests**: How to leave general comments, how to leave inline diff comments, markdown formatting guide, @mention behavior.
4. **TUI guide: Landing request comments**: Keybindings for composing, submitting, and canceling comments, inline vs. general comment distinctions.

## Permissions & Security

### Authorization Model

| Role | Can create comments? | Notes |
|------|---------------------|-------|
| Repository Owner | ✅ Yes | Full access |
| Organization Admin | ✅ Yes | Admin implies write access |
| Team Member (write) | ✅ Yes | Team has write permission on repo |
| Team Member (read) | ❌ No | Read-only access; 403 returned |
| Collaborator (write) | ✅ Yes | Explicit write collaboration |
| Collaborator (read) | ❌ No | Read-only; 403 returned |
| Authenticated (no repo access) | ❌ No | 404 returned (repo not visible) |
| Anonymous / Unauthenticated | ❌ No | 401 returned |

**Key enforcement points:**
- The server's `requireWriteAccess()` check is the single authoritative gate.
- Landing comment creation requires **write** access, which is stricter than issue comments (which may allow broader participation on public repos). This is because landing request comments are part of the code review process and should be limited to trusted collaborators.

### Rate Limiting

| Scope | Limit | Window | Response |
|-------|-------|--------|----------|
| Per-user comment creation | 30 requests | 1 minute | `429` with `Retry-After` header |
| Per-repository comment creation | 120 requests | 1 minute | `429` with `Retry-After` header |
| Global write operations | Governed by server-wide rate limit middleware | — | `429` |

Rate limits are enforced server-side. Clients should respect the `Retry-After` header and display a user-friendly message.

### Data Privacy

- Comment bodies may contain @mentions that reference usernames. Usernames are public identifiers, not PII.
- Comment bodies may contain arbitrary user-supplied text. The server stores content as-is; client-side rendering must sanitize to prevent XSS.
- The `author` field in responses contains only `id` and `login` — no emails or private profile data.
- File paths in inline comments are repository content references, not user PII.
- Audit logs should record comment creation events with actor ID, repository ID, and landing request ID, but should NOT log the full comment body (which may contain sensitive code context).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingCommentCreated` | Comment successfully created (201 response) | `comment_id`, `landing_request_id`, `repository_id`, `owner`, `repo`, `author_id`, `author_login`, `is_inline` (boolean), `has_path` (boolean), `line`, `side`, `body_length`, `mention_count`, `client` (web/cli/tui/api), `response_time_ms` |
| `LandingCommentCreateFailed` | Comment creation returned non-2xx | `landing_request_id`, `repository_id`, `owner`, `repo`, `author_id`, `error_code` (401/403/404/422/429/500), `error_field` (if 422), `client`, `body_length` |
| `LandingCommentCreateAttempted` | User initiates comment creation (client-side) | `landing_request_id`, `owner`, `repo`, `client`, `is_inline`, `body_length`, `time_composing_ms` |

### Event Properties Detail

All events include base properties:
- `timestamp` (ISO 8601)
- `session_id`
- `user_id`
- `client_version`

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Comment creation success rate | > 98% | Percentage of creation attempts that result in 201 |
| Inline comment ratio | > 20% | Percentage of comments that are inline (indicates diff-aware reviewing) |
| Mean body length | > 40 characters | Indicates substantive review feedback |
| Comments per landing request (median) | > 2 | Indicates active review culture |
| Time from LR open to first comment (p50) | < 4 hours | Indicates review responsiveness |
| CLI comment share | > 10% | Indicates CLI is being used for review workflows |
| @mention rate | > 15% | Indicates directed review communication |
| 422 validation error rate | < 5% | Indicates clear client-side validation catches problems |
| 429 rate limit hit rate | < 0.5% | Indicates rate limits are not impeding normal use |

## Observability

### Structured Logging

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `info` | Comment created successfully | `event=landing_comment_created`, `comment_id`, `landing_request_id`, `repository_id`, `user_id`, `is_inline`, `body_length`, `duration_ms` |
| `warn` | Validation failure on comment creation | `event=landing_comment_validation_failed`, `field`, `code`, `user_id`, `landing_request_id`, `repository_id` |
| `warn` | Rate limit hit on comment creation | `event=landing_comment_rate_limited`, `user_id`, `repository_id`, `retry_after_s` |
| `warn` | Comment creation took > 2000ms | `event=landing_comment_slow_create`, `duration_ms`, `landing_request_id`, `repository_id` |
| `error` | Database insert failure | `event=landing_comment_db_error`, `landing_request_id`, `repository_id`, `user_id`, `error_message` |
| `error` | Unexpected server error during creation | `event=landing_comment_internal_error`, `landing_request_id`, `repository_id`, `user_id`, `error_message`, `stack_trace` |
| `debug` | Comment creation request received | `event=landing_comment_create_request`, `landing_request_id`, `owner`, `repo`, `number`, `user_id`, `body_length`, `is_inline` |
| `debug` | Write access check performed | `event=landing_comment_access_check`, `user_id`, `repository_id`, `result` (allowed/denied) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_comment_created_total` | Counter | `owner`, `repo`, `is_inline`, `client` | Total comments created |
| `codeplane_landing_comment_create_errors_total` | Counter | `owner`, `repo`, `error_code`, `error_field` | Total creation errors by type |
| `codeplane_landing_comment_create_duration_seconds` | Histogram | `owner`, `repo` | Request-to-response latency for comment creation |
| `codeplane_landing_comment_body_size_bytes` | Histogram | `is_inline` | Distribution of comment body sizes |
| `codeplane_landing_comment_rate_limited_total` | Counter | `scope` (user/repo) | Rate limit rejections |

### Alerts

**Alert 1: High comment creation error rate**
- **Condition:** `rate(codeplane_landing_comment_create_errors_total{error_code=~"5.."}[5m]) / rate(codeplane_landing_comment_created_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check recent server logs for `event=landing_comment_db_error` and `event=landing_comment_internal_error`.
  2. Verify database connectivity: `SELECT 1` against the primary database.
  3. Check if the `landing_request_comments` table is locked or has excessive row locks.
  4. Check for recent schema migrations that may have broken the insert query.
  5. Verify the landing service is healthy via `/api/health`.
  6. If database is healthy, check for memory pressure or OOM conditions on the server process.
  7. Escalate to the platform team if the database layer appears healthy but errors persist.

**Alert 2: Comment creation latency spike**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_landing_comment_create_duration_seconds_bucket[5m])) > 3`
- **Severity:** Warning
- **Runbook:**
  1. Check the `codeplane_landing_comment_create_duration_seconds` histogram for p50/p95/p99 breakdown.
  2. Check database query latency for the `createLandingRequestComment` query.
  3. Look for lock contention on the `landing_request_comments` table.
  4. Check if the `resolveRepoByOwnerAndName` or `requireWriteAccess` lookups are slow (indicates repo/permission cache miss).
  5. Check server CPU and memory metrics for resource saturation.
  6. If isolated to specific repositories, investigate whether those repos have an unusually high number of comments or concurrent landing requests.

**Alert 3: Excessive rate limiting**
- **Condition:** `rate(codeplane_landing_comment_rate_limited_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Identify which users or repositories are hitting rate limits from structured logs.
  2. Determine if the activity is legitimate (e.g., an agent creating many review comments) or abusive.
  3. If legitimate, consider whether rate limit thresholds need adjustment for agent workflows.
  4. If abusive, consider IP-level blocking or account review.
  5. Check for bot/automation patterns in the user agent or access token metadata.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Malformed JSON body | 400 | Request rejected before service layer | Client fixes payload format |
| Missing auth token | 401 | Rejected at middleware | User re-authenticates |
| Expired session/token | 401 | Rejected at middleware | User re-authenticates |
| No write access | 403 | Rejected at service layer after access check | User requests access or uses correct account |
| Repository not found | 404 | Rejected at service layer | User verifies owner/repo spelling |
| Landing request not found | 404 | Rejected at service layer | User verifies landing request number |
| Empty body | 422 | Rejected at service layer validation | User provides non-empty body |
| Negative line | 422 | Rejected at service layer validation | User provides valid line number |
| Missing path when line > 0 | 422 | Rejected at service layer validation | User provides file path |
| Invalid side value | 422 | Rejected at service layer validation | User uses "left", "right", or "both" |
| Rate limit exceeded | 429 | Rejected at middleware | Wait for `Retry-After` and retry |
| Database insert failure | 500 | `Result.err(internal(...))` returned | Retry; investigate if persistent |
| Database connection timeout | 500 | Service layer throws | Automatic retry via connection pool; alert fires if sustained |
| Concurrent duplicate insert | Success (201) | No uniqueness constraint on comments — duplicates are valid | Not an error |

## Verification

### API Integration Tests

| Test ID | Test Description |
|---------|------------------|
| API-LCC-001 | Create a general comment with valid body; verify 201 response with correct `id`, `author`, `body`, `path=""`, `line=0`, `side="right"`, `created_at`, `updated_at`. |
| API-LCC-002 | Create an inline comment with valid `body`, `path`, `line > 0`, `side="right"`; verify 201 with all fields populated. |
| API-LCC-003 | Create an inline comment with `side="left"`; verify response `side` is `"left"`. |
| API-LCC-004 | Create an inline comment with `side="both"`; verify response `side` is `"both"`. |
| API-LCC-005 | Create a comment with `side` omitted; verify it defaults to `"right"` in response. |
| API-LCC-006 | Create a comment with `side=""` (empty string); verify it defaults to `"right"`. |
| API-LCC-007 | Create a comment with `side="RIGHT"` (uppercase); verify normalization to `"right"`. |
| API-LCC-008 | Attempt to create a comment with `side="center"` (invalid); verify 422 with field `"side"`. |
| API-LCC-009 | Attempt to create a comment with empty `body: ""`; verify 422 with field `"body"`, code `"missing_field"`. |
| API-LCC-010 | Attempt to create a comment with whitespace-only `body: "   \n\t  "`; verify 422. |
| API-LCC-011 | Attempt to create a comment with `body` omitted from JSON; verify 422. |
| API-LCC-012 | Attempt to create a comment with `line: -1`; verify 422 with field `"line"`, code `"invalid"`. |
| API-LCC-013 | Attempt to create a comment with `line: 5` but `path: ""`; verify 422 with field `"path"`, code `"missing_field"`. |
| API-LCC-014 | Create a comment with `line: 0` and `path: "some/file.ts"`; verify 201 (valid file-level comment). |
| API-LCC-015 | Attempt to create a comment without authentication; verify 401. |
| API-LCC-016 | Attempt to create a comment with an expired or invalid token; verify 401. |
| API-LCC-017 | Attempt to create a comment as user with read-only access; verify 403. |
| API-LCC-018 | Attempt to create a comment on a non-existent repository; verify 404. |
| API-LCC-019 | Attempt to create a comment on a non-existent landing request number; verify 404. |
| API-LCC-020 | Create a comment with a body at the maximum length (262,144 characters); verify 201. |
| API-LCC-021 | Attempt to create a comment with a body exceeding 262,144 characters; verify 422. |
| API-LCC-022 | Create a comment with a `path` at the maximum length (4,096 characters); verify 201. |
| API-LCC-023 | Attempt to create a comment with `path` exceeding 4,096 characters; verify 422. |
| API-LCC-024 | Create a comment with markdown content (code blocks, links, bold, headings); verify body is stored verbatim. |
| API-LCC-025 | Create a comment with unicode content (emoji 🎉, CJK 日本語, Arabic عربي); verify body is preserved. |
| API-LCC-026 | Create a comment with `body` containing HTML tags; verify body is stored as-is (no server-side stripping). |
| API-LCC-027 | Create a comment with `body` containing @mention (`@alice`); verify 201 and body preserved. |
| API-LCC-028 | Create two comments in rapid succession on the same landing request; verify both are created with distinct IDs. |
| API-LCC-029 | Create comments from two different users concurrently on the same landing request; verify both succeed. |
| API-LCC-030 | After creating a comment, verify it appears in `GET /api/repos/:owner/:repo/landings/:number/comments` response. |
| API-LCC-031 | Create a comment on a closed landing request; verify 201 (comments allowed on any state). |
| API-LCC-032 | Create a comment on a merged landing request; verify 201. |
| API-LCC-033 | Send a POST request without `Content-Type: application/json`; verify 400. |
| API-LCC-034 | Send a POST request with malformed JSON body; verify 400. |
| API-LCC-035 | Send a POST request with an empty JSON object `{}`; verify 422 (body is required). |
| API-LCC-036 | Verify `created_at` and `updated_at` are equal on a newly created comment. |
| API-LCC-037 | Create a comment with `path` containing spaces and special characters (`src/my file (copy).ts`); verify preserved. |
| API-LCC-038 | Create a comment with `line: 0`, `path: ""`, `side: ""`; verify defaults to general comment with `side="right"`. |
| API-LCC-039 | Create a comment with `body` containing only newline characters (`\n\n\n`); verify 422 (trimmed to empty). |

### CLI E2E Tests

| Test ID | Test Description |
|---------|------------------|
| CLI-LCC-001 | `codeplane land comment <number> --body "test comment" --repo OWNER/REPO` creates a comment; verify success message. |
| CLI-LCC-002 | `codeplane land comment <number> --body "test" --repo OWNER/REPO --json` returns full JSON comment object. |
| CLI-LCC-003 | `codeplane land comment <number> --body "test"` without `--repo` infers repo from cwd; verify success. |
| CLI-LCC-004 | `codeplane land comment <number> --body ""` with empty body; verify error message about empty body. |
| CLI-LCC-005 | `codeplane land comment 999999 --body "test" --repo OWNER/REPO` with non-existent landing request; verify 404 error. |
| CLI-LCC-006 | `codeplane land comment <number> --body "test" --repo INVALID` with non-existent repo; verify error. |
| CLI-LCC-007 | `codeplane land comment <number> --body "markdown **bold** and \`code\`" --repo OWNER/REPO --json`; verify body is preserved in JSON output. |
| CLI-LCC-008 | `codeplane land comment <number> --body <262144-char-string> --repo OWNER/REPO`; verify success at max length. |
| CLI-LCC-009 | Verify the JSON output of `--json` includes `id`, `author.login`, `body`, `created_at`, `path`, `line`, `side`. |
| CLI-LCC-010 | Run `codeplane land comment` without `--body` flag; verify argument validation error. |

### Web UI E2E Tests (Playwright)

| Test ID | Test Description |
|---------|------------------|
| WEB-LCC-001 | Navigate to landing request detail; verify comment text area is visible for authenticated write-access user. |
| WEB-LCC-002 | Type comment text and click "Comment" button; verify comment appears in timeline. |
| WEB-LCC-003 | Submit an empty comment; verify submit button is disabled or validation error appears. |
| WEB-LCC-004 | After submitting, verify the text area is cleared. |
| WEB-LCC-005 | Verify optimistic comment appears immediately with pending indicator. |
| WEB-LCC-006 | Verify the comments count in the section header increments after successful comment creation. |
| WEB-LCC-007 | Navigate to diff viewer; click the `+` gutter button on a diff line; verify inline comment form opens. |
| WEB-LCC-008 | Submit an inline comment from the diff viewer; verify it appears in both diff and timeline. |
| WEB-LCC-009 | Verify comment text area is hidden for unauthenticated users with "Sign in to comment" prompt shown. |
| WEB-LCC-010 | Verify comment text area is hidden for read-only users with "Write access required" message shown. |
| WEB-LCC-011 | Submit a comment with markdown formatting; verify it renders correctly in the timeline (bold, code blocks, links). |
| WEB-LCC-012 | Create a comment on a closed landing request; verify it succeeds. |

### TUI E2E Tests

| Test ID | Test Description |
|---------|------------------|
| TUI-LCC-001 | Navigate to landing request detail, press `c`; verify text area opens. |
| TUI-LCC-002 | Type text and press `Ctrl+S`; verify comment is created and text area closes. |
| TUI-LCC-003 | Press `c`, leave empty, press `Ctrl+S`; verify validation error (no API call). |
| TUI-LCC-004 | Press `c`, type text, press `Esc`; verify discard confirmation appears. |
| TUI-LCC-005 | Press `c`, type text, press `Esc`, then `y`; verify text area closes and content is discarded. |
| TUI-LCC-006 | Press `c`, type text, press `Esc`, then `n`; verify text area remains with content preserved. |
| TUI-LCC-007 | Verify optimistic comment appears with `⏳ just now` timestamp after submission. |
| TUI-LCC-008 | Verify `c` keybinding is not available when unauthenticated. |
| TUI-LCC-009 | Verify status bar shows `Ctrl+S:submit │ Esc:cancel` while composing. |
| TUI-LCC-010 | Submit a comment, then verify it appears in the timeline via `n`/`p` navigation. |

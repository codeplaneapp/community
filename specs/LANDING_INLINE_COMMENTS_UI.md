# LANDING_INLINE_COMMENTS_UI

Specification for LANDING_INLINE_COMMENTS_UI.

## High-Level User POV

When a developer reviews a landing request in Codeplane, the diff tab shows every file change proposed by the jj change stack. The `LANDING_INLINE_COMMENTS_UI` feature brings the code review conversation directly into the diff viewer across the web UI and TUI.

With this feature, existing inline comments appear right below the diff lines they reference. Each comment is framed with a colored left border and shows the author's username, a relative timestamp, and the full markdown-rendered body. Reviewers can see the conversation in context — not in a separate tab — and understand immediately what feedback was given about a specific line of code. When multiple comments exist on the same line, they stack vertically in chronological order, creating a visible thread.

Creating a new inline comment is frictionless. In the web UI, hovering over a diff line reveals a `+` button in the gutter. Clicking it opens a comment form directly below the line with a markdown-enabled text area. The file path, line number, and diff side are automatically populated from the context. The developer writes their feedback, clicks "Comment," and sees the comment appear immediately via optimistic rendering while the server processes the request. In the TUI, the developer positions the cursor on a diff line and presses `c` to open a comment form below that line, types their feedback, and presses `Ctrl+S` to submit.

Navigating between comments is efficient. In both the web UI and TUI, keyboard shortcuts (`n` and `p`) jump between inline comments across the entire diff, scrolling the viewport to bring each comment into view. A comment count indicator shows the reviewer's position ("Comment 3 of 12"). This lets reviewers walk through all feedback systematically without manual scrolling through potentially thousands of diff lines.

The feature is deeply aware of the diff viewer's layout. In unified view, comments span the full content width below their referenced line. In split view, comments are positioned in the correct pane — left for deletions, right for additions, spanning both for context lines. Toggling between views repositions comments automatically. Comments also interact with hunk collapsing: hunks that contain comments are automatically expanded and cannot be collapsed, ensuring that review feedback is never hidden.

This feature transforms the diff tab from a read-only inspection surface into an active collaboration workspace where the code review conversation happens directly alongside the code being reviewed.

## Acceptance Criteria

### Core behavior
- [ ] Inline comments from the API are rendered directly within the diff viewer, below the diff line they reference
- [ ] Comments are positioned based on their `path`, `line`, and `side` fields to match the correct diff line
- [ ] For `side === "right"`, the comment anchors below the addition line with that line number
- [ ] For `side === "left"`, the comment anchors below the deletion line with that line number
- [ ] For `side === "both"`, the comment anchors below the context line with that line number
- [ ] Multiple comments on the same line stack vertically in chronological order (oldest first)
- [ ] Each comment block renders: author username, relative timestamp, and markdown-rendered body
- [ ] Each comment block is visually distinguished from diff content with a colored left border
- [ ] Comments with `path === ""` or `line === 0` (general comments) are NOT rendered inline — they remain in the Comments tab
- [ ] An `(edited)` indicator appears when `updated_at` differs from `created_at`
- [ ] Comments authored by the current user show a `(you)` suffix after the username
- [ ] Comment bodies render with full markdown support: headings, lists, code blocks with syntax highlighting, bold, italic, links, blockquotes

### Comment creation from diff viewer
- [ ] Authenticated users with write access can create inline comments directly from the diff viewer
- [ ] In the web UI, hovering over a diff line reveals a `+` button in the gutter
- [ ] Clicking the `+` button opens an inline comment form below the diff line
- [ ] In the TUI, pressing `c` on a focused diff line opens a comment creation form below that line
- [ ] The form auto-populates `path`, `line`, and `side` from the diff context
- [ ] The `side` is determined by the line type: `"right"` for additions, `"left"` for deletions, `"both"` for context lines
- [ ] The form includes a markdown-enabled text area and a submit button
- [ ] On successful submission, the comment appears immediately via optimistic rendering
- [ ] The optimistic comment is replaced with server response data (real `id`, `created_at`) on success
- [ ] On submission failure, the optimistic comment is removed and an error message is displayed
- [ ] On failure, the typed content is preserved for retry
- [ ] Unauthenticated users see a "Sign in to comment" prompt instead of the comment form trigger
- [ ] Users with read-only access see a "Write access required to comment" message

### Comment navigation
- [ ] `n` moves focus to the next inline comment in the diff (ordered by file position, then chronological within same line)
- [ ] `p` moves focus to the previous inline comment
- [ ] When navigating to a comment not currently visible, the viewport scrolls to bring it into view
- [ ] A position indicator shows "Comment N of M" when a comment is focused
- [ ] `n` on the last comment is a no-op
- [ ] `p` on the first comment is a no-op
- [ ] If there are zero inline comments, `n` and `p` are no-ops
- [ ] Navigation crosses file boundaries

### Diff view mode interaction
- [ ] In unified view, comments span the full content width below the referenced line
- [ ] In split view, `side === "left"` comments appear in the left pane
- [ ] In split view, `side === "right"` comments appear in the right pane
- [ ] In split view, `side === "both"` comments span both panes
- [ ] Toggling between unified and split view repositions comments correctly
- [ ] Comment navigation (`n`/`p`) works in both view modes

### Collapsed hunk interaction
- [ ] Hunks containing inline comments are automatically expanded
- [ ] Hunks with inline comments cannot be collapsed
- [ ] "Collapse all" operations skip hunks that contain comments

### Input validation
- [ ] Comment body is required; empty or whitespace-only bodies are rejected
- [ ] Comment body must not exceed 262,144 characters (256 KiB)
- [ ] `line` must be a non-negative integer (≥ 0)
- [ ] If `line > 0`, `path` is required (non-empty)
- [ ] `path` must not exceed 4,096 characters
- [ ] `side` must be one of `"left"`, `"right"`, or `"both"`; defaults to `"right"` if omitted

### Edge cases
- [ ] Comment referencing a line number that no longer exists in the current diff renders at end of file with "Line N not found in current diff" notice
- [ ] Comment referencing a file path not in the current diff is not rendered inline (appears only in Comments tab)
- [ ] Toggling whitespace filtering may shift diff lines; comments losing their anchor render with "Line not found" notice
- [ ] Only one comment form can be open at a time; opening a second closes the first (with discard confirmation if content exists)
- [ ] Pressing the comment trigger on hunk header, binary file notice, file header, or "large diff collapsed" indicator is a no-op
- [ ] Pressing the comment trigger on an existing comment block opens a new comment on the same referenced line
- [ ] Maximum 500 inline comments loaded per landing diff; beyond this, a notice: "Showing 500 of N comments. View all in Comments tab."
- [ ] Double-submit prevention: submit is disabled after first click/keypress until API response is received
- [ ] Concurrent comment creation by multiple users succeeds without conflict
- [ ] Landing requests in any state (open, closed, merged) display existing inline comments; comment creation is allowed on all states

### Definition of Done
- [ ] Web UI diff viewer renders existing inline comments anchored to diff lines
- [ ] Web UI supports inline comment creation via `+` gutter button
- [ ] TUI diff viewer renders existing inline comments anchored to diff lines
- [ ] TUI supports inline comment creation via `c` key
- [ ] Comment navigation (`n`/`p`) works in both web UI and TUI
- [ ] Split view and unified view correctly position comments
- [ ] Hunk collapse/expand correctly interacts with comments
- [ ] Optimistic rendering and error recovery work end-to-end
- [ ] The feature is gated behind the `LANDING_INLINE_COMMENTS_UI` feature flag
- [ ] All E2E tests (Playwright, CLI, TUI) pass
- [ ] Telemetry events fire correctly
- [ ] Observability metrics and structured logs are emitted

## Design

### Web UI Design

**Location:** Diff tab within the landing request detail page (`/:owner/:repo/landings/:number`, Diff tab)

**Comment loading:**
- When the diff tab mounts, inline comments are fetched via `GET /api/repos/:owner/:repo/landings/:number/comments`
- Comments are indexed by `(path, line, side)` into a lookup map for O(1) anchoring during diff rendering
- Comments with `path === ""` or `line === 0` are excluded from the inline index

**Inline comment rendering:**

Each comment block below a diff line renders as:
```
┃ @alice · 3 hours ago
┃ This should use useMemo to avoid re-renders.
```

- Left border: 3px solid, using the project's primary color
- Background: subtle tint (e.g., `rgba(primary, 0.05)`) to distinguish from diff lines
- Author avatar (16×16, circle) + `@username` in bold primary color
- Relative timestamp in muted color
- `(you)` suffix in muted color for the current user's comments
- `(edited)` indicator in muted color when `updated_at !== created_at`
- Body rendered as markdown using the same markdown renderer as issue comments
- A 4px gap between stacked comment blocks on the same line
- An 8px gap between the last comment block and the next diff line

**Comment creation trigger (gutter `+` button):**
- On hover over any diff line, a `+` icon appears in the gutter (left of line numbers)
- The icon uses a 20×20 circular button with a tooltip: "Add a comment"
- The icon is visible in both unified and split views
- In split view, the `+` button appears in the gutter of the relevant pane
- The icon is hidden on touch devices; instead, tapping a line number opens the form
- The icon is not shown for binary file placeholders, file headers, hunk headers, or "large diff collapsed" indicators

**Inline comment form (opened from diff):**
- Slides in below the clicked diff line with a smooth 200ms animation
- Context header: file icon + `path:line (side)` in muted text
- Markdown text area with toolbar (bold, italic, code, link, quote buttons) and preview toggle
- Text area height: 120px initial, auto-expands up to 300px as content grows
- "Comment" submit button (primary color) below the text area, right-aligned
- "Cancel" text button to the left of the submit button
- Submit button is disabled when text area is empty
- Submit button shows a spinner and "Commenting..." text during submission
- On successful submission: form closes, comment appears inline with optimistic rendering
- On failure: form remains open, error banner appears above the text area ("Failed to submit comment. Please try again."), typed content preserved
- `Ctrl+Enter` / `Cmd+Enter` keyboard shortcut submits the form
- `Esc` closes the form; if content exists, a small confirmation: "Discard comment?" with "Discard" and "Keep editing" buttons

**Comment navigation:**
- `n` / `p` keyboard shortcuts navigate forward/backward through inline comments
- A floating pill indicator appears in the bottom-right of the diff pane: "Comment 3 of 12" with arrow buttons
- The pill is visible whenever there is at least one inline comment and the diff tab is active
- Clicking the left/right arrows on the pill performs `p`/`n` navigation
- The focused comment receives an elevated visual treatment: brighter left border, subtle box shadow
- The viewport scrolls smoothly (300ms ease) to center the focused comment
- Focus is cleared when the user scrolls manually or clicks elsewhere

**Split view comment positioning:**
- `side === "left"` comments render in the left (old content) pane, spanning the full pane width
- `side === "right"` comments render in the right (new content) pane, spanning the full pane width
- `side === "both"` comments render spanning both panes (full width of the diff area)
- In unified view, all comments render at full width regardless of side

**Responsive behavior:**
- Below 768px: comment form is full-width; gutter `+` button is replaced by a tap-on-line-number action; navigation pill moves to top of viewport
- Between 768px and 1200px: standard layout
- Above 1200px: generous padding on comment blocks

**Web UI Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `n` | Next inline comment |
| `p` | Previous inline comment |
| `c` | Open comment form on focused/hovered line |
| `Ctrl+Enter` / `Cmd+Enter` | Submit comment form |
| `Esc` | Close comment form (with confirmation if content exists) |

### TUI UI

**Comment rendering:**
- Comments render inline below their referenced diff line using a `│` left border in primary color (ANSI 33)
- Author: `@username` in primary color with BOLD attribute
- Timestamp: relative format in muted color (ANSI 245); format varies by terminal size:
  - 80×24: short (`2h`)
  - 120×40: medium (`2h ago`)
  - 200×60+: full (`2 hours ago`)
- Body: rendered via the `<markdown>` component with syntax-highlighted code blocks
- 1-row gap between stacked comment blocks; 1-row gap after last comment before next diff line
- Comment blocks indented 2 characters from left edge of diff content area

**Comment creation form:**
- Opened with `c` on a focused diff line (landing request diffs only; no-op on change diffs)
- Context header: `📄 {path}:{line} ({side})` in primary color
- Multi-line textarea; height varies by terminal size: 5 rows (80×24), 8 rows (120×40), 12 rows (200×60+)
- Width: available content width minus 4 characters (2 indent + 2 border)
- `Enter` inserts newline; `Ctrl+S` submits; `Esc` cancels (with discard confirmation if content exists)
- Character counter appears at 40,000+ characters (muted), 45,000+ (warning/ANSI 178), 49,000+ (error/ANSI 196)
- Hard cap at 50,000 characters
- Status bar: `Ctrl+S:submit │ Esc:cancel` while form is open
- All other diff keybindings disabled while form is open (except `Ctrl+C` and `?`)

**Comment navigation:**
- `n`/`p` navigate between inline comments across all files
- Focused comment: brighter left border (primary + BOLD)
- Status bar: "Comment N of M"
- Viewport scrolls to show focused comment with 2 lines of context above

**Split view interaction:**
- `side === "left"` comments in left pane; `side === "right"` in right pane; `side === "both"` spans both panes
- Split view only available at ≥120 terminal columns

**Edge case handling in TUI:**
- Terminal resize preserves form content, cursor position, and context header
- `c` on hunk header, binary notice, file header, collapsed hunk summary: no-op
- `c` while unauthenticated: status bar message "Sign in to comment. Run `codeplane auth login`."
- `c` while read-only: status bar message "Write access required to comment."
- View toggle (`t`) while form open: form closes with content preserved; status bar: "Comment form closed. Press c to reopen."
- `NO_COLOR` mode: `|` ASCII fallback for borders, underline instead of color

### API Shape

This feature consumes existing API endpoints (no new endpoints required):

**Fetch inline comments:**
```
GET /api/repos/:owner/:repo/landings/:number/comments?page=1&per_page=100
```
Returns paginated `LandingCommentResponse[]` with `X-Total-Count` header.

**Create inline comment:**
```
POST /api/repos/:owner/:repo/landings/:number/comments
Content-Type: application/json

{
  "body": "This should use useMemo to avoid re-renders.",
  "path": "src/components/Header.tsx",
  "line": 42,
  "side": "right"
}
```
Returns `201 Created` with `LandingCommentResponse`.

### SDK Shape

The `@codeplane/ui-core` package provides shared hooks and stores consumed by both web UI and TUI:

```typescript
// Hook: fetch inline comments for a landing request
useLandingComments(owner: string, repo: string, number: number): {
  comments: LandingCommentResponse[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Hook: create a new inline comment
useCreateLandingComment(owner: string, repo: string, number: number): {
  create: (input: CreateLandingCommentInput) => Promise<LandingCommentResponse>;
  loading: boolean;
  error: Error | null;
}

// Utility: index comments by file+line+side for O(1) lookup during rendering
buildInlineCommentIndex(comments: LandingCommentResponse[]): Map<string, LandingCommentResponse[]>
// Key format: `${path}:${line}:${side}`

// Store: inline comment navigation state
InlineCommentNavigationStore: {
  focusedIndex: number | null;
  totalComments: number;
  orderedComments: LandingCommentResponse[];
  focusNext: () => void;
  focusPrevious: () => void;
  clearFocus: () => void;
}
```

### Documentation

The following end-user documentation should be written:

1. **"Inline comments in landing request diffs"** (Web UI guide): How to leave inline comments from the diff viewer, how to navigate between comments with `n`/`p`, how comments appear in both the diff and the Comments tab, how to use markdown in comment bodies.

2. **"TUI: Reviewing with inline comments"** (TUI guide): Keybindings for creating (`c`), submitting (`Ctrl+S`), canceling (`Esc`), and navigating (`n`/`p`) inline comments. Terminal size recommendations for optimal experience.

3. **"Keyboard shortcuts reference"** update: Add `n`, `p`, `c`, and `Ctrl+Enter`/`Cmd+Enter` to the existing diff viewer keyboard shortcut table for both web and TUI.

4. **"Landing request review workflow"** (Conceptual guide): How inline comments fit into the broader review workflow — creating comments during diff review, submitting reviews with attached comments, and tracking comment resolution.

## Permissions & Security

### Authorization Model

| Role | View inline comments | Create inline comments | Notes |
|------|---------------------|----------------------|-------|
| Repository Owner | ✅ | ✅ | Full access |
| Organization Admin | ✅ | ✅ | Admin implies write access |
| Team Member (write) | ✅ | ✅ | Write permission on repo |
| Team Member (read) | ✅ | ❌ | Can view, cannot create; 403 on create attempt |
| Collaborator (write) | ✅ | ✅ | Explicit write collaboration |
| Collaborator (read) | ✅ | ❌ | Can view, cannot create; 403 on create attempt |
| Anonymous (public repo) | ✅ | ❌ | Can view comments; no create trigger shown; 401 if attempted via API |
| Anonymous (private repo) | ❌ | ❌ | 401 on both view and create |
| Authenticated, non-member (private repo) | ❌ | ❌ | 404 returned (repo not visible) |

**Key enforcement points:**
- Viewing inline comments follows repository read access (`resolveReadableLanding()`)
- Creating inline comments requires repository write access (`requireWriteAccess()`)
- UI surfaces conditionally render the creation trigger (`+` button / `c` key) based on the user's write access; the create form is never shown to unauthorized users
- Server-side authorization is the single authoritative gate; client-side checks are UX optimizations only

### Rate Limiting

| Scope | Limit | Window | Response |
|-------|-------|--------|----------|
| Per-user comment creation | 30 requests | 1 minute | `429` with `Retry-After` header |
| Per-repository comment creation | 120 requests | 1 minute | `429` with `Retry-After` header |
| Per-user comment listing | 60 requests | 1 minute | `429` with `Retry-After` header |
| Anonymous comment listing (per IP) | 20 requests | 1 minute | `429` with `Retry-After` header |

Clients should respect the `Retry-After` header and display a user-friendly message ("Rate limit exceeded. Try again in N seconds.").

### Data Privacy

- Comment bodies may contain arbitrary user-supplied text including code snippets. Client-side rendering must sanitize HTML to prevent XSS.
- The `author` field in responses contains only `id` and `login` — no emails or private profile data.
- File paths are repository content references, not user PII.
- Inline comments on private repositories must only be visible to users with read access. The `Cache-Control: private, no-store` header should be set for private repository responses.
- Audit logs should record comment creation with actor ID, repository ID, and landing request ID, but should NOT log full comment bodies (which may contain sensitive code context).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingInlineCommentViewed` | Diff tab loads with ≥1 inline comment rendered | `landing_number`, `repository_id`, `owner`, `repo`, `inline_comment_count`, `file_count_with_comments`, `client` (web/tui) |
| `LandingInlineCommentCreated` | Inline comment successfully created from diff viewer | `comment_id`, `landing_request_id`, `repository_id`, `owner`, `repo`, `author_id`, `path`, `line`, `side`, `body_length`, `mention_count`, `time_composing_ms`, `client` (web/tui), `response_time_ms` |
| `LandingInlineCommentCreateFailed` | Inline comment creation from diff returned non-2xx | `landing_request_id`, `repository_id`, `owner`, `repo`, `author_id`, `error_code`, `client`, `body_length` |
| `LandingInlineCommentFormOpened` | User opens the inline comment creation form | `landing_request_id`, `owner`, `repo`, `path`, `line`, `side`, `client` |
| `LandingInlineCommentFormCancelled` | User cancels the inline comment form | `landing_request_id`, `owner`, `repo`, `had_content` (boolean), `client` |
| `LandingInlineCommentNavigated` | User uses `n`/`p` to navigate between comments | `landing_request_id`, `direction` (next/previous), `comment_index`, `total_comments`, `client` |
| `LandingInlineCommentNavigationPillUsed` | User clicks the navigation pill arrows (web only) | `landing_request_id`, `direction`, `client` |

### Event Properties

All events include base properties:
- `timestamp` (ISO 8601)
- `session_id`
- `user_id`
- `client_version`

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Inline comment adoption rate | ≥ 30% of diff views with comments show ≥1 inline comment | Indicates reviewers are using inline comments |
| Comment form open-to-submit rate | ≥ 75% | Percentage of opened comment forms that result in a successful submission |
| Inline comment ratio | ≥ 40% of all landing comments are inline | Indicates inline commenting is preferred over general comments for diff-specific feedback |
| Comment navigation usage | ≥ 25% of diff views with ≥2 comments use `n`/`p` navigation | Indicates navigation shortcuts are discoverable |
| Inline creation from diff vs. from Comments tab | ≥ 60% from diff viewer | Indicates the diff viewer is the primary creation surface |
| Mean body length for inline comments | ≥ 30 characters | Indicates substantive code review feedback |
| Comments per landing request (median, inline only) | ≥ 2 | Indicates active inline review culture |
| Time from diff view to first inline comment | p50 < 3 minutes | Indicates the workflow is fast and intuitive |
| Comment form cancel rate with content | < 15% | Indicates low friction in the submission flow |
| Diff-to-review conversion with inline comments | ≥ 20% of diff views with inline comment creation also result in a review submission | Indicates inline comments are part of the review workflow |

## Observability

### Structured Logging

| Level | Event | Structured Context |
|-------|-------|--------------------||
| `info` | Inline comments loaded for diff view | `event=landing_inline_comments_loaded`, `landing_request_id`, `repository_id`, `inline_comment_count`, `total_comment_count`, `duration_ms`, `client` |
| `info` | Inline comment created from diff viewer | `event=landing_inline_comment_created`, `comment_id`, `landing_request_id`, `repository_id`, `user_id`, `path`, `line`, `side`, `body_length`, `duration_ms` |
| `warn` | Inline comment creation validation failure | `event=landing_inline_comment_validation_failed`, `field`, `code`, `user_id`, `landing_request_id`, `repository_id` |
| `warn` | Rate limit hit on inline comment creation | `event=landing_inline_comment_rate_limited`, `user_id`, `repository_id`, `retry_after_s` |
| `warn` | Inline comment creation took > 2000ms | `event=landing_inline_comment_slow_create`, `duration_ms`, `landing_request_id`, `repository_id` |
| `warn` | Comment references non-existent line in diff | `event=landing_inline_comment_orphaned_line`, `comment_id`, `landing_request_id`, `path`, `line`, `side` |
| `warn` | Comment references file not in diff | `event=landing_inline_comment_orphaned_file`, `comment_id`, `landing_request_id`, `path` |
| `warn` | Inline comment count exceeds 500 threshold | `event=landing_inline_comments_truncated`, `landing_request_id`, `total_count`, `rendered_count` |
| `error` | Database insert failure for inline comment | `event=landing_inline_comment_db_error`, `landing_request_id`, `repository_id`, `user_id`, `error_message` |
| `error` | Unexpected error during inline comment creation | `event=landing_inline_comment_internal_error`, `landing_request_id`, `repository_id`, `user_id`, `error_message`, `stack_trace` |
| `debug` | Inline comment form opened by user | `event=landing_inline_comment_form_opened`, `landing_request_id`, `path`, `line`, `side`, `user_id`, `client` |
| `debug` | Inline comment navigation event | `event=landing_inline_comment_navigated`, `landing_request_id`, `direction`, `from_index`, `to_index`, `user_id` |
| `debug` | Comment index built for diff rendering | `event=landing_inline_comment_index_built`, `landing_request_id`, `indexed_count`, `excluded_general_count`, `unique_positions` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_inline_comments_loaded_total` | Counter | `owner`, `repo`, `client` | Total diff views that loaded inline comments |
| `codeplane_landing_inline_comments_per_diff` | Histogram | `client` | Distribution of inline comment count per diff view (buckets: 0, 1, 5, 10, 25, 50, 100, 250, 500) |
| `codeplane_landing_inline_comment_created_total` | Counter | `owner`, `repo`, `side`, `client` | Total inline comments created from diff viewer |
| `codeplane_landing_inline_comment_create_errors_total` | Counter | `owner`, `repo`, `error_code`, `client` | Total inline comment creation errors |
| `codeplane_landing_inline_comment_create_duration_seconds` | Histogram | `owner`, `repo` | Request-to-response latency for inline comment creation (buckets: 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_landing_inline_comment_body_size_bytes` | Histogram | `client` | Distribution of inline comment body sizes |
| `codeplane_landing_inline_comment_form_opened_total` | Counter | `client` | Total comment forms opened |
| `codeplane_landing_inline_comment_form_cancelled_total` | Counter | `client`, `had_content` | Total comment forms cancelled |
| `codeplane_landing_inline_comment_navigations_total` | Counter | `direction`, `client` | Total `n`/`p` navigations |
| `codeplane_landing_inline_comment_orphaned_total` | Counter | `type` (line/file) | Comments that could not be anchored to their referenced position |
| `codeplane_landing_inline_comment_rate_limited_total` | Counter | `scope` (user/repo) | Rate limit rejections |

### Alerts

**Alert 1: High inline comment creation error rate**
- **Condition:** `rate(codeplane_landing_inline_comment_create_errors_total{error_code=~"5.."}[5m]) / rate(codeplane_landing_inline_comment_created_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check recent server logs for `event=landing_inline_comment_db_error` and `event=landing_inline_comment_internal_error`.
  2. Verify database connectivity: `SELECT 1` against the primary database.
  3. Check if the `landing_request_comments` table is locked or has excessive row locks.
  4. Check for recent schema migrations that may have broken the insert query.
  5. Verify the landing service is healthy via `/api/health`.
  6. If database is healthy, check for memory pressure or OOM conditions on the server process.
  7. Check whether a specific repository is causing all errors by filtering on `owner`/`repo` labels.
  8. Escalate to the platform team if the database layer appears healthy but errors persist.

**Alert 2: Inline comment creation latency spike**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_landing_inline_comment_create_duration_seconds_bucket[5m])) > 3`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_landing_inline_comment_create_duration_seconds` histogram for p50/p95/p99 breakdown.
  2. Check database query latency for the `createLandingRequestComment` query (run an `EXPLAIN ANALYZE` if needed).
  3. Look for lock contention on the `landing_request_comments` table.
  4. Check if `resolveRepoByOwnerAndName` or `requireWriteAccess` lookups are slow (indicates repo/permission cache miss).
  5. Check server CPU and memory metrics for resource saturation.
  6. If isolated to specific repositories, investigate whether those repos have unusually high comment counts.

**Alert 3: Excessive rate limiting on inline comments**
- **Condition:** `rate(codeplane_landing_inline_comment_rate_limited_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Identify which users or repositories are hitting rate limits from structured logs.
  2. Determine if the activity is legitimate (e.g., an agent creating many review comments) or abusive.
  3. If legitimate, consider whether rate limit thresholds need adjustment for agent workflows.
  4. If abusive, consider IP-level blocking or account review.
  5. Check for bot/automation patterns in the user agent or access token metadata.

**Alert 4: High orphaned comment rate**
- **Condition:** `rate(codeplane_landing_inline_comment_orphaned_total[1h]) / rate(codeplane_landing_inline_comments_loaded_total[1h]) > 0.10`
- **Severity:** Warning
- **Runbook:**
  1. A high orphaned rate indicates comments are frequently referencing lines/files that no longer exist in the current diff.
  2. Check whether landing requests are being force-pushed frequently, causing diffs to shift.
  3. Verify that comment `path` and `line` values are being correctly stored (not truncated or corrupted).
  4. Consider whether a comment position re-mapping feature should be prioritized.
  5. If isolated to specific repos, check for unusual rebase/squash patterns in those repositories.

### Error Cases and Failure Modes

| Error Case | HTTP Status | UI Behavior | Recovery |
|------------|-------------|-------------|----------|
| Malformed JSON body | 400 | Form remains open, error banner shown | User fixes payload and resubmits |
| Missing auth | 401 | "Sign in to comment" prompt; form not available | User re-authenticates |
| Expired session/token | 401 | "Session expired" error; form content preserved | User re-authenticates |
| No write access | 403 | "Write access required" message; create trigger hidden | User requests access |
| Repository not found | 404 | Diff tab shows "Repository not found" | User verifies URL |
| Landing request not found | 404 | Diff tab shows "Landing request not found" | User verifies landing number |
| Empty body submission | 422 | Client-side validation catches; error shown below textarea | User writes comment body |
| Body exceeds max length | 422 | Client-side character counter prevents; server rejects if bypassed | User shortens body |
| Invalid side value | 422 | Should not occur (auto-populated); server rejects if tampered | Client fix |
| Rate limit exceeded | 429 | "Rate limit exceeded. Try again in N seconds." banner; form content preserved | Wait and retry |
| Database insert failure | 500 | Optimistic comment removed; "Failed to submit comment" error | Retry; escalate if persistent |
| Network error / timeout | — | "Network error. Check your connection and try again." banner; form content preserved | Retry after connectivity restored |
| SSE disconnect during submission | — | Optimistic comment remains; "Comment may not have been saved. Press R to refresh." notice | Refresh to verify |

## Verification

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| API-LICU-001 | Fetch diff and comments for a landing request; verify comments have `path`, `line`, `side` fields suitable for inline anchoring. |
| API-LICU-002 | Create an inline comment via `POST .../comments` with valid `path`, `line > 0`, `side="right"`, `body`; verify 201 response. |
| API-LICU-003 | Create an inline comment with `side="left"`; verify response `side` is `"left"`. |
| API-LICU-004 | Create an inline comment with `side="both"`; verify response `side` is `"both"`. |
| API-LICU-005 | Create an inline comment with `side` omitted; verify default to `"right"`. |
| API-LICU-006 | Create an inline comment with `body` at max length (262,144 chars); verify 201. |
| API-LICU-007 | Attempt to create comment with body at 262,145 chars; verify 422. |
| API-LICU-008 | Create an inline comment with `path` at max length (4,096 chars); verify 201. |
| API-LICU-009 | Attempt to create comment with `path` at 4,097 chars; verify 422. |
| API-LICU-010 | Attempt to create comment with empty body; verify 422. |
| API-LICU-011 | Attempt to create comment with whitespace-only body; verify 422. |
| API-LICU-012 | Attempt to create comment with `line: -1`; verify 422. |
| API-LICU-013 | Attempt to create comment with `line: 5` but empty `path`; verify 422. |
| API-LICU-014 | Attempt to create comment with `side: "center"` (invalid); verify 422. |
| API-LICU-015 | Attempt to create comment without authentication; verify 401. |
| API-LICU-016 | Attempt to create comment as user with read-only access; verify 403. |
| API-LICU-017 | Create comment on non-existent repository; verify 404. |
| API-LICU-018 | Create comment on non-existent landing request; verify 404. |
| API-LICU-019 | Create two inline comments on the same `path:line:side`; verify both created with distinct IDs. |
| API-LICU-020 | Create inline comments from two different users concurrently; verify both succeed. |
| API-LICU-021 | After creating an inline comment, verify it appears in `GET .../comments` response. |
| API-LICU-022 | Verify inline comments in list response are ordered chronologically (oldest first). |
| API-LICU-023 | Verify general comments (`path=""`, `line=0`) and inline comments coexist in the same list response. |
| API-LICU-024 | Create a comment on a closed landing request; verify 201. |
| API-LICU-025 | Create a comment on a merged landing request; verify 201. |
| API-LICU-026 | Create a comment with markdown (code blocks, bold, links, blockquotes); verify body stored verbatim. |
| API-LICU-027 | Create a comment with unicode content (emoji 🎉, CJK 日本語, RTL عربي); verify body preserved. |
| API-LICU-028 | Create a comment with `@mention`; verify body preserved and notification sent. |
| API-LICU-029 | Verify `X-Total-Count` header in comment list response is correct after creating inline comments. |
| API-LICU-030 | Paginate comments with `per_page=5`; verify pagination returns correct subsets. |
| API-LICU-031 | Request more than 100 `per_page`; verify capped at 100. |
| API-LICU-032 | Create comment with `Content-Type` not `application/json`; verify 400. |
| API-LICU-033 | Create comment with malformed JSON body; verify 400. |
| API-LICU-034 | Create comment with `side="RIGHT"` (uppercase); verify normalization to `"right"`. |
| API-LICU-035 | Verify `created_at` and `updated_at` are equal on newly created comment. |
| API-LICU-036 | Fetch comments for landing with zero comments; verify empty array and `X-Total-Count: 0`. |
| API-LICU-037 | Create inline comment with `path` containing spaces and special chars (`src/my file (copy).ts`); verify preserved. |
| API-LICU-038 | Verify rate limiting: create 31 comments in rapid succession as same user; verify 429 on 31st. |

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| WEB-LICU-001 | Navigate to landing request diff tab with existing inline comments; verify comment blocks render below their referenced diff lines. |
| WEB-LICU-002 | Verify each comment block shows author username, relative timestamp, and markdown-rendered body. |
| WEB-LICU-003 | Verify comments on the same line stack vertically in chronological order. |
| WEB-LICU-004 | Hover over a diff line; verify `+` button appears in the gutter. |
| WEB-LICU-005 | Click the `+` button; verify inline comment form opens below the diff line. |
| WEB-LICU-006 | Verify the comment form shows context header with file path, line number, and side. |
| WEB-LICU-007 | Type comment text and click "Comment"; verify comment appears inline with optimistic rendering. |
| WEB-LICU-008 | Verify the form clears and closes after successful submission. |
| WEB-LICU-009 | Submit an empty comment; verify submit button is disabled or validation error appears. |
| WEB-LICU-010 | Press `Ctrl+Enter` / `Cmd+Enter` in the form; verify it submits. |
| WEB-LICU-011 | Press `Esc` with content in the form; verify discard confirmation appears. |
| WEB-LICU-012 | Click "Discard" on confirmation; verify form closes and content is lost. |
| WEB-LICU-013 | Click "Keep editing" on confirmation; verify form remains open with content. |
| WEB-LICU-014 | Press `Esc` with empty form; verify form closes immediately without confirmation. |
| WEB-LICU-015 | Press `n` to navigate to the next inline comment; verify viewport scrolls and comment is focused. |
| WEB-LICU-016 | Press `p` to navigate to the previous inline comment; verify viewport scrolls and comment is focused. |
| WEB-LICU-017 | Verify navigation pill shows "Comment N of M" with correct counts. |
| WEB-LICU-018 | Click navigation pill arrows; verify same behavior as `n`/`p`. |
| WEB-LICU-019 | Press `n` on the last comment; verify no movement (no-op). |
| WEB-LICU-020 | Press `p` on the first comment; verify no movement (no-op). |
| WEB-LICU-021 | Toggle from unified to split view; verify comments reposition to the correct pane (`left` → left, `right` → right, `both` → spanning). |
| WEB-LICU-022 | Toggle from split to unified view; verify comments render at full width. |
| WEB-LICU-023 | Collapse a hunk without comments; verify it collapses. |
| WEB-LICU-024 | Attempt to collapse a hunk with inline comments; verify it remains expanded (or collapse control is hidden). |
| WEB-LICU-025 | Click "Collapse all"; verify hunks with comments remain expanded while others collapse. |
| WEB-LICU-026 | View landing diff with a binary file; verify `+` button is not shown on binary file placeholder. |
| WEB-LICU-027 | Verify comment form is not available for unauthenticated users; "Sign in to comment" shown instead. |
| WEB-LICU-028 | Verify comment form is not available for read-only users; "Write access required" message shown. |
| WEB-LICU-029 | Create an inline comment and verify it also appears in the Comments tab timeline. |
| WEB-LICU-030 | Verify `(edited)` indicator appears for comments where `updated_at !== created_at`. |
| WEB-LICU-031 | Verify `(you)` suffix appears on comments authored by the current user. |
| WEB-LICU-032 | Verify inline comments with markdown content (code blocks, bold, links) render correctly. |
| WEB-LICU-033 | Intercept API call to return 500; verify error banner appears in form and content is preserved. |
| WEB-LICU-034 | View diff with a comment referencing a line not in the current diff; verify "Line not found" indicator. |
| WEB-LICU-035 | View diff with more than 500 inline comments; verify truncation notice. |
| WEB-LICU-036 | Verify loading state: skeleton/spinner while comments are being fetched. |
| WEB-LICU-037 | At viewport < 768px, verify `+` button is replaced by tap-on-line-number and layout is responsive. |
| WEB-LICU-038 | Open comment form then click `+` on a different line; verify first form closes (with confirmation if content) and new form opens. |
| WEB-LICU-039 | Verify the focused comment has elevated visual treatment (brighter border, shadow). |
| WEB-LICU-040 | Verify manual scroll clears comment focus indicator. |
| WEB-LICU-041 | Submit comment with `Ctrl+Enter` / `Cmd+Enter` then verify double-submit prevention (button disabled during submission). |

### TUI Integration Tests

| Test ID | Description |
|---------|-------------|
| TUI-LICU-001 | Navigate to landing request diff with existing inline comments; verify comment blocks render below referenced lines. |
| TUI-LICU-002 | Verify comment block shows `@username` in primary color, timestamp in muted color, and markdown body. |
| TUI-LICU-003 | Verify comments on same line stack chronologically. |
| TUI-LICU-004 | Press `c` on a diff line; verify comment form opens below the line. |
| TUI-LICU-005 | Verify form context header shows `📄 path:line (side)`. |
| TUI-LICU-006 | Type text and press `Ctrl+S`; verify comment is created and form closes. |
| TUI-LICU-007 | Verify optimistic comment appears with `⏳ just now` indicator. |
| TUI-LICU-008 | Press `c` with empty text and press `Ctrl+S`; verify validation error and form remains open. |
| TUI-LICU-009 | Press `c`, type text, press `Esc`; verify discard confirmation appears. |
| TUI-LICU-010 | Press `y` on discard confirmation; verify form closes and content is discarded. |
| TUI-LICU-011 | Press `n` on discard confirmation; verify form remains with content. |
| TUI-LICU-012 | Press `n` to navigate to next comment; verify viewport scrolls and "Comment N of M" appears in status bar. |
| TUI-LICU-013 | Press `p` to navigate to previous comment; verify viewport scrolls. |
| TUI-LICU-014 | Press `n` on last comment; verify no-op. |
| TUI-LICU-015 | Press `p` on first comment; verify no-op. |
| TUI-LICU-016 | With zero inline comments, press `n`/`p`; verify no-ops. |
| TUI-LICU-017 | Toggle to split view (`t`); verify comments reposition correctly by side. |
| TUI-LICU-018 | Verify hunks with inline comments cannot be collapsed with `z`. |
| TUI-LICU-019 | Press `c` while unauthenticated; verify status bar shows "Sign in to comment" message. |
| TUI-LICU-020 | Press `c` while read-only; verify status bar shows "Write access required" message. |
| TUI-LICU-021 | Press `c` on a change diff (not landing request); verify no-op. |
| TUI-LICU-022 | Press `c` on hunk header, binary notice, file header; verify no-op for each. |
| TUI-LICU-023 | Press `c` while form already open; verify discard flow for existing form. |
| TUI-LICU-024 | Verify status bar shows `Ctrl+S:submit │ Esc:cancel` while form is open. |
| TUI-LICU-025 | Verify character counter appears at 40,000+ characters in textarea. |
| TUI-LICU-026 | Verify hard cap at 50,000 characters (input stops accepting). |
| TUI-LICU-027 | Toggle view mode (`t`) while form is open; verify form closes with "Press c to reopen" message and content preserved. |
| TUI-LICU-028 | View diff with comment referencing non-existent line; verify "Line N not found" notice. |
| TUI-LICU-029 | Verify comment navigation (`n`/`p`) crosses file boundaries. |
| TUI-LICU-030 | At 80×24 terminal, verify textarea is 5 rows and timestamps use short format. |
| TUI-LICU-031 | At 120×40 terminal, verify textarea is 8 rows and timestamps use medium format. |
| TUI-LICU-032 | At 200×60+ terminal, verify textarea is 12 rows and timestamps use full format. |
| TUI-LICU-033 | Verify `(edited)` and `(you)` indicators on comment blocks. |
| TUI-LICU-034 | Verify diff keybindings (`j/k`, `]`/`[`, `t`, `w`) are disabled while form is open. |
| TUI-LICU-035 | View diff with >500 inline comments; verify truncation notice. |

### Cross-Surface Consistency Tests

| Test ID | Description |
|---------|-------------|
| CROSS-LICU-001 | Create an inline comment from the web UI diff viewer; verify it appears in the TUI diff viewer on the correct line. |
| CROSS-LICU-002 | Create an inline comment from the TUI diff viewer; verify it appears in the web UI diff viewer on the correct line. |
| CROSS-LICU-003 | Create an inline comment from the CLI (`land comment --body "..." --path "..." --line N`); verify it appears inline in both web UI and TUI diff viewers. |
| CROSS-LICU-004 | Create an inline comment from the web UI diff viewer; verify it appears in the Comments tab timeline in all clients. |
| CROSS-LICU-005 | Create an inline comment as part of a review (via `LANDING_REVIEW_COMMENT`); verify it renders inline in the diff viewer with its parent review context. |
| CROSS-LICU-006 | Verify comment count is consistent across the diff viewer navigation pill ("Comment N of M") and the Comments tab header ("Comments (N)") after creating inline comments. |

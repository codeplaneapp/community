# LANDING_DETAIL_UI

Specification for LANDING_DETAIL_UI.

## High-Level User POV

When a Codeplane user navigates to a landing request—whether from a notification, a search result, the landing request list, or a direct link—they arrive at the Landing Detail view. This is the central collaboration surface for jj-native code review. It is Codeplane's answer to the pull request detail page, but built around jj concepts like change IDs, stacked changes, and conflict objects rather than branches and merge commits.

The landing detail view presents everything a reviewer or author needs in one place: the description of what is being proposed, the ordered stack of jj changes that make up the landing request, the current conflict status against the target bookmark, all reviews and comments from collaborators, a syntax-highlighted diff of every changed file, and the status of any automated checks. Users can read the full context, leave reviews (approve, request changes, or comment), add inline comments anchored to specific lines of code, edit the landing request metadata, and ultimately queue the landing request for merge—all without leaving the page.

The experience is consistent across every Codeplane surface. In the web UI, users see a tabbed layout with Overview, Changes, Reviews, Comments, and Diff tabs, plus an optional Checks tab when that feature is enabled. In the TUI, the same tabs are navigable with keyboard shortcuts. In the CLI, `codeplane land view` renders a structured text summary, and companion commands like `land review`, `land comment`, and `land land` provide the same mutation capabilities. Editor integrations in VS Code and Neovim surface landing request context directly in the development environment.

The landing detail view adapts to the user's role. Authors see edit controls and can close or reopen their landing requests. Reviewers see review submission forms. Administrators can dismiss reviews and queue landing requests for merge. Anonymous users viewing public repositories see a read-only view with no action controls. The experience degrades gracefully: if conflict data is unavailable, the conflict indicator shows "unknown" rather than hiding; if checks are not configured, the checks tab simply shows "No checks configured."

This is the surface where jj-native collaboration actually happens. It must feel fast, complete, and authoritative—users should never need to leave it to understand the state of a proposed change.

## Acceptance Criteria

### Definition of Done

- [ ] The landing detail view is fully rendered and navigable in the web UI, TUI, CLI, and editor integrations
- [ ] All five primary tabs (Overview, Changes, Reviews, Comments, Diff) load correctly with real data
- [ ] The optional Checks tab renders when the `LANDING_CHECKS_VIEW` feature flag is enabled
- [ ] All mutation actions (review, comment, edit, close/reopen, queue for merge) work end-to-end from each client
- [ ] Permission boundaries are enforced: anonymous users see read-only views, write users can review/comment/edit, admins can dismiss reviews and land
- [ ] All boundary constraints are enforced server-side and reflected in client-side validation
- [ ] The feature is gated behind the `LANDING_DETAIL_UI` feature flag
- [ ] E2E tests pass for all clients (Playwright for web, CLI integration tests, TUI snapshot tests)
- [ ] Telemetry events fire correctly for all key user actions
- [ ] Error states, empty states, and loading states are handled gracefully in all clients

### Functional Constraints

- [ ] Landing request number is displayed as `#N` (e.g., `#37`)
- [ ] Title must be 1–255 characters; leading/trailing whitespace is trimmed; empty title after trim is rejected
- [ ] Body (description) supports 0–100,000 characters of markdown; null body renders as "No description provided."
- [ ] Review body supports 0–50,000 characters; approve reviews allow empty body; comment and request-changes reviews require non-empty body
- [ ] Comment body must be 1–50,000 characters; empty comments are rejected
- [ ] Change stacks display 0–500 change IDs in their stack-ordered position
- [ ] Pagination for reviews, comments, and changes defaults to 30 items per page with a maximum of 100 per page
- [ ] State badge renders correctly for all six states: `open`, `draft`, `closed`, `merged`, `queued`, `landing`
- [ ] Conflict status renders as ✓ (clean), ✗ (conflicted), or ? (unknown)
- [ ] Timestamps display as relative format ("3 hours ago") for events within 30 days, and absolute format ("Jan 15, 2026") for older events
- [ ] Merged landing requests are fully read-only: no edit, review, comment, or land actions are available
- [ ] Closed landing requests allow reopen but not review submission or landing
- [ ] Queue for merge is blocked when conflict status is `conflicted`
- [ ] Queue for merge is blocked when required approvals (from protected bookmark configuration) are not met
- [ ] Duplicate review submissions from the same reviewer replace the previous review of the same type
- [ ] Inline comments require a valid file path, line number ≥ 1, and side (`left` or `right`)
- [ ] General comments have path="" and line=0
- [ ] Binary files in diffs display "Binary file added/modified/deleted" instead of patch content
- [ ] Files exceeding 1 MB of patch text display "Large diff collapsed" with an expand option
- [ ] Diff file tree sidebar lists all changed files and supports click-to-navigate
- [ ] Unified diff view is the default; split view is available as a toggle
- [ ] Whitespace-only changes can be hidden via a toggle (`ignore_whitespace` parameter)
- [ ] The landing detail page handles 404 (landing not found) with a clear "Landing request not found" message
- [ ] The landing detail page handles 403 (no access to private repository) with a clear "Access denied" message
- [ ] Special characters in title and body (including `<`, `>`, `&`, quotes, backticks, emoji, and zero-width characters) are handled correctly without XSS or rendering issues
- [ ] URLs in the body and comments are rendered as clickable links
- [ ] Code blocks in markdown are syntax-highlighted

### Edge Cases

- [ ] Landing request with 0 changes (empty stack) renders with "No changes in this landing request" message
- [ ] Landing request with 500 changes (maximum stack) renders without performance degradation and paginates correctly
- [ ] Landing request with a body of exactly 100,000 characters renders fully
- [ ] A body of 100,001 characters is rejected with a validation error
- [ ] Review with a body of exactly 50,000 characters is accepted
- [ ] Comment with a body of exactly 50,000 characters is accepted
- [ ] Landing request where the target bookmark has been deleted shows the bookmark name with a "deleted" indicator
- [ ] Landing request where the author account has been deleted shows "Deleted user" placeholder
- [ ] Landing request with all reviews dismissed shows the dismissed state clearly
- [ ] Rapid sequential review submissions from the same user are handled idempotently
- [ ] Navigating directly to a landing detail URL for a nonexistent number returns 404
- [ ] Navigating to a landing detail for a private repo without access returns 403
- [ ] Landing request with rename/copy file changes shows `old_path → new_path` format
- [ ] Landing request with conflicts in some changes but not others shows per-change conflict indicators
- [ ] The diff tab handles files with no newline at end of file correctly

## Design

### Web UI Design

#### Layout Structure

The landing detail page is accessed at `/:owner/:repo/landings/:number`. The page consists of:

**Header Section (always visible)**
- Breadcrumb: `owner / repo > Landings > #N`
- Title: bold, full-width, wrapping to multiple lines as needed
- State badge: colored chip — green (open), gray (draft), red (closed), magenta (merged), yellow (queued/landing)
- Metadata row: author avatar and username (linked), relative creation timestamp, target bookmark chip (`→ main`), conflict status icon (✓/✗/?), stack size ("3 changes")
- When state is `queued`: queue position indicator ("Position #2 in queue")
- When state is `merged`: merge timestamp shown

**Tab Bar**
Five primary tabs, left-aligned:
1. Overview
2. Changes (badge showing count)
3. Reviews (badge showing count)
4. Comments (badge showing count)
5. Diff (badge showing `+N / -M` additions/deletions summary)
6. Checks (conditionally shown when `LANDING_CHECKS_VIEW` flag is enabled, badge showing pass/fail count)

Tab selection persists in the URL fragment (e.g., `#reviews`) for deep linking.

**Action Sidebar (right-aligned, desktop only; collapses to action menu on mobile)**
- "Edit" button — opens inline edit form for title and body (visible to author and admins)
- "Close" / "Reopen" button — state toggle (visible to write+ users)
- "Queue for Merge" button — primary action, disabled with tooltip when blocked by conflicts or missing approvals (visible to write+ users on open landing requests)
- "Submit Review" button — opens review form (visible to authenticated write+ users, not on merged/closed landing requests)

#### Tab Content

**Overview Tab**
- Landing request body rendered as markdown with syntax highlighting for code blocks
- Conflict status card: shows overall status with expandable per-change conflict breakdown
- Review summary card: "2 approved, 1 changes requested, 0 pending" with reviewer avatars
- If body is null: "No description provided." in muted text

**Changes Tab**
- Ordered list of changes in the stack
- Each row: position number, change ID (monospace, truncated to 12 chars with full ID on hover), description (first line), author, relative timestamp
- Conflict indicator per change: ⚠ icon on conflicted changes
- Empty change indicator: ∅ icon on empty changes
- Vertical connector line showing stack ordering between changes

**Reviews Tab**
- Chronological list (oldest first)
- Each review: reviewer avatar and username, type badge ([Approved] green / [Changes Requested] red / [Commented] gray / [Dismissed] strikethrough), body rendered as markdown, relative timestamp
- "Submit Review" form at bottom: radio buttons for Approve / Request Changes / Comment, body textarea, submit button
- Dismiss button on individual reviews (visible to admins only), with confirmation dialog

**Comments Tab**
- General comments listed chronologically
- Inline comments grouped by file path, then by line number
- Each comment: author avatar and username, body rendered as markdown, file/line context (for inline), relative timestamp
- "Add Comment" form at bottom: body textarea, submit button
- Inline comment creation is handled from the Diff tab (not from the Comments tab directly)

**Diff Tab**
- File tree sidebar (25% width, left side, collapsible via toggle button)
  - Lists all changed files grouped by directory
  - Each file shows change type icon (A/D/M/R/C) and additions/deletions counts
  - Clicking a file scrolls the main diff pane to that file
- Main diff pane (75% width, right side)
  - Per-change grouping with change ID header
  - Per-file section with file path header, change type badge, and stats
  - Diff content: unified (default) or split view
  - Line numbers on both sides (old and new)
  - Syntax highlighting per language
  - Hunk headers (`@@`) displayed as separators
  - Inline comment indicators on lines with existing comments (click to expand)
  - "Add inline comment" button appears on hover over any diff line (click to open comment form)
- Toolbar: view mode toggle (Unified / Split), whitespace toggle, expand/collapse all hunks
- Binary files: "Binary file added/modified/deleted" placeholder
- Large files (>1 MB patch): "Large diff collapsed — click to expand"
- Empty diff: "No files changed"
- Rename display: `old_path → new_path`

**Checks Tab** (feature-flagged: `LANDING_CHECKS_VIEW`)
- Summary bar: aggregate status — "All 5 checks passed" (green), "2 of 5 checks pending" (yellow), "1 of 5 checks failed" (red), "No checks configured" (muted)
- Grouped by change ID in stack order
- Each check: status icon (✓ success / ✗ failure / ⚠ error / ⏳ pending / ○ missing), context name, description, timestamp
- Required checks marked with `[required]` badge
- Missing required checks shown as explicit entries with ○ icon

#### Responsive Behavior

- **Desktop (≥1200px)**: Full layout with action sidebar, file tree sidebar in diff tab
- **Tablet (768–1199px)**: Action sidebar collapses to dropdown menu, file tree hidden by default
- **Mobile (<768px)**: Single-column layout, tabs become horizontally scrollable, unified diff only, inline comments collapse to summary counts

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1`–`6` | Switch to tab by number |
| `e` | Open edit form (if permitted) |
| `r` | Open review form (if permitted) |
| `c` | Focus comment input |
| `m` | Queue for merge (if permitted) |
| `]` / `[` | Next/previous file in diff |
| `t` | Toggle diff view mode |
| `w` | Toggle whitespace visibility |
| `Ctrl+B` | Toggle file tree sidebar |
| `?` | Show keyboard shortcuts help |

### API Shape

All endpoints are scoped to `GET /api/repos/:owner/:repo/landings/:number` and sub-resources.

**GET /api/repos/:owner/:repo/landings/:number** — Returns `LandingRequestResponse`:
```
{
  number: number,
  title: string,
  body: string | null,
  state: "open" | "draft" | "closed" | "merged" | "queued" | "landing",
  author: { id: string, login: string, avatar_url: string },
  change_ids: string[],
  target_bookmark: string,
  conflict_status: "clean" | "conflicted" | "unknown",
  stack_size: number,
  created_at: string (ISO 8601),
  updated_at: string (ISO 8601),
  merged_at: string | null,
  queued_at: string | null
}
```

**GET .../landings/:number/changes?page=1&per_page=30** — Returns paginated `LandingRequestChange[]`

**GET .../landings/:number/reviews?page=1&per_page=30** — Returns paginated `LandingReviewResponse[]`

**POST .../landings/:number/reviews** — Body: `{ type, body? }` → 201 Created

**PATCH .../landings/:number/reviews/:review_id** — Body: `{ state: "dismissed", message? }` → 200

**GET .../landings/:number/comments?page=1&per_page=30** — Returns paginated `LandingCommentResponse[]`

**POST .../landings/:number/comments** — Body: `{ body, path?, line?, side? }` → 201 Created

**GET .../landings/:number/diff?ignore_whitespace=false** — Returns `LandingDiffResponse`

**GET .../landings/:number/conflicts** — Returns `LandingConflictsResponse`

**PATCH .../landings/:number** — Body: `{ title?, body?, state?, target_bookmark? }` → 200

**PUT .../landings/:number/land** — Returns `{ queue_position, task_id }` → 202 Accepted

### SDK Shape

The following hooks are provided in `@codeplane/ui-core`:

- `useLanding(owner, repo, number)` → `{ data, loading, error, refetch }`
- `useLandingChanges(owner, repo, number, page?)` → `{ data, loading, error, loadMore }`
- `useLandingReviews(owner, repo, number, page?)` → `{ data, loading, error, loadMore }`
- `useLandingComments(owner, repo, number, page?)` → `{ data, loading, error, loadMore }`
- `useLandingConflicts(owner, repo, number)` → `{ data, loading, error, refetch }`
- `useLandingDiff(owner, repo, number, ignoreWhitespace?)` → `{ data, loading, error }`
- `useUpdateLanding(owner, repo, number)` → `{ mutate(patch), loading, error }`
- `useLandLanding(owner, repo, number)` → `{ mutate(), loading, error }`
- `useCreateReview(owner, repo, number)` → `{ mutate({ type, body }), loading, error }`
- `useDismissReview(owner, repo, number, reviewId)` → `{ mutate({ message? }), loading, error }`
- `useCreateComment(owner, repo, number)` → `{ mutate({ body, path?, line?, side? }), loading, error }`

### CLI Commands

- `codeplane land view <number> [--repo owner/repo] [--json]` — Structured text summary; `--json .field` for field filtering
- `codeplane land review <number> [--approve] [--body "text"] [--repo]` — Submit review
- `codeplane land checks <number> [--repo] [--json]` — Check statuses grouped by change
- `codeplane land conflicts <number> [--repo] [--json]` — Conflict status and per-change details
- `codeplane land edit <number> [--title] [--body] [--target] [--repo]` — Edit metadata
- `codeplane land comment <number> --body "text" [--repo]` — Add general comment
- `codeplane land land <number> [--repo]` — Queue for merge

### TUI Design

The TUI landing detail screen is pushed from the landing list or via `:landing N`. Deep link: `codeplane tui --screen landings --repo owner/repo --landing N`.

**Layout:** Breadcrumb bar, header (title, state badge, metadata), tab bar (`[Overview] [Changes] [Reviews] [Comments] [Diff]`), scrollable content area, status bar with contextual hints.

**Keybindings:** `1`–`5` tab jump, `Tab`/`Shift+Tab` cycle, `j`/`k` scroll, `G`/`gg` jump, `m` merge, `x` close/reopen, `e` edit, `r` review, `c` comment, `t` toggle diff, `w` toggle whitespace, `]`/`[` next/prev file, `Ctrl+B` toggle file tree, `q` back, `?` help.

**Responsive:** 80×24 compact, 120×40 standard, 200×60+ expanded.

### Editor Integrations

**VS Code:** Landing detail in webview panel via Landings tree view. Status bar shows landing state. Context menu: approve, comment, view diff.

**Neovim:** `:CodeplaneLanding <number>` opens detail in split buffer. Telescope picker for selection. Commands: `:CodeplaneLandingReview`, `:CodeplaneLandingComment`.

### Documentation

1. **"Reviewing a Landing Request"** — Guide covering navigation, understanding the change stack, reading diffs, submitting reviews, and adding comments across web, CLI, and TUI.
2. **"Landing Request States"** — Reference for all six states, valid transitions, and meaning for authors/reviewers.
3. **"Inline Diff Comments"** — Guide on anchoring comments to specific code lines, viewing them in Comments tab, and threading.
4. **"Queueing a Landing Request for Merge"** — Guide on prerequisites (clean conflicts, approvals), queue position, and post-enqueue behavior.
5. **"Keyboard Shortcuts for Landing Requests"** — Quick reference for web UI and TUI shortcuts.

## Permissions & Security

### Authorization Roles

| Action | Anonymous (public repo) | Anonymous (private repo) | Read-Only Collaborator | Write Collaborator | Admin / Owner |
|--------|------------------------|--------------------------|------------------------|--------------------|---------------|
| View landing detail | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| View changes | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| View reviews | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| View comments | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| View diff | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| View checks | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| View conflicts | ✅ | ❌ (403) | ✅ | ✅ | ✅ |
| Submit review | ❌ (401) | ❌ (403) | ❌ (403) | ✅ | ✅ |
| Add comment | ❌ (401) | ❌ (403) | ❌ (403) | ✅ | ✅ |
| Edit landing request | ❌ (401) | ❌ (403) | ❌ (403) | ✅ (author only) | ✅ |
| Close / Reopen | ❌ (401) | ❌ (403) | ❌ (403) | ✅ | ✅ |
| Dismiss review | ❌ (401) | ❌ (403) | ❌ (403) | ❌ (403) | ✅ |
| Queue for merge | ❌ (401) | ❌ (403) | ❌ (403) | ✅ | ✅ |

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| GET landing detail | 120 requests | 1 minute | Per user/IP |
| GET changes/reviews/comments | 120 requests | 1 minute | Per user/IP |
| GET diff | 60 requests | 1 minute | Per user/IP (diff is computationally expensive) |
| GET conflicts | 60 requests | 1 minute | Per user/IP |
| POST review | 30 requests | 1 minute | Per authenticated user |
| POST comment | 60 requests | 1 minute | Per authenticated user |
| PATCH landing | 30 requests | 1 minute | Per authenticated user |
| PUT land | 10 requests | 1 minute | Per authenticated user |

### Data Privacy & PII

- Landing request bodies and comments may contain PII; they are stored as user-provided content and must not be logged at INFO level
- Author and reviewer usernames and avatar URLs are public information for public repositories
- For private repositories, all landing request data (including metadata) is restricted to authorized collaborators
- Email addresses are never exposed through landing request APIs
- Inline comments include file paths and line numbers from the repository, which are subject to repository access controls
- Review dismissal actions are auditable (the dismissal is recorded with the admin who performed it)
- API responses must never include internal database IDs that could leak sequence information beyond the landing request number

## Telemetry & Product Analytics

### Key Business Events

| Event | Properties | Trigger |
|-------|-----------|--------|
| `LandingDetailViewed` | `repo_id`, `landing_number`, `state`, `tab`, `viewer_role`, `client` (web/cli/tui/vscode/nvim) | User opens or navigates to landing detail |
| `LandingDetailTabSwitched` | `repo_id`, `landing_number`, `from_tab`, `to_tab`, `client` | User switches tabs |
| `LandingReviewSubmitted` | `repo_id`, `landing_number`, `review_type` (approve/comment/request_changes), `body_length`, `client` | User submits a review |
| `LandingReviewDismissed` | `repo_id`, `landing_number`, `review_id`, `dismisser_role`, `client` | Admin dismisses a review |
| `LandingCommentCreated` | `repo_id`, `landing_number`, `is_inline` (boolean), `body_length`, `file_path` (if inline), `client` | User creates a comment |
| `LandingDiffViewed` | `repo_id`, `landing_number`, `view_mode` (unified/split), `ignore_whitespace`, `file_count`, `total_additions`, `total_deletions`, `client` | User opens the diff tab |
| `LandingDiffFileNavigated` | `repo_id`, `landing_number`, `file_path`, `navigation_method` (sidebar_click/keyboard/scroll), `client` | User navigates to a specific file in the diff |
| `LandingEditSubmitted` | `repo_id`, `landing_number`, `fields_changed` (title/body/target), `client` | User edits landing metadata |
| `LandingStateChanged` | `repo_id`, `landing_number`, `from_state`, `to_state`, `actor_role`, `client` | User closes, reopens, or queues a landing |
| `LandingEnqueueAttempted` | `repo_id`, `landing_number`, `success` (boolean), `failure_reason` (conflicts/approvals/permission), `queue_position`, `client` | User attempts to queue for merge |
| `LandingChecksViewed` | `repo_id`, `landing_number`, `total_checks`, `passed`, `failed`, `pending`, `client` | User views the checks tab |
| `LandingConflictsViewed` | `repo_id`, `landing_number`, `conflict_status`, `conflicted_change_count`, `client` | User views conflict details |
| `LandingKeyboardShortcutUsed` | `repo_id`, `landing_number`, `shortcut_key`, `action`, `client` | User triggers a keyboard shortcut |

### Funnel Metrics & Success Indicators

- **Review completion rate**: % of landing requests that receive at least one review within 24 hours of creation
- **Time to first review**: Median time between landing request creation and first review submission
- **Landing success rate**: % of opened landing requests that reach `merged` state
- **Tab engagement distribution**: % of landing detail views that visit each tab (indicates which tabs are valuable)
- **Inline comment adoption**: % of comments that are inline (anchored to diff lines) vs. general
- **Diff interaction depth**: Average number of files navigated per diff view session
- **Multi-client usage**: % of users who interact with landing details across multiple clients (web + CLI, web + TUI, etc.)
- **Enqueue failure rate**: % of queue-for-merge attempts that fail due to conflicts or missing approvals (should decrease over time)
- **Keyboard shortcut adoption**: % of web/TUI landing detail sessions that use at least one keyboard shortcut

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Landing detail loaded | INFO | `repo_id`, `landing_number`, `state`, `user_id`, `client` | One log per detail view load |
| Landing detail load failed | ERROR | `repo_id`, `landing_number`, `error_code`, `error_message`, `user_id` | 4xx and 5xx failures |
| Review submitted | INFO | `repo_id`, `landing_number`, `review_type`, `reviewer_id` | Do NOT log review body |
| Review dismissed | WARN | `repo_id`, `landing_number`, `review_id`, `dismisser_id` | WARN level for audit trail |
| Comment created | INFO | `repo_id`, `landing_number`, `is_inline`, `commenter_id` | Do NOT log comment body |
| Landing edit | INFO | `repo_id`, `landing_number`, `fields_changed`, `editor_id` | Do NOT log title/body content |
| State transition | INFO | `repo_id`, `landing_number`, `from_state`, `to_state`, `actor_id` | All state changes logged |
| Enqueue attempt | INFO | `repo_id`, `landing_number`, `success`, `failure_reason`, `actor_id`, `queue_position` | Both success and failure |
| Diff generation | DEBUG | `repo_id`, `landing_number`, `change_count`, `file_count`, `duration_ms` | Performance tracking |
| Diff generation slow | WARN | `repo_id`, `landing_number`, `duration_ms` | When diff takes >5s |
| Conflict check | DEBUG | `repo_id`, `landing_number`, `conflict_status`, `duration_ms` | Performance tracking |
| Rate limit exceeded | WARN | `endpoint`, `user_id`, `ip`, `limit`, `window` | Rate limiting events |
| Pagination beyond last page | DEBUG | `repo_id`, `landing_number`, `resource`, `requested_page`, `total_pages` | Helps detect UI bugs |

### Prometheus Metrics

**Counters:**
- `codeplane_landing_detail_views_total{repo, state, client}` — Total landing detail page views
- `codeplane_landing_reviews_total{repo, type, client}` — Total reviews submitted by type
- `codeplane_landing_reviews_dismissed_total{repo}` — Total reviews dismissed
- `codeplane_landing_comments_total{repo, is_inline, client}` — Total comments created
- `codeplane_landing_edits_total{repo, client}` — Total landing edits
- `codeplane_landing_state_transitions_total{repo, from_state, to_state}` — State transition counts
- `codeplane_landing_enqueue_attempts_total{repo, success, failure_reason}` — Enqueue attempts
- `codeplane_landing_detail_errors_total{repo, endpoint, status_code}` — API errors by endpoint

**Histograms:**
- `codeplane_landing_detail_load_duration_seconds{tab}` — Time to load landing detail data per tab
- `codeplane_landing_diff_generation_duration_seconds{repo}` — Diff generation time
- `codeplane_landing_conflict_check_duration_seconds{repo}` — Conflict check time
- `codeplane_landing_review_body_length{type}` — Review body length distribution
- `codeplane_landing_comment_body_length{is_inline}` — Comment body length distribution
- `codeplane_landing_change_stack_size{repo}` — Distribution of change stack sizes

**Gauges:**
- `codeplane_landing_open_count{repo}` — Current count of open landing requests per repo
- `codeplane_landing_queue_depth{repo}` — Current merge queue depth per repo

### Alerts & Runbooks

**Alert: LandingDetailHighErrorRate**
- Condition: `rate(codeplane_landing_detail_errors_total{status_code=~"5.."}[5m]) > 0.05`
- Severity: Warning (>5%), Critical (>20%)
- Runbook:
  1. Check server logs for the specific endpoint failing: filter structured logs by ERROR level and `landing_number`
  2. Check database connectivity: `SELECT 1 FROM landing_requests LIMIT 1`
  3. Check if a specific repo is causing all errors (single-repo vs. systemic)
  4. Check if the repo-host/jj subprocess is responding (for diff/conflict endpoints)
  5. If jj subprocess is hung: restart the server process, file issue for investigation
  6. If database is down: follow database recovery runbook
  7. If systemic: check for recent deployments and consider rollback

**Alert: LandingDiffGenerationSlow**
- Condition: `histogram_quantile(0.95, codeplane_landing_diff_generation_duration_seconds) > 10`
- Severity: Warning (>10s p95), Critical (>30s p95)
- Runbook:
  1. Identify which repos have slow diffs from the `repo` label
  2. Check change stack size: large stacks (>50 changes) are expected to be slower
  3. Check server CPU/memory utilization
  4. Check disk I/O on repository storage volume
  5. If a specific repo is pathological: check for very large or binary files
  6. If systemic: check jj version compatibility and consider process pool tuning
  7. Temporary mitigation: increase timeout, consider caching diff results

**Alert: LandingEnqueueFailureSpike**
- Condition: `rate(codeplane_landing_enqueue_attempts_total{success="false"}[15m]) / rate(codeplane_landing_enqueue_attempts_total[15m]) > 0.8`
- Severity: Warning
- Runbook:
  1. Check `failure_reason` label: conflicts, approvals, or permissions?
  2. If conflicts: check if recent push to target bookmark introduced widespread conflicts (may be expected)
  3. If approvals: verify protected bookmark configuration hasn't been accidentally tightened
  4. If permissions: check auth/permission system
  5. Check if landing queue worker is running and processing queued items
  6. May fire legitimately during large rebase operations—check with team before escalating

**Alert: LandingConflictCheckFailures**
- Condition: `increase(codeplane_landing_detail_errors_total{endpoint="conflicts", status_code="500"}[10m]) > 10`
- Severity: Warning
- Runbook:
  1. Check server logs for conflict check errors
  2. Verify jj CLI is accessible from server process
  3. Check if repository exists and is not corrupted
  4. Try manual conflict check: `jj log -r <change_id>` on the repo
  5. If corruption suspected: check jj operation log
  6. Temporary mitigation: conflict status shows "unknown" (safe but degraded)

**Alert: LandingDetailLoadSlow**
- Condition: `histogram_quantile(0.95, codeplane_landing_detail_load_duration_seconds) > 3`
- Severity: Warning
- Runbook:
  1. Identify slowest tab from `tab` label
  2. For overview/changes/reviews/comments: likely database query issue—check query plans
  3. For diff: see LandingDiffGenerationSlow runbook
  4. Check database connection pool health
  5. Check for long-running transactions holding locks
  6. If all tabs slow: check server resource utilization and network latency to database

### Error Cases & Failure Modes

| Error | HTTP Status | Behavior | Recovery |
|-------|------------|----------|----------|
| Landing not found | 404 | "Landing request #N not found" | User navigates back to list |
| Repository not found | 404 | "Repository not found" | User checks URL |
| Access denied | 403 | "You don't have access" | User authenticates or requests access |
| Not authenticated (mutation) | 401 | Redirect to login (web) / error (CLI/TUI) | User authenticates |
| Insufficient permissions | 403 | Action button disabled with tooltip / error | User contacts admin |
| Validation error (title too long) | 422 | Inline validation error | User corrects input |
| Validation error (body too long) | 422 | Inline validation error | User corrects input |
| Conflict status unavailable | 200 | Shows `unknown` with ? icon | Graceful degradation |
| Diff generation failure | 500 | "Unable to load diff" with retry | User retries |
| Diff timeout | 504 | "Diff generation timed out" with retry | User retries |
| Rate limited | 429 | "Too many requests" with wait time | User waits |
| Enqueue blocked (conflicts) | 409 | Conflict message | User resolves conflicts |
| Enqueue blocked (approvals) | 409 | Approval requirement message | User obtains approvals |
| Review on merged landing | 422 | "Cannot review merged landing" | Informational |
| Server unavailable | 503 | "Service temporarily unavailable" | User retries |

## Verification

### API Integration Tests

- [ ] `GET /landings/:number` returns 200 with complete landing request data for an existing open landing
- [ ] `GET /landings/:number` returns 200 with `merged_at` populated for a merged landing
- [ ] `GET /landings/:number` returns 200 with `queued_at` populated for a queued landing
- [ ] `GET /landings/:number` returns 404 for a nonexistent landing number
- [ ] `GET /landings/:number` returns 404 for landing number 0
- [ ] `GET /landings/:number` returns 404 for a negative landing number
- [ ] `GET /landings/:number` returns 404 for a non-numeric landing number (e.g., "abc")
- [ ] `GET /landings/:number` returns 403 for a private repo without authentication
- [ ] `GET /landings/:number` returns 200 for a public repo without authentication
- [ ] `GET /landings/:number/changes` returns paginated changes ordered by `position_in_stack`
- [ ] `GET /landings/:number/changes` returns empty array for a landing with 0 changes
- [ ] `GET /landings/:number/changes?per_page=100` returns up to 100 changes
- [ ] `GET /landings/:number/changes?per_page=101` returns 422 (exceeds max per_page)
- [ ] `GET /landings/:number/changes?page=999` returns empty array (beyond last page)
- [ ] `GET /landings/:number/reviews` returns paginated reviews in chronological order
- [ ] `GET /landings/:number/reviews` returns empty array for a landing with no reviews
- [ ] `GET /landings/:number/reviews` includes dismissed reviews with `state: "dismissed"`
- [ ] `GET /landings/:number/comments` returns paginated comments
- [ ] `GET /landings/:number/comments` returns both general (line=0) and inline (line>0) comments
- [ ] `GET /landings/:number/comments` returns empty array for a landing with no comments
- [ ] `GET /landings/:number/diff` returns diff grouped by change ID
- [ ] `GET /landings/:number/diff?ignore_whitespace=true` excludes whitespace-only changes
- [ ] `GET /landings/:number/diff` returns `is_binary: true` for binary files
- [ ] `GET /landings/:number/diff` returns `change_type: "renamed"` with `old_path` for renames
- [ ] `GET /landings/:number/conflicts` returns `conflict_status: "clean"` for non-conflicting landing
- [ ] `GET /landings/:number/conflicts` returns `conflict_status: "conflicted"` with `conflicts_by_change` for conflicting landing
- [ ] `POST /landings/:number/reviews` with `type: "approve"` and empty body returns 201
- [ ] `POST /landings/:number/reviews` with `type: "comment"` and empty body returns 422
- [ ] `POST /landings/:number/reviews` with `type: "request_changes"` and empty body returns 422
- [ ] `POST /landings/:number/reviews` with `type: "approve"` and body of exactly 50,000 characters returns 201
- [ ] `POST /landings/:number/reviews` with body of 50,001 characters returns 422
- [ ] `POST /landings/:number/reviews` without authentication returns 401
- [ ] `POST /landings/:number/reviews` with read-only permission returns 403
- [ ] `POST /landings/:number/reviews` on a merged landing returns 422
- [ ] `POST /landings/:number/reviews` on a closed landing returns 422
- [ ] `PATCH /landings/:number/reviews/:review_id` with `state: "dismissed"` by admin returns 200
- [ ] `PATCH /landings/:number/reviews/:review_id` with `state: "dismissed"` by non-admin returns 403
- [ ] `PATCH /landings/:number/reviews/:review_id` for nonexistent review returns 404
- [ ] `POST /landings/:number/comments` with valid body returns 201
- [ ] `POST /landings/:number/comments` with body of exactly 50,000 characters returns 201
- [ ] `POST /landings/:number/comments` with body of 50,001 characters returns 422
- [ ] `POST /landings/:number/comments` with empty body returns 422
- [ ] `POST /landings/:number/comments` with inline context (path, line=5, side="left") returns 201
- [ ] `POST /landings/:number/comments` with inline context but line=0 returns 422
- [ ] `POST /landings/:number/comments` with inline context but missing path returns 422
- [ ] `POST /landings/:number/comments` with inline context but invalid side returns 422
- [ ] `POST /landings/:number/comments` without authentication returns 401
- [ ] `PATCH /landings/:number` with title of 1 character returns 200
- [ ] `PATCH /landings/:number` with title of 255 characters returns 200
- [ ] `PATCH /landings/:number` with title of 256 characters returns 422
- [ ] `PATCH /landings/:number` with title of only whitespace returns 422 (empty after trim)
- [ ] `PATCH /landings/:number` with body of 100,000 characters returns 200
- [ ] `PATCH /landings/:number` with body of 100,001 characters returns 422
- [ ] `PATCH /landings/:number` with `state: "closed"` on an open landing returns 200
- [ ] `PATCH /landings/:number` with `state: "open"` on a closed landing returns 200 (reopen)
- [ ] `PATCH /landings/:number` with `state: "merged"` returns 422 (invalid transition)
- [ ] `PATCH /landings/:number` on a merged landing returns 422
- [ ] `PATCH /landings/:number` by non-author write user returns 403
- [ ] `PUT /landings/:number/land` on an open, clean, approved landing returns 202 with queue_position and task_id
- [ ] `PUT /landings/:number/land` on a conflicted landing returns 409
- [ ] `PUT /landings/:number/land` on a landing without required approvals returns 409
- [ ] `PUT /landings/:number/land` on a closed landing returns 422
- [ ] `PUT /landings/:number/land` on an already-merged landing returns 422
- [ ] `PUT /landings/:number/land` on an already-queued landing returns 409
- [ ] `PUT /landings/:number/land` without authentication returns 401
- [ ] `PUT /landings/:number/land` with read-only permission returns 403

### CLI Integration Tests

- [ ] `codeplane land view <number>` displays landing request title, state, author, and metadata
- [ ] `codeplane land view <number> --json` outputs valid JSON matching `LandingRequestResponse` schema
- [ ] `codeplane land view <number> --json .title` outputs only the title field
- [ ] `codeplane land view <nonexistent>` exits with code 1 and "not found" error message
- [ ] `codeplane land review <number> --approve` submits an approval review and displays confirmation
- [ ] `codeplane land review <number> --body "feedback"` submits a comment review
- [ ] `codeplane land review <number>` without --approve or --body exits with usage error
- [ ] `codeplane land checks <number>` displays check statuses grouped by change
- [ ] `codeplane land checks <number> --json` outputs valid JSON
- [ ] `codeplane land conflicts <number>` displays conflict status
- [ ] `codeplane land conflicts <number>` on a clean landing displays "No conflicts"
- [ ] `codeplane land edit <number> --title "New Title"` updates the title
- [ ] `codeplane land edit <number> --title ""` exits with validation error
- [ ] `codeplane land edit <number>` without any flags exits with usage error
- [ ] `codeplane land comment <number> --body "My comment"` creates a comment
- [ ] `codeplane land comment <number>` without --body exits with usage error
- [ ] `codeplane land land <number>` on a landable request outputs queue position
- [ ] `codeplane land land <number>` on a conflicted request exits with code 1 and conflict message
- [ ] `codeplane land land <number>` on a nonexistent request exits with code 1 and not-found message

### Playwright (Web UI) E2E Tests

- [ ] Navigate to `/:owner/:repo/landings/:number` and verify page loads with correct title, state, and metadata
- [ ] Verify breadcrumb navigation renders correctly and links work
- [ ] Verify state badge color matches state (green=open, red=closed, magenta=merged, etc.)
- [ ] Click each tab (Overview, Changes, Reviews, Comments, Diff) and verify content loads
- [ ] Verify tab badge counts match actual data counts
- [ ] Verify URL fragment updates when switching tabs (e.g., `#reviews`)
- [ ] Navigate directly to `/:owner/:repo/landings/:number#diff` and verify diff tab is active
- [ ] Verify Overview tab renders markdown body with code blocks syntax-highlighted
- [ ] Verify Overview tab shows "No description provided." for null body
- [ ] Verify Changes tab lists changes in stack order with position numbers
- [ ] Verify Changes tab shows conflict indicators on conflicted changes
- [ ] Verify Reviews tab lists reviews chronologically with correct type badges
- [ ] Submit an approval review via the review form and verify it appears in the list
- [ ] Submit a "request changes" review and verify the badge renders correctly
- [ ] Verify admin can see and click dismiss button on reviews
- [ ] Verify non-admin cannot see dismiss button on reviews
- [ ] Verify Comments tab lists general and inline comments
- [ ] Add a general comment via the comment form and verify it appears in the list
- [ ] Verify Diff tab renders file tree sidebar with all changed files
- [ ] Click a file in the file tree and verify the diff pane scrolls to that file
- [ ] Toggle between unified and split diff views and verify rendering changes
- [ ] Toggle whitespace and verify whitespace-only changes are hidden/shown
- [ ] Verify binary files show "Binary file" placeholder in diff
- [ ] Verify rename files show `old_path → new_path` format
- [ ] Hover over a diff line and verify "add comment" button appears
- [ ] Click "add comment" on a diff line, submit an inline comment, and verify it appears
- [ ] Click "Edit" button, modify title, save, and verify title updates
- [ ] Click "Close" button on an open landing and verify state changes to closed
- [ ] Click "Reopen" button on a closed landing and verify state changes to open
- [ ] Click "Queue for Merge" on a landable request and verify queue position is displayed
- [ ] Verify "Queue for Merge" button is disabled with tooltip when landing has conflicts
- [ ] Verify "Queue for Merge" button is disabled with tooltip when approvals are missing
- [ ] Verify all action buttons are hidden for anonymous users on public repos
- [ ] Verify merged landing requests show no action buttons
- [ ] Verify keyboard shortcut `1`–`5` switches tabs
- [ ] Verify keyboard shortcut `e` opens edit form
- [ ] Verify keyboard shortcut `r` opens review form
- [ ] Verify keyboard shortcut `t` toggles diff view mode
- [ ] Verify keyboard shortcut `?` opens keyboard help modal
- [ ] Navigate to `/:owner/:repo/landings/99999` and verify 404 page renders
- [ ] Navigate to `/:owner/:private-repo/landings/1` without auth and verify 403 page renders
- [ ] Verify responsive layout: at mobile width, action sidebar becomes dropdown menu
- [ ] Verify responsive layout: at mobile width, tabs are horizontally scrollable
- [ ] Verify Checks tab appears when `LANDING_CHECKS_VIEW` feature flag is enabled
- [ ] Verify Checks tab does not appear when `LANDING_CHECKS_VIEW` feature flag is disabled
- [ ] Verify Checks tab summary bar shows correct aggregate status
- [ ] Verify Checks tab groups checks by change ID in stack order
- [ ] Verify page handles loading states (skeleton/spinner while data loads)
- [ ] Verify page handles empty state for each tab gracefully
- [ ] Verify special characters in title (HTML entities, emoji, backticks) render correctly without XSS

### TUI Snapshot Tests

- [ ] Render landing detail screen for an open landing request and verify snapshot matches expected layout
- [ ] Render landing detail screen for a merged landing request and verify read-only state (no action hints)
- [ ] Render landing detail screen for a closed landing request and verify reopen hint shown
- [ ] Render landing detail screen for a queued landing request and verify queue position shown
- [ ] Verify tab switching with `1`–`5` keys updates the displayed content
- [ ] Verify `Tab` / `Shift+Tab` cycles through tabs in order
- [ ] Verify `j` / `k` scrolling works within tab content
- [ ] Verify `G` / `gg` jump to bottom/top of content
- [ ] Verify `q` navigates back to landing list
- [ ] Verify `m` key triggers queue-for-merge flow on an open landing
- [ ] Verify `m` key shows error message on a conflicted landing
- [ ] Verify `r` key opens review submission form
- [ ] Verify `c` key opens comment input
- [ ] Verify `t` key toggles diff view mode
- [ ] Verify `w` key toggles whitespace visibility
- [ ] Verify `]` / `[` navigates between files in diff
- [ ] Verify `Ctrl+B` toggles file tree sidebar in diff tab
- [ ] Snapshot at 80×24 terminal size: compact layout, abbreviated tab labels
- [ ] Snapshot at 120×40 terminal size: full layout with file tree
- [ ] Snapshot at 200×60 terminal size: expanded layout with full timestamps
- [ ] Verify status bar shows correct hint text for each tab
- [ ] Verify loading state renders spinner/skeleton
- [ ] Verify error state renders error message with retry option
- [ ] Verify empty changes tab shows "No changes" message
- [ ] Verify empty reviews tab shows "No reviews yet" message
- [ ] Verify empty comments tab shows "No comments yet" message
- [ ] Verify breadcrumb renders correctly with repo context

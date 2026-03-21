# LANDING_DETAIL

Specification for LANDING_DETAIL.

## High-Level User POV

When a user navigates to a specific landing request — whether from the landing list, a notification, a linked issue, or a direct URL — they arrive at the **landing request detail page**. This is the primary surface for understanding, reviewing, and acting on a proposed set of jj changes.

The landing request detail page tells the user everything they need to know about a proposed change: what it is, why it exists, what changes it includes, whether those changes conflict with the target bookmark, what reviewers think, and whether automated checks have passed. It is the central collaboration hub for a single unit of work moving toward landing.

Unlike traditional pull request views that compare two branches, the landing detail page is built around **jj change IDs and stacked changes**. A landing request may contain a single change or an ordered stack of changes, each identified by a stable jj change ID. The detail page makes this stack visible and navigable, letting users understand not just the final diff but the logical decomposition of the work.

The user can read the description, browse the change stack, view a combined or per-change diff, inspect conflict status, read and submit reviews, participate in threaded and inline comments, check CI/CD status, and take actions like editing the request, closing or reopening it, or queueing it for merge. All of these activities are available from a single unified view with tab-based navigation.

For teams using agents, the landing detail page is also where agent-produced changes are reviewed. An agent may have created the landing request from an issue automation flow, and the detail page is where a human reviewer examines the agent's work, leaves feedback, and decides whether to land it.

The landing detail page works consistently across all Codeplane clients: the web UI provides the richest visual experience with syntax-highlighted diffs and markdown rendering; the CLI provides a structured text view suitable for scripting and quick inspection; the TUI provides a keyboard-driven interactive experience; and editor integrations provide quick-glance access without leaving the development environment.

## Acceptance Criteria

### Definition of Done

- [ ] A user can view the full detail of any landing request they have read access to, including title, description, author, state, target bookmark, change IDs, conflict status, stack size, and all timestamps.
- [ ] The landing detail page displays a tabbed interface with at minimum: Overview, Changes, Reviews, Comments, and Diff sections.
- [ ] The Overview tab renders the landing request body as markdown and shows a conflict status summary and review summary.
- [ ] The Changes tab displays an ordered stack of jj change IDs with position numbers, conflict indicators per change, and empty-change indicators.
- [ ] The Reviews tab displays all reviews chronologically with type badges (approved, changes requested, commented, pending, dismissed).
- [ ] The Comments tab displays both general comments and inline diff comments with file/line context.
- [ ] The Diff tab renders a combined diff across all changes with unified and split view modes, syntax highlighting, and whitespace toggle.
- [ ] Users with write access can submit reviews (approve, request changes, comment) from the detail page.
- [ ] Users with write access can add general comments and inline comments from the detail page.
- [ ] Users with write access can edit the landing request title and body.
- [ ] Users with write access can close or reopen a landing request (except merged ones).
- [ ] Users with write access can queue an open, conflict-free landing request for merge.
- [ ] Admin users can dismiss reviews.
- [ ] The page handles 404 (landing not found), 401 (unauthenticated), 403 (forbidden), and 409 (conflict/blocked merge) errors gracefully.
- [ ] The CLI `land view` command returns the same core data in structured output.
- [ ] The TUI landing detail screen provides keyboard-navigable access to all tabs and actions.
- [ ] Editor integrations can open landing request detail in a webview or display summary information.

### Edge Cases

- [ ] A landing request with an empty body displays a placeholder message ("No description provided.") rather than rendering blank space.
- [ ] A landing request body at the maximum length (100,000 characters) renders correctly with a truncation notice if display limits are exceeded.
- [ ] A landing request body exceeding 100,000 characters is rejected at creation/edit time with a clear validation error.
- [ ] A landing request with zero changes (empty `change_ids` array) displays an empty state in the Changes tab and disables the merge action.
- [ ] A landing request with a single change displays without stack visualization connectors.
- [ ] A landing request with 500 changes (maximum stack) renders correctly with pagination.
- [ ] A landing request with conflicted changes displays per-change conflict details with file paths and conflict types.
- [ ] Attempting to merge a landing request with `conflict_status: "conflicted"` shows a clear error explaining conflicts must be resolved first.
- [ ] Attempting to merge a landing request that does not meet protected bookmark approval requirements shows the specific shortfall (e.g., "2 of 3 required approvals").
- [ ] A review body at the maximum length (50,000 characters) is accepted and rendered.
- [ ] A review body exceeding 50,000 characters is rejected with a validation error.
- [ ] A comment body at the maximum length (50,000 characters) is accepted and rendered.
- [ ] An inline comment referencing a file path that no longer exists in the diff still renders with context indicating the file was removed.
- [ ] An inline comment with `line: 0` is treated as a general comment, not a diff-anchored comment.
- [ ] A landing request in `merged` state disables all mutation actions (edit, close, merge) but still allows viewing.
- [ ] A landing request in `queued` state shows queue position and disables redundant merge action.
- [ ] Pagination of reviews, comments, and changes respects per_page limits (max 100 per page).
- [ ] Unicode characters, emoji, and RTL text in title, body, review body, and comment body render correctly.
- [ ] The title field accepts a maximum of 255 characters; longer values are rejected at creation/edit time.
- [ ] Special characters in bookmark names (slashes, dots, hyphens) display correctly in the target bookmark field.
- [ ] Concurrent edits to the same landing request by different users do not silently overwrite — the last writer wins but the UI should reflect the updated state on next fetch.
- [ ] An anonymous user viewing a public repository's landing request can see all read-only content but sees no action buttons or forms.

### Boundary Constraints

| Field | Min | Max | Allowed Characters |
|---|---|---|---|
| `title` | 1 char | 255 chars | Any Unicode; leading/trailing whitespace trimmed |
| `body` | 0 chars (nullable) | 100,000 chars | Any Unicode including markdown |
| `review.body` | 0 chars (for approve type) | 50,000 chars | Any Unicode including markdown |
| `comment.body` | 1 char | 50,000 chars | Any Unicode including markdown |
| `comment.path` | 1 char | 4,096 chars | Valid file path characters |
| `comment.line` | 0 | 2,147,483,647 | Integer; 0 means general comment |
| `comment.side` | — | — | Enum: `"left"`, `"right"` |
| `change_ids` | 0 items | 500 items | Hex strings (jj change IDs) |
| `target_bookmark` | 1 char | 255 chars | Valid jj/git ref characters |
| `state` | — | — | Enum: `"open"`, `"draft"`, `"closed"`, `"merged"`, `"queued"`, `"landing"` |
| `conflict_status` | — | — | Enum: `"clean"`, `"conflicted"`, `"unknown"` |
| `per_page` (pagination) | 1 | 100 | Integer |
| `page` (pagination) | 1 | No hard max | Integer |

## Design

### Web UI Design

#### Route

`/:owner/:repo/landings/:number`

Breadcrumb: `owner / repo / Landings / #N`

#### Page Header

The page header occupies the top section and displays:

- **Landing number** prefixed with `#` (e.g., `#37`) in muted text.
- **Title** in large, bold text. Full-width, wraps to multiple lines. Never truncated.
- **State badge** as a colored pill: `Open` (green), `Draft` (gray), `Closed` (red), `Merged` (purple), `Queued` (yellow), `Landing` (yellow/animated).
- **Author** as a linked username with avatar.
- **Timestamps**: "opened 3 days ago" with tooltip showing absolute ISO timestamp; "updated 1 hour ago" if `updated_at` differs from `created_at`.
- **Target bookmark** displayed as a chip/tag with a bookmark icon: `→ main`.
- **Conflict status indicator**: green checkmark (clean), red X (conflicted), yellow question mark (unknown).
- **Stack size**: "5 changes" or "1 change" (singular).

#### Tab Navigation

A horizontal tab bar below the header with five tabs:

1. **Overview** — Landing body, conflict summary, review summary
2. **Changes** — Ordered change stack
3. **Reviews** — Peer review timeline
4. **Comments** — Discussion thread (general + inline)
5. **Diff** — Combined code diff

Tabs are navigable by click. The active tab is visually distinguished with an underline accent and bold label. Tab content loads lazily for the Diff tab; all other tabs load concurrently on page mount.

#### Overview Tab

- **Description section**: The landing request body rendered as rich markdown (headings, code blocks, links, images, tables, task lists). If body is null or empty, display italic placeholder: "No description provided."
- **Conflict status section**: A card or callout showing:
  - Clean: "✓ No conflicts" with green accent.
  - Conflicted: "✗ Conflicts detected" with red accent, followed by a collapsible per-change breakdown listing file paths and conflict types.
  - Unknown: "? Conflict status not yet determined" with yellow accent.
- **Review summary section**: Aggregated counts: "N approved, M changes requested, P pending". For protected bookmarks, additionally show "X of Y required approvals met."

#### Changes Tab

An ordered vertical list showing the change stack:

- Each row displays: position number (1-based), short change ID (first 12 hex characters, monospace, linked to change detail), conflict indicator (⚠ icon if conflicted), empty indicator (∅ if empty change), one-line description, author avatar + name, relative timestamp.
- A vertical connector line runs down the left margin connecting all changes in the stack, visually reinforcing the ordering.
- Clicking a change navigates to a per-change diff view.
- Empty state: "No changes in this landing request."

#### Reviews Tab

A chronological timeline (oldest first) of all reviews:

- Each review card shows: reviewer avatar and linked username, review type badge (✓ Approved in green, ✗ Changes Requested in red, 💬 Commented in blue, ○ Pending in gray, ~Dismissed~ in muted strikethrough), relative timestamp, review body rendered as markdown.
- Summary bar at top: "N reviews · M approved · P changes requested."
- Empty state: "No reviews yet. Be the first to review."
- A "Submit Review" button opens a review form with type selector (Approve / Request Changes / Comment) and a markdown body editor.
- Pagination: 30 per page, load-more button, 200 item cap.

#### Comments Tab

A chronological timeline of all comments:

- **General comments** display: author avatar and username, relative timestamp, "(edited)" indicator if `updated_at ≠ created_at`, markdown-rendered body.
- **Inline comments** additionally display: a file context banner showing `📄 path/to/file.ts:42` as a clickable link that navigates to that location in the Diff tab, and the diff side (left/right).
- "Add Comment" form at the bottom with a markdown editor and submit button.
- Pagination: 30 per page, load-more button, 500 item cap.
- Empty state: "No comments yet. Start the conversation."

#### Diff Tab

A full combined diff across all changes in the stack:

- **View mode toggle**: Unified (default) / Split side-by-side.
- **Whitespace toggle**: Show / Hide whitespace changes.
- **File tree sidebar**: Collapsible panel on the left listing all changed files with add/modify/delete indicators and file counts. Clicking a file scrolls to that file's diff section.
- **Diff rendering**: Syntax-highlighted, line-numbered, with green/red coloring for additions/deletions. Hunk headers displayed. Expand context buttons between hunks.
- **Inline comment anchors**: Clickable `+` icons on each diff line to create inline comments directly from the diff.
- Empty state: "No file changes in this landing request."

#### Action Sidebar / Action Bar

A contextual action area (sidebar on desktop, bottom bar on mobile) showing available actions based on user permissions and landing state:

- **Edit** button (write access, non-merged): Opens a modal to edit title and body.
- **Close** / **Reopen** button (write access): Toggles state between open and closed.
- **Queue for Merge** button (write access, open state, clean conflicts): Initiates the landing process. Shows confirmation dialog.
- **Dismiss Review** action (admin, on individual review cards in Reviews tab).

Actions that are not available due to permissions are hidden entirely (not grayed out).

#### Responsive Behavior

- **Desktop (≥1024px)**: Two-column layout with content area and metadata/action sidebar.
- **Tablet (768–1023px)**: Single column, metadata inline below header, actions in a sticky bottom bar.
- **Mobile (<768px)**: Single column, compact tab labels, collapsible metadata section.

### API Shape

**Primary endpoint:**

```
GET /api/repos/:owner/:repo/landings/:number
→ 200: LandingRequestResponse
→ 404: { message: "Landing request not found" }
```

**Supporting detail endpoints:**

```
GET  /api/repos/:owner/:repo/landings/:number/changes?page=1&per_page=30
GET  /api/repos/:owner/:repo/landings/:number/reviews?page=1&per_page=30
GET  /api/repos/:owner/:repo/landings/:number/comments?page=1&per_page=30
GET  /api/repos/:owner/:repo/landings/:number/conflicts
GET  /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=false
```

**Mutation endpoints:**

```
PATCH /api/repos/:owner/:repo/landings/:number
  Body: { title?, body?, state?, target_bookmark? }
  → 200: LandingRequestResponse

PUT   /api/repos/:owner/:repo/landings/:number/land
  → 202: { ...LandingRequestResponse, queue_position, task_id }
  → 409: { message: "Conflicts must be resolved" | "Required approvals not met" }

POST  /api/repos/:owner/:repo/landings/:number/reviews
  Body: { type: "approve" | "request_changes" | "comment", body? }
  → 201: LandingReviewResponse

PATCH /api/repos/:owner/:repo/landings/:number/reviews/:review_id
  Body: { message? }
  → 200: LandingReviewResponse (dismissed)

POST  /api/repos/:owner/:repo/landings/:number/comments
  Body: { body, path?, line?, side? }
  → 201: LandingCommentResponse
```

**Response schemas:**

`LandingRequestResponse`: `{ number, title, body, state, author: { id, login }, change_ids, target_bookmark, source_bookmark?, conflict_status, stack_size, created_at, updated_at, merged_at?, queued_at?, queue_position? }`

`LandingReviewResponse`: `{ id, landing_request_id, reviewer: { id, login }, type, body, state, created_at, updated_at }`

`LandingCommentResponse`: `{ id, landing_request_id, author: { id, login }, path, line, side, body, created_at, updated_at }`

`LandingRequestChange`: `{ id, landing_request_id, change_id, position_in_stack }`

`LandingConflictsResponse`: `{ conflict_status, has_conflicts, conflicts_by_change?: { [changeId]: [{ file_path, conflict_type }] } }`

`LandingDiffResponse`: `{ landing_number, changes: [{ change_id, file_diffs }] }`

**Pagination:** List endpoints return `X-Total-Count` header and `Link` header with rel="first", "last", "prev", "next". Page/per_page pattern.

### SDK Shape

Shared hooks and API functions in `@codeplane/ui-core`:

```
useLanding(owner, repo, number) → { data: LandingRequestResponse, loading, error, refetch }
useLandingChanges(owner, repo, number, page?) → { data, loading, error, loadMore }
useLandingReviews(owner, repo, number, page?) → { data, loading, error, loadMore }
useLandingComments(owner, repo, number, page?) → { data, loading, error, loadMore }
useLandingConflicts(owner, repo, number) → { data, loading, error, refetch }
useLandingDiff(owner, repo, number, ignoreWhitespace?) → { data, loading, error }
useUpdateLanding(owner, repo, number) → { mutate(patch), loading, error }
useLandLanding(owner, repo, number) → { mutate(), loading, error }
useCreateReview(owner, repo, number) → { mutate({ type, body }), loading, error }
useDismissReview(owner, repo, number, reviewId) → { mutate({ message? }), loading, error }
useCreateComment(owner, repo, number) → { mutate({ body, path?, line?, side? }), loading, error }
```

### CLI Command

**`codeplane land view <number>`**

Displays a structured text representation of the landing request detail:

```
Landing Request #37: Implement user profile caching
State:     open
Author:    @williamcory
Target:    → main
Conflicts: ✓ clean
Stack:     3 changes
Created:   2026-03-20T14:30:00Z
Updated:   2026-03-21T09:15:00Z

Description:
  This landing request implements a caching layer for user profile
  lookups to reduce database load during peak traffic.

Changes:
  1. kpqvxrms  Add cache service interface
  2. yzlnwtkx  Implement Redis-backed cache adapter
  3. rmvqxnkl  Wire cache into profile lookup path

Reviews:
  ✓ @alice approved 2h ago
  ✗ @bob requested changes 1d ago: "Please add cache TTL configuration"
  💬 @carol commented 3h ago: "Looks good, minor nit on line 42"

Conflicts:
  No conflicts detected.
```

Options:
- `--repo <owner/repo>` — Override repository context.
- `--json` — Output raw JSON response. Supports field filtering: `--json .landing.state`.

Related subcommands for detail-page actions:
- `codeplane land review <number> --approve` — Submit an approval review.
- `codeplane land review <number> --body "..."` — Submit a comment review.
- `codeplane land comment <number> --body "..."` — Add a general comment.
- `codeplane land edit <number> --title "..." --body "..."` — Edit title/body.
- `codeplane land land <number>` — Queue for merge.
- `codeplane land checks <number>` — View CI/check statuses.
- `codeplane land conflicts <number>` — View conflict details.

### TUI UI

The TUI landing detail screen is a full-screen, keyboard-driven tabbed interface:

- Tab cycling via `Tab`/`Shift+Tab`, direct jump via `1`–`5`.
- Vim-style navigation: `j`/`k` scroll, `G`/`gg` jump to bottom/top, `Ctrl+D`/`Ctrl+U` page scroll.
- Action keys: `r` (review), `c` (comment), `e` (edit), `m` (merge), `x` (close/reopen).
- Diff-specific: `t` (toggle unified/split), `w` (whitespace), `]`/`[` (next/prev file), `Ctrl+B` (toggle file tree).
- State badge rendering uses ANSI colors matching the web UI color semantics.
- Responsive across three terminal breakpoints: 80×24 (minimum), 120×40 (standard), 200×60+ (large).
- Status bar at bottom shows context-sensitive keybinding hints for the active tab.
- 5 concurrent API requests on mount; Diff tab loads lazily.
- Optimistic UI updates for mutations with rollback on error.

### VS Code Extension

- **Landing Request tree view** in the sidebar lists open landing requests. Clicking a landing request opens a webview showing the landing detail page.
- **Quick pick** command (`Codeplane: View Landing Request`) prompts for a landing number and opens the detail webview.
- **Status bar** shows the landing request number and state when the active file is associated with a change in a landing request.

### Neovim Plugin

- **`:CodeplaneLanding <number>`** command opens a split buffer showing the landing detail in structured text format (similar to CLI output).
- **Telescope picker** for browsing and selecting landing requests, with preview showing the landing detail.
- **Statusline integration** shows landing request context when relevant.

### Documentation

The following end-user documentation should exist:

- **User Guide: Landing Requests** — Explains what landing requests are, how they differ from pull requests, the lifecycle (open → review → merge), and how to navigate the detail page in web, CLI, TUI, and editors.
- **CLI Reference: `land view`** — Documents all options, output format, JSON filtering, and example invocations.
- **Keyboard Shortcuts Reference** — Lists all TUI keybindings for the landing detail screen.
- **API Reference: Landing Request Detail** — Documents all GET endpoints, response schemas, pagination, and error codes for the landing detail surface.

## Permissions & Security

### Authorization Matrix

| Action | Anonymous (public repo) | Anonymous (private repo) | Read-Only Member | Write Member | Admin | Owner |
|---|---|---|---|---|---|---|
| View landing detail | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View reviews | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View comments | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View changes | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View diff | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View conflict status | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Submit review | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add comment | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit landing (own) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit landing (others') | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Close / Reopen | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Queue for merge | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Dismiss review | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### Rate Limiting

| Endpoint Pattern | Rate Limit | Window | Notes |
|---|---|---|---|
| `GET .../landings/:number` | 300 req | per minute | Read-heavy, allow generous limit |
| `GET .../landings/:number/diff` | 60 req | per minute | Expensive computation |
| `GET .../landings/:number/changes` | 300 req | per minute | Lightweight read |
| `GET .../landings/:number/reviews` | 300 req | per minute | Lightweight read |
| `GET .../landings/:number/comments` | 300 req | per minute | Lightweight read |
| `GET .../landings/:number/conflicts` | 120 req | per minute | Moderate computation |
| `PATCH .../landings/:number` | 30 req | per minute | Mutation, stricter |
| `PUT .../landings/:number/land` | 10 req | per minute | Heavy operation, very strict |
| `POST .../reviews` | 30 req | per minute | Mutation |
| `POST .../comments` | 60 req | per minute | Mutation, slightly more generous for active discussion |
| `PATCH .../reviews/:id` | 20 req | per minute | Admin action |

### Data Privacy

- Landing request bodies, review bodies, and comment bodies may contain PII. They should not be logged at INFO level; only log at DEBUG level in non-production environments.
- Author usernames and IDs are considered public within the repository's access scope. They are not PII in context.
- Diff content may contain sensitive source code and should not be cached in shared/public CDN layers.
- API responses must not leak information about private repositories to unauthorized users (404, not 403, for unauthorized access to private repo landing requests).
- Email addresses of authors/reviewers should not be included in landing detail API responses unless the user has opted in to public email visibility.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `landing_detail.viewed` | Page/screen loads successfully | `repo_id`, `landing_number`, `state`, `stack_size`, `client` (web/cli/tui/vscode/nvim), `is_author` (bool), `viewer_role` |
| `landing_detail.tab_changed` | User switches tabs | `repo_id`, `landing_number`, `from_tab`, `to_tab`, `client` |
| `landing_detail.review_submitted` | User submits a review | `repo_id`, `landing_number`, `review_type` (approve/request_changes/comment), `body_length`, `client`, `is_first_review` (bool) |
| `landing_detail.review_dismissed` | Admin dismisses a review | `repo_id`, `landing_number`, `review_id`, `dismissed_type`, `client` |
| `landing_detail.comment_created` | User adds a comment | `repo_id`, `landing_number`, `is_inline` (bool), `body_length`, `client` |
| `landing_detail.state_changed` | User closes or reopens | `repo_id`, `landing_number`, `from_state`, `to_state`, `client` |
| `landing_detail.merge_queued` | User queues for merge | `repo_id`, `landing_number`, `stack_size`, `review_count`, `approval_count`, `client` |
| `landing_detail.edited` | User edits title or body | `repo_id`, `landing_number`, `fields_changed` (array), `client` |
| `landing_detail.diff_viewed` | Diff tab activated (lazy load) | `repo_id`, `landing_number`, `file_count`, `total_additions`, `total_deletions`, `client` |
| `landing_detail.diff_mode_toggled` | User toggles unified/split | `repo_id`, `landing_number`, `new_mode` (unified/split), `client` |
| `landing_detail.conflict_recheck` | User triggers conflict re-evaluation | `repo_id`, `landing_number`, `previous_status`, `client` |
| `landing_detail.error` | API request fails | `repo_id`, `landing_number`, `endpoint`, `status_code`, `error_message`, `client` |

### Funnel Metrics

1. **View → Review funnel**: % of landing detail views that result in a review submission. Target: >15% for write-access viewers.
2. **View → Merge funnel**: % of landing detail views (by authors) that result in a merge queue action. Target: >5%.
3. **Review → Merge latency**: Median time from first review submission to merge queue action. Target: <4 hours for active repositories.
4. **Tab engagement distribution**: % of views that visit each tab. Healthy signal: Diff tab visited in >60% of sessions, Reviews in >40%.
5. **Conflict resolution rate**: % of landing requests that transition from `conflicted` to `clean` after a conflict recheck action. Target: >70%.
6. **Cross-client usage**: Distribution of `landing_detail.viewed` events by `client`. Success if >2 clients have >10% share.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|---|---|---|---|
| Landing detail fetched successfully | INFO | `repo_id`, `landing_number`, `user_id`, `response_time_ms` | Standard access log |
| Landing detail not found | WARN | `repo_id`, `landing_number`, `user_id` | May indicate stale links |
| Landing diff computed | INFO | `repo_id`, `landing_number`, `file_count`, `computation_time_ms` | Performance tracking |
| Landing diff computation slow (>5s) | WARN | `repo_id`, `landing_number`, `file_count`, `computation_time_ms` | Performance degradation signal |
| Review submitted | INFO | `repo_id`, `landing_number`, `reviewer_id`, `review_type` | Audit trail |
| Review dismissed | INFO | `repo_id`, `landing_number`, `reviewer_id`, `dismissed_by`, `review_type` | Audit trail (admin action) |
| Comment created | INFO | `repo_id`, `landing_number`, `author_id`, `is_inline` | Audit trail |
| Landing state changed | INFO | `repo_id`, `landing_number`, `user_id`, `from_state`, `to_state` | State machine audit |
| Merge queued | INFO | `repo_id`, `landing_number`, `user_id`, `queue_position` | Critical workflow event |
| Merge blocked (conflicts) | WARN | `repo_id`, `landing_number`, `user_id`, `conflict_status` | Expected user error |
| Merge blocked (approvals) | WARN | `repo_id`, `landing_number`, `user_id`, `required`, `actual` | Expected user error |
| Authorization denied | WARN | `repo_id`, `landing_number`, `user_id`, `action`, `required_role` | Security audit |
| Rate limit exceeded | WARN | `user_id`, `endpoint`, `limit`, `window` | Abuse detection |
| Database query error | ERROR | `repo_id`, `landing_number`, `query`, `error_message` | Infrastructure issue |
| Repo-host diff generation error | ERROR | `repo_id`, `landing_number`, `change_ids`, `error_message` | jj integration issue |

### Prometheus Metrics

**Counters:**
- `codeplane_landing_detail_requests_total{endpoint, status_code, method}` — Total requests to landing detail endpoints.
- `codeplane_landing_reviews_created_total{repo_id, type}` — Reviews created, partitioned by type.
- `codeplane_landing_comments_created_total{repo_id, is_inline}` — Comments created.
- `codeplane_landing_state_transitions_total{from_state, to_state}` — State transition counts.
- `codeplane_landing_merges_queued_total{repo_id}` — Merge queue events.
- `codeplane_landing_merges_blocked_total{repo_id, reason}` — Blocked merge attempts (conflicts, approvals).
- `codeplane_landing_detail_errors_total{endpoint, error_type}` — Error counts by endpoint and type.

**Histograms:**
- `codeplane_landing_detail_response_time_seconds{endpoint}` — Response latency. Buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10.
- `codeplane_landing_diff_computation_seconds{repo_id}` — Diff generation time. Buckets: 0.1, 0.5, 1, 2, 5, 10, 30.
- `codeplane_landing_detail_response_size_bytes{endpoint}` — Response payload size. Buckets: 1KB, 10KB, 100KB, 1MB, 10MB.

**Gauges:**
- `codeplane_landing_merge_queue_depth{repo_id}` — Current depth of the merge queue per repository.

### Alerts

#### Alert: LandingDetailHighErrorRate
- **Condition**: `rate(codeplane_landing_detail_errors_total[5m]) / rate(codeplane_landing_detail_requests_total[5m]) > 0.05`
- **Severity**: Warning (>5%), Critical (>15%)
- **Runbook**:
  1. Check `codeplane_landing_detail_errors_total` by `error_type` to identify the dominant error class (4xx vs 5xx).
  2. If 5xx: check database connectivity (`codeplane_db_connection_pool_available`). Restart connection pool if exhausted.
  3. If 5xx with repo-host errors: check jj subprocess availability. Verify the repo-host service is running and repositories are accessible on disk.
  4. If 4xx spike: check for a bot or automated client hammering invalid landing numbers (review access logs for patterns).
  5. If rate-limit related: verify rate limit configuration is appropriate; consider temporary allowlist for legitimate high-volume clients.

#### Alert: LandingDiffComputationSlow
- **Condition**: `histogram_quantile(0.95, codeplane_landing_diff_computation_seconds) > 10`
- **Severity**: Warning (>10s p95), Critical (>30s p95)
- **Runbook**:
  1. Identify which repositories have slow diffs via `codeplane_landing_diff_computation_seconds{repo_id}`.
  2. Check if the affected repositories have unusually large stacks (>50 changes) or binary files.
  3. Check disk I/O metrics on the repository storage volume. High `await` times indicate storage contention.
  4. Check if jj subprocess is deadlocking: look for zombie `jj` processes.
  5. If systemic: consider adding a computation timeout (30s) with a user-facing "Diff too large to compute" message.

#### Alert: LandingMergeQueueStuck
- **Condition**: `codeplane_landing_merge_queue_depth > 0` sustained for >30 minutes without a state transition event.
- **Severity**: Warning
- **Runbook**:
  1. Check the workflow/task system for the landing task associated with the queued landing request (`task_id` from the queue response).
  2. If task is stuck: check workflow runner health. Restart the runner if unresponsive.
  3. If task failed: check workflow run logs for the failure reason. Common causes: merge conflict emerged after queuing, protected bookmark rule changed, runner out of disk.
  4. Manually dequeue the stuck landing request via admin API if recovery is not possible.

#### Alert: LandingDetailLatencyHigh
- **Condition**: `histogram_quantile(0.95, codeplane_landing_detail_response_time_seconds{endpoint="GET_detail"}) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance for the landing detail query. Look for missing indexes on `(repository_id, number)`.
  2. Check if the service registry is under memory pressure (GC pauses in Bun runtime).
  3. Profile a sample request with structured logging at DEBUG level to identify the slow segment (DB query, jj subprocess, serialization).
  4. If pagination-related: ensure clients are not requesting excessively large `per_page` values.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Landing request does not exist | 404 | "Landing request #N not found in owner/repo" | User navigates back or checks the number |
| Repository does not exist | 404 | "Repository not found" | User checks the URL |
| User not authenticated | 401 | "Sign in to view this landing request" (private repo) | Redirect to login |
| User lacks read access | 404 | "Repository not found" (do not leak existence) | User requests access |
| User lacks write access for mutation | 403 | "You do not have permission to perform this action" | User contacts admin |
| Merge blocked by conflicts | 409 | "This landing request has conflicts that must be resolved before merging" | User resolves conflicts in jj |
| Merge blocked by approvals | 409 | "This landing request requires N approvals (currently has M)" | User solicits reviews |
| Merge blocked by failing checks | 409 | "Required checks have not passed" | User fixes CI failures |
| Review body exceeds limit | 400 | "Review body must be 50,000 characters or fewer" | User shortens review |
| Comment body empty | 400 | "Comment body is required" | User adds content |
| Rate limit exceeded | 429 | "Rate limit exceeded. Please try again in N seconds." | User waits |
| Database unavailable | 500 | "Something went wrong. Please try again." | Ops investigates DB health |
| Repo-host unavailable | 500 | "Unable to compute diff at this time" | Ops checks jj/repo-host service |
| Invalid state transition | 409 | "Cannot transition from merged to open" | User understands state is terminal |

## Verification

### API Integration Tests

#### Landing Detail Retrieval
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns 200 with complete `LandingRequestResponse` for a valid landing request.
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns 404 for a non-existent landing number.
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns 404 for a valid number in a non-existent repository.
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns 404 (not 403) for a private repository when unauthenticated.
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns the correct `state` for each possible state value (open, draft, closed, merged, queued, landing).
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns `change_ids` as a correctly ordered array matching the stack.
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns `conflict_status` accurately reflecting the current state (clean, conflicted, unknown).
- [ ] `GET /api/repos/:owner/:repo/landings/:number` returns all timestamp fields (`created_at`, `updated_at`, `merged_at`, `queued_at`) with correct ISO 8601 formatting.
- [ ] `GET /api/repos/:owner/:repo/landings/:number` response includes `author` with both `id` and `login` fields populated.

#### Changes Endpoint
- [ ] `GET .../landings/:number/changes` returns paginated changes ordered by `position_in_stack`.
- [ ] `GET .../landings/:number/changes` with `page=1&per_page=5` returns exactly 5 items for a stack of 10+ changes.
- [ ] `GET .../landings/:number/changes` returns `X-Total-Count` header with correct total.
- [ ] `GET .../landings/:number/changes` returns `Link` header with correct pagination URLs.
- [ ] `GET .../landings/:number/changes` returns empty array for a landing request with zero changes.
- [ ] `GET .../landings/:number/changes` with `per_page=100` (maximum) returns up to 100 items.
- [ ] `GET .../landings/:number/changes` with `per_page=101` (over maximum) returns 400 error or clamps to 100.

#### Reviews Endpoint
- [ ] `GET .../landings/:number/reviews` returns paginated reviews in chronological order.
- [ ] `GET .../landings/:number/reviews` returns all review types (approve, request_changes, comment, pending) with correct `type` field.
- [ ] `GET .../landings/:number/reviews` includes dismissed reviews with `state: "dismissed"`.
- [ ] `GET .../landings/:number/reviews` returns empty array for a landing request with no reviews.
- [ ] `POST .../landings/:number/reviews` with `{ type: "approve" }` creates an approval review and returns 201.
- [ ] `POST .../landings/:number/reviews` with `{ type: "request_changes", body: "Please fix X" }` creates a changes-requested review and returns 201.
- [ ] `POST .../landings/:number/reviews` with `{ type: "comment", body: "Looks good" }` creates a comment review and returns 201.
- [ ] `POST .../landings/:number/reviews` without authentication returns 401.
- [ ] `POST .../landings/:number/reviews` by a user with only read access returns 403.
- [ ] `POST .../landings/:number/reviews` with a body of exactly 50,000 characters succeeds (maximum valid size).
- [ ] `POST .../landings/:number/reviews` with a body of 50,001 characters returns 400 validation error.
- [ ] `PATCH .../landings/:number/reviews/:review_id` by an admin dismisses the review and returns 200 with `state: "dismissed"`.
- [ ] `PATCH .../landings/:number/reviews/:review_id` by a non-admin returns 403.
- [ ] `PATCH .../landings/:number/reviews/:review_id` for a non-existent review returns 404.

#### Comments Endpoint
- [ ] `GET .../landings/:number/comments` returns paginated comments in chronological order.
- [ ] `GET .../landings/:number/comments` includes both general and inline comments with correct `path`, `line`, `side` fields.
- [ ] `POST .../landings/:number/comments` with `{ body: "General comment" }` creates a general comment (line=0, no path) and returns 201.
- [ ] `POST .../landings/:number/comments` with `{ body: "Inline note", path: "src/main.ts", line: 42, side: "right" }` creates an inline comment and returns 201.
- [ ] `POST .../landings/:number/comments` with `{ body: "" }` (empty body) returns 400 validation error.
- [ ] `POST .../landings/:number/comments` with a body of exactly 50,000 characters succeeds.
- [ ] `POST .../landings/:number/comments` with a body of 50,001 characters returns 400.
- [ ] `POST .../landings/:number/comments` with `side: "invalid"` returns 400 validation error.
- [ ] `POST .../landings/:number/comments` without authentication returns 401.

#### Diff Endpoint
- [ ] `GET .../landings/:number/diff` returns diff data with `changes` array.
- [ ] `GET .../landings/:number/diff?ignore_whitespace=true` returns diff with whitespace changes excluded.
- [ ] `GET .../landings/:number/diff` for a landing request with no file changes returns an empty `changes` array.
- [ ] `GET .../landings/:number/diff` for a landing request with a large stack (50+ changes) completes within 30 seconds.

#### Conflicts Endpoint
- [ ] `GET .../landings/:number/conflicts` returns `conflict_status` and `has_conflicts` fields.
- [ ] `GET .../landings/:number/conflicts` for a clean landing returns `{ conflict_status: "clean", has_conflicts: false }`.
- [ ] `GET .../landings/:number/conflicts` for a conflicted landing returns per-change breakdown in `conflicts_by_change`.

#### Landing Mutations
- [ ] `PATCH .../landings/:number` with `{ title: "New Title" }` updates the title and returns 200.
- [ ] `PATCH .../landings/:number` with `{ title: "" }` (empty title) returns 400 validation error.
- [ ] `PATCH .../landings/:number` with a title of exactly 255 characters succeeds.
- [ ] `PATCH .../landings/:number` with a title of 256 characters returns 400 validation error.
- [ ] `PATCH .../landings/:number` with `{ body: "..." }` at exactly 100,000 characters succeeds.
- [ ] `PATCH .../landings/:number` with `{ body: "..." }` at 100,001 characters returns 400 validation error.
- [ ] `PATCH .../landings/:number` with `{ state: "closed" }` on an open landing returns 200 with `state: "closed"`.
- [ ] `PATCH .../landings/:number` with `{ state: "open" }` on a closed landing returns 200 with `state: "open"`.
- [ ] `PATCH .../landings/:number` with `{ state: "open" }` on a merged landing returns 409 (invalid transition).
- [ ] `PATCH .../landings/:number` without authentication returns 401.
- [ ] `PATCH .../landings/:number` by a user with only read access returns 403.
- [ ] `PUT .../landings/:number/land` on an open, conflict-free landing returns 202 with `queue_position` and `task_id`.
- [ ] `PUT .../landings/:number/land` on a conflicted landing returns 409 with a message about conflicts.
- [ ] `PUT .../landings/:number/land` on a closed landing returns 409.
- [ ] `PUT .../landings/:number/land` on a merged landing returns 409.
- [ ] `PUT .../landings/:number/land` on a landing that lacks required approvals for a protected bookmark returns 409 with approval count details.
- [ ] `PUT .../landings/:number/land` without authentication returns 401.
- [ ] `PUT .../landings/:number/land` by a user with only read access returns 403.

### CLI E2E Tests

- [ ] `codeplane land view 1` displays the landing request title, state, author, target bookmark, and change list.
- [ ] `codeplane land view 1 --json` outputs valid JSON matching the `LandingRequestResponse` schema.
- [ ] `codeplane land view 1 --json .landing.state` outputs only the state field as a string.
- [ ] `codeplane land view 999999` (non-existent) displays an error message and exits with non-zero code.
- [ ] `codeplane land view 1 --repo owner/repo` overrides the repository context.
- [ ] `codeplane land review 1 --approve` submits an approval review.
- [ ] `codeplane land review 1 --body "Changes needed"` submits a comment-type review with body.
- [ ] `codeplane land comment 1 --body "Looks good"` adds a general comment.
- [ ] `codeplane land edit 1 --title "Updated Title"` updates the landing title.
- [ ] `codeplane land land 1` queues the landing request for merge and displays the queue position.
- [ ] `codeplane land checks 1` displays check statuses for the landing request.
- [ ] `codeplane land conflicts 1` displays conflict status.

### Web UI Playwright E2E Tests

- [ ] Navigate to `/:owner/:repo/landings/:number` and verify the page loads with correct title, state badge, author, and metadata.
- [ ] Verify all five tabs (Overview, Changes, Reviews, Comments, Diff) are visible and clickable.
- [ ] Click each tab and verify the correct content section is displayed.
- [ ] On the Overview tab, verify the markdown body renders correctly (headings, code blocks, links).
- [ ] On the Overview tab with an empty body, verify the "No description provided" placeholder appears.
- [ ] On the Changes tab, verify changes are listed in stack order with correct change IDs and positions.
- [ ] On the Reviews tab, verify reviews display with correct type badges, reviewer names, and timestamps.
- [ ] On the Reviews tab, click "Submit Review" and submit an approval. Verify the new review appears in the list.
- [ ] On the Comments tab, verify comments display with author names and timestamps.
- [ ] On the Comments tab, add a comment via the form. Verify the new comment appears.
- [ ] On the Diff tab, verify the diff renders with syntax highlighting, line numbers, and file sections.
- [ ] On the Diff tab, toggle between unified and split mode. Verify the display changes.
- [ ] On the Diff tab, toggle whitespace visibility. Verify the diff updates.
- [ ] Click the Edit button, change the title, and submit. Verify the title updates on the page.
- [ ] Click the Close button on an open landing. Verify the state badge changes to "Closed".
- [ ] Click the Reopen button on a closed landing. Verify the state badge changes to "Open".
- [ ] On a merged landing, verify mutation action buttons (Edit, Close, Merge) are hidden.
- [ ] Navigate to a non-existent landing number and verify the 404 error page displays correctly.
- [ ] As an anonymous user on a public repo, verify all content is visible but action buttons are hidden.
- [ ] As a read-only user, verify content is visible but write-action buttons are hidden.
- [ ] Verify the conflict status indicator displays correctly for clean, conflicted, and unknown states.
- [ ] On the Changes tab, click a change ID and verify navigation to the change detail or per-change diff.
- [ ] On the Reviews tab with a dismissed review, verify the strikethrough/dismissed styling.
- [ ] Verify responsive layout: at mobile viewport, tabs and metadata stack vertically.
- [ ] Verify the breadcrumb navigation links work correctly (owner → repo → landings → #N).
- [ ] Verify pagination on Reviews tab: load initial 30, scroll to trigger load-more, verify additional reviews appear.
- [ ] Verify pagination on Comments tab: load initial 30, trigger load-more, verify additional comments appear.
- [ ] On the Diff tab, click a file in the file tree sidebar and verify the diff scrolls to that file.
- [ ] Click the inline comment `+` icon on a diff line, type a comment, and submit. Verify the inline comment appears both in the Diff tab and the Comments tab.

### TUI E2E Tests

- [ ] Launch TUI with `codeplane tui --screen landings --repo owner/repo --landing 1` and verify the detail screen renders.
- [ ] Verify tab navigation with `Tab`, `Shift+Tab`, and number keys `1`–`5`.
- [ ] Verify `j`/`k` scrolling works within each tab content.
- [ ] Verify `q` pops the detail screen back to the landing list.
- [ ] Verify the `?` key shows the keybinding help overlay.
- [ ] Verify the `:` key opens the command palette.

### Cross-Client Consistency Tests

- [ ] Create a landing request via CLI, then verify it appears correctly in the web UI detail page.
- [ ] Submit a review via the web UI, then verify it appears in `codeplane land view` CLI output.
- [ ] Add a comment via CLI, then verify it appears in the web UI Comments tab.
- [ ] Close a landing via web UI, then verify `codeplane land view` shows `state: closed`.
- [ ] Edit a landing title via CLI, then verify the web UI reflects the updated title on refresh.

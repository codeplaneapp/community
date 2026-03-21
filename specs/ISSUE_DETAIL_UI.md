# ISSUE_DETAIL_UI

Specification for ISSUE_DETAIL_UI.

## High-Level User POV

When a Codeplane user opens an issue — by clicking a link on the web, pressing Enter on an issue row in the TUI, running `codeplane issue view 42` in the terminal, or expanding an issue node in VS Code or Neovim — they land on a single, self-contained view that tells the full story of that issue without requiring them to leave the screen or switch tools.

The issue detail UI is the convergence point for all issue-oriented collaboration. It displays the issue's title, open/closed status, author, timestamps, full markdown description, labels, assignees, milestone, and a chronological timeline of comments and system events. Authenticated users with sufficient permissions can take action directly from the same view: editing the title or body, toggling the issue's state, managing labels and assignees, adding comments, reacting with emoji, pinning or locking the issue, and managing dependency relationships to other issues.

The experience is designed for both quick triage and deep investigation. A product manager scanning issues in the web UI can glance at the metadata sidebar, add a label, reassign the issue, and move on in seconds. A developer in the TUI can scroll through the full comment history, jump between comments with keyboard shortcuts, and add a response without leaving the terminal. An AI agent operating through the API reads the same detail payload, adds a comment with findings, and creates a linked landing request — and that activity immediately appears in the timeline for human reviewers.

Cross-client consistency is a first-class design goal. The same data, the same actions, and the same permission enforcement apply whether the user is in the web UI, TUI, CLI, VS Code, or Neovim. The issue detail UI is not a read-only display — it is the primary workspace for issue triage, discussion, and resolution across every Codeplane surface.

## Acceptance Criteria

### Definition of Done

- [ ] The issue detail UI renders the complete issue representation — title, state badge, author, timestamps, body, labels, assignees, milestone, comment count, dependencies — across Web, TUI, CLI text output, VS Code, and Neovim.
- [ ] Authenticated users with write access can edit issue title, body, state, labels, assignees, and milestone directly from the detail UI on Web and TUI surfaces.
- [ ] Authenticated users can create, edit, and delete comments from the detail UI on Web and TUI.
- [ ] Emoji reactions can be added/removed on both the issue and individual comments from Web and TUI.
- [ ] Pin, lock, and dependency management actions are accessible from the detail UI on Web, TUI, and CLI.
- [ ] The UI gracefully handles all empty states: no labels, no assignees, no milestone, no comments, empty body.
- [ ] The detail UI is reachable via URL (`/:owner/:repo/issues/:number`), CLI (`codeplane issue view <N>`), TUI navigation, and editor integration entry points.
- [ ] All mutation actions use optimistic UI updates in Web and TUI, reverting on server error with an inline error message.
- [ ] Read-only and anonymous users see the issue content but mutation controls are hidden or disabled.
- [ ] The UI handles error states: 404 (issue not found), 401 (authentication required), 403 (permission denied), 500 (server error), and network failures — with appropriate messages and retry affordances.

### Core Display Constraints

- [ ] Issue title renders in full without truncation, wrapping to multiple lines as needed.
- [ ] Issue title supports Unicode, emoji, CJK characters, RTL scripts, and special characters.
- [ ] State badge shows "Open" in green/success color or "Closed" in red/error color.
- [ ] Issue number displays as `#N` adjacent to the title.
- [ ] Author displays as `@username` linking to user profile (Web) or in primary color (TUI).
- [ ] `created_at` displays as relative timestamp with absolute tooltip on hover (Web).
- [ ] `updated_at` displays separately when it differs from `created_at`.
- [ ] `closed_at` displays next to the closed state badge when issue is closed.
- [ ] Labels render as colored chips/badges using the label's hex color.
- [ ] Label names exceeding 30 characters are truncated with `…` in TUI.
- [ ] Assignees render as `@username` items with `+N more` overflow at 5+ in compact TUI mode.
- [ ] Milestone renders as named link (Web) or text (TUI/CLI), omitted if not set.
- [ ] Comment count displays in the metadata area.

### Body Rendering Constraints

- [ ] Issue body renders full markdown: headings, lists, code blocks with syntax highlighting, inline code, bold, italic, links, images, tables, blockquotes, horizontal rules.
- [ ] Empty or null body renders "No description provided." placeholder.
- [ ] Body handles maximum length of 100,000 characters. TUI truncates with notice; Web renders fully.
- [ ] Body content is XSS-safe: HTML sanitized on render, not on storage.

### Comment and Timeline Constraints

- [ ] Comments and timeline events render chronologically, oldest first.
- [ ] Each comment shows: author, timestamp, markdown body, "edited" indicator, reaction counts, edit/delete controls for authorized users.
- [ ] Timeline events render as compact single-line entries with icon prefix.
- [ ] Comments paginate: default 30/page, max 100/page.
- [ ] Zero comments shows empty-state message.
- [ ] Comment body max 50,000 chars; empty/whitespace-only rejected.
- [ ] Each comment has a URL anchor for deep linking (Web).

### Reaction Constraints

- [ ] 8 reaction types: `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`.
- [ ] Reactions display as grouped emoji badges with counts.
- [ ] Toggle behavior: clicking adds or removes for current user.
- [ ] Available on both issues and individual comments.

### Pin, Lock, and Dependency Constraints

- [ ] Pin available to Admin/Owner only. Max 6 pinned per repo.
- [ ] Lock available to Admin/Owner only with optional reason.
- [ ] Locked issues show lock indicator; non-admin comment form disabled.
- [ ] Dependencies section shows "Depends on" and "Blocks" entries; omitted if none.
- [ ] Self-dependency prevented in UI and API.

### Edge Cases

- [ ] Nonexistent issue number shows 404 with clear messaging.
- [ ] Private repo without auth redirects to login (Web) or shows auth error.
- [ ] Issue numbers 0, negative, and non-numeric produce 400.
- [ ] 255-char titles render without layout breakage.
- [ ] 20+ labels and 10 assignees render with proper overflow handling.
- [ ] Concurrent mutations resolve via last-write-wins without data corruption.
- [ ] Network disconnection reverts optimistic updates with retry affordance.

## Design

### Web UI Design

**Route:** `/:owner/:repo/issues/:number`

**Desktop Layout (≥1024px):**
- Two-column layout: main content area (left) and metadata sidebar (right).
- **Header:** Bold issue title with inline edit affordance (pencil icon). State badge pill (green "Open" / red "Closed"). Issue `#N`. Author `@username` link. Relative timestamps.
- **Body area:** Full markdown rendering with syntax-highlighted code blocks. "Edit" button opens markdown textarea with preview toggle. Save/Cancel buttons. Discard confirmation on navigation with unsaved changes.
- **Sidebar:** Labels as colored chips with gear icon → searchable multi-select dropdown. Assignees with gear → collaborator picker. Milestone → single-select dropdown with "Clear" option. Dependencies list with "Add dependency" link. Pin/Lock buttons (admin-only).
- **Timeline:** Chronological comments + system events. Comments show avatar, `@username`, relative timestamp, markdown body, reaction badges, "edited" indicator, edit/delete controls. System events as compact single-line entries. Comment anchors (`#comment-<id>`) for deep linking.
- **Comment Composer:** Markdown textarea at bottom. Preview toggle. "Close issue"/"Reopen" + "Comment" buttons. Disabled when empty. Character count near 50k limit.

**Mobile Layout (<768px):** Sidebar collapses below body.

**Loading/Error:** Skeleton placeholders on load. 404 page for missing issues. Login redirect for auth. Inline error banners with retry. Section-level failures isolated.

### TUI UI

**Entry:** Enter from issue list, `:issue N` command palette, or `--screen issues --issue N`.

**Layout (120×40):**
```
Title in bold                                           [open]
@author · opened 2h ago · updated 30m ago · N comments
[label1] [label2]                     Assignees: @user1, @user2
Milestone: v2.1
─────────────────────────────────────────────────────────────
Markdown body...
─── Dependencies ────────────────────────────────────────────
Depends on #38: Title
Blocks #45: Title
─── Comments (N) ────────────────────────────────────────────
+ @actor added label bug — 2h ago
@commenter · 1h ago
Comment body...
─────────────────────────────────────────────────────────────
j/k scroll  n/p comments  c comment  e edit  o close  ? help
```

**Keybindings:** `j/k` scroll, `G/gg` jump, `Ctrl+D/U` page, `n/p` comments, `c` comment, `e` edit form, `o` toggle state, `l` label picker, `a` assignee picker, `m` metadata toggle (compact), `Enter` navigate dependency, `R` retry, `q` pop, `?` help, `:` command palette.

**Responsive:** 80×24 compact (collapsed metadata), 120×40 standard (full), 200×60+ expanded (generous spacing).

**Pagination:** 30 items on open, auto-load at 80% scroll depth, 500 item cap.

### CLI Command

```
codeplane issue view <number> [--repo OWNER/REPO] [--json]
```

Human output: `#N Title [state]`, author, timestamps, labels, assignees, milestone, body, comments. JSON output: full `IssueResponse`. Field filtering: `--json title,state`.

Related commands: `issue close`, `issue reopen`, `issue edit`, `issue comment`, `issue react`, `issue pin/unpin`, `issue lock/unlock`, `issue dependency add/list/remove`.

### VS Code Extension

Issues tree view in sidebar. Click opens webview panel with issue detail. Inline action icons for close/reopen and comment. Right-click context menu for edit, labels, assignees, pin.

### Neovim Plugin

`:Codeplane issue view <N>` opens read-only split buffer. `:Codeplane issue close/reopen/comment <N>` for actions. Telescope integration for search → detail navigation.

### API Shape

- `GET /api/repos/:owner/:repo/issues/:number` → `IssueResponse` (200)
- `PATCH /api/repos/:owner/:repo/issues/:number` → partial update (200)
- `GET/POST /api/repos/:owner/:repo/issues/:number/comments` → list/create
- `GET/PATCH/DELETE /api/repos/:owner/:repo/issues/comments/:id` → single comment CRUD
- `GET/POST/DELETE /api/repos/:owner/:repo/issues/:number/labels[/:name]` → label management
- `POST /api/repos/:owner/:repo/issues/:number/reactions` → add reaction
- `PUT /api/repos/:owner/:repo/issues/:number/pin` / `lock` → admin actions
- `GET/POST/DELETE /api/repos/:owner/:repo/issues/:number/dependencies` → dependency CRUD

### SDK Shape

`@codeplane/ui-core` hooks: `useIssue`, `useIssueComments`, `useIssueEvents`, `useIssueDependencies`, `useUpdateIssue`, `useCreateIssueComment`, `useDeleteIssueComment`, `useLabels`, `useCollaborators`, `useMilestones`. All hooks provide `{ data, loading, error }` pattern with 30s cache TTL.

### Documentation

- "Viewing an Issue" guide: access from all surfaces, field explanations.
- "Editing an Issue" guide: inline editing, sidebar controls, CLI flags, TUI form.
- "Managing Issue State" guide: close/reopen from each surface.
- "Commenting" guide: create/edit/delete, markdown, deep linking.
- "Reactions" guide: supported emoji, toggle behavior.
- "Dependencies" guide: linking, graph, navigation.
- "Pinning and Locking" guide: who can, limits, lock reasons.
- "Keyboard Shortcuts" reference: full keybinding table.
- API reference: all endpoints with schemas and error codes.

## Permissions & Security

### Authorization Roles by Action

| Action | Anonymous (public repo) | Read-Only | Member / Write | Admin | Owner |
|--------|------------------------|-----------|----------------|-------|-------|
| View issue detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| View comments | ✅ | ✅ | ✅ | ✅ | ✅ |
| View reactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit own comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete own comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete others' comment | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit issue (title/body) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Close/reopen issue | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage labels on issue | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage assignees | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage milestone | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add/remove reaction | ❌ | ✅ | ✅ | ✅ | ✅ |
| Pin/unpin issue | ❌ | ❌ | ❌ | ✅ | ✅ |
| Lock/unlock issue | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage dependencies | ❌ | ❌ | ✅ | ✅ | ✅ |
| Comment on locked issue | ❌ | ❌ | ❌ | ✅ | ✅ |

**Private repository access**: All operations require authentication plus at least read-level repository access. Unauthenticated requests return 401.

**Organization-owned repos**: User's effective permission is the highest of their direct collaboration role and any team role. Organization owners have implicit admin.

**Deploy keys**: Grant repository transport access only; no issue API access.

**PAT scopes**: `repo` scope required for private repository issue access.

### Rate Limiting

| Action | Limit | Key |
|--------|-------|-----|
| Issue detail retrieval (GET) | 300/min authenticated, 60/min unauthenticated | Per user or per IP |
| Issue edit (PATCH) | 60/min | Per user per repository |
| Comment creation (POST) | 30/min | Per user |
| Comment edit/delete | 60/min | Per user |
| Reaction add/remove | 60/min | Per user |
| Label/assignee management | 60/min | Per user |
| Pin/lock operations | 30/min | Per user |

### Data Privacy

- Issue titles and bodies may contain PII; never logged at INFO level — DEBUG only in non-production.
- User login names are public profile data, safe in responses and logs.
- Email addresses never exposed in issue detail responses.
- Deleted comments are hard-deleted from database and API.
- Webhook payloads for private repos delivered only to configured URLs.
- `updated_at` timestamp reveals edit timing; acceptable for collaboration transparency.

## Telemetry & Product Analytics

### Business Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `issue_detail_viewed` | Issue detail fetched | `repo_id`, `issue_number`, `issue_state`, `client_type` (web/cli/tui/vscode/neovim/api), `viewer_id` (nullable), `comment_count`, `label_count`, `has_milestone`, `has_dependencies` |
| `issue_detail_ui_interaction` | User triggers mutation from detail UI | `repo_id`, `issue_number`, `action` (edit_title/edit_body/toggle_state/add_label/remove_label/add_assignee/remove_assignee/set_milestone/clear_milestone/add_reaction/pin/lock), `actor_id`, `client_type` |
| `issue_state_changed` | Issue closed or reopened | `repo_id`, `issue_number`, `from_state`, `to_state`, `actor_id`, `client_type` |
| `issue_comment_created` | Comment posted | `repo_id`, `issue_number`, `comment_id`, `body_length`, `actor_id`, `client_type`, `is_close_comment` |
| `issue_comment_edited` | Comment edited | `repo_id`, `issue_number`, `comment_id`, `actor_id`, `client_type` |
| `issue_comment_deleted` | Comment deleted | `repo_id`, `issue_number`, `comment_id`, `actor_id`, `client_type`, `is_own_comment` |
| `issue_reaction_toggled` | Reaction added/removed | `repo_id`, `issue_number`, `reaction_content`, `target_type`, `target_id`, `action`, `actor_id`, `client_type` |
| `issue_label_modified` | Label added/removed from sidebar | `repo_id`, `issue_number`, `label_name`, `action`, `actor_id`, `client_type` |
| `issue_dependency_modified` | Dependency created/removed | `repo_id`, `issue_number`, `depends_on_number`, `action`, `actor_id`, `client_type` |
| `issue_detail_error_displayed` | Error state shown to user | `repo_id`, `issue_number`, `error_type`, `client_type` |
| `issue_comment_form_abandoned` | Composer opened with content, navigated away without submit | `repo_id`, `issue_number`, `body_length`, `actor_id`, `client_type` |

### Funnel Metrics and Success Indicators

- **Engagement depth**: % of detail views resulting in a mutation within the session. Target: >15%.
- **Time to first comment**: Median time from issue creation to first comment. Target: <4 hours for active repos.
- **Comment completion rate**: % of composer opens resulting in successful submit. Target: >85%.
- **Close rate**: % of issues closed within 7/30/90 days.
- **Multi-client usage**: % of users viewing the same issue from 2+ client types. Target: >20%.
- **Agent participation rate**: % of issues with at least one agent-authored comment.
- **Dependency adoption**: % of issues with at least one dependency.
- **Reaction engagement**: % of issues with at least one reaction.
- **Client distribution**: Breakdown of views and mutations by client type.
- **Error rate**: % of detail view attempts showing an error. Target: <1%.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Issue detail fetched | `info` | `repo_owner`, `repo_name`, `issue_number`, `viewer_id`, `response_time_ms`, `client_type`, `request_id` | Core access log |
| Issue updated from UI | `info` | `repo_owner`, `repo_name`, `issue_number`, `actor_id`, `fields_changed[]`, `state_transition`, `duration_ms`, `request_id` | Never log body/title at INFO+ |
| Issue state changed | `info` | `repo_owner`, `repo_name`, `issue_number`, `actor_id`, `from_state`, `to_state`, `request_id` | |
| Comment created | `info` | `repo_owner`, `repo_name`, `issue_number`, `comment_id`, `actor_id`, `body_length`, `request_id` | Never log body at INFO+ |
| Comment edited/deleted | `info` | `repo_owner`, `repo_name`, `issue_number`, `comment_id`, `actor_id`, `request_id` | |
| Issue not found | `warn` | `repo_owner`, `repo_name`, `issue_number`, `viewer_id`, `request_id` | Broken link or scan |
| Permission denied | `warn` | `repo_owner`, `repo_name`, `issue_number`, `viewer_id`, `required_permission`, `actual_permission`, `request_id` | |
| Invalid issue number | `warn` | `repo_owner`, `repo_name`, `raw_param`, `viewer_id`, `request_id` | |
| Validation error | `warn` | `repo_owner`, `repo_name`, `issue_number`, `error_code`, `error_field`, `request_id` | |
| Database query failure | `error` | `repo_owner`, `repo_name`, `issue_number`, `operation`, `error_message`, `stack_trace`, `request_id` | |
| Slow query (>200ms) | `warn` | `repo_owner`, `repo_name`, `issue_number`, `query_duration_ms`, `operation`, `request_id` | |
| Rate limit hit | `warn` | `user_id`, `ip_address`, `endpoint`, `limit`, `window`, `request_id` | |
| Optimistic update reverted | `warn` | `repo_owner`, `repo_name`, `issue_number`, `action`, `error_code`, `client_type` | Client-side |
| Comment pagination | `debug` | `repo_owner`, `repo_name`, `issue_number`, `page`, `per_page`, `total_count`, `request_id` | |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_detail_requests_total` | Counter | `status`, `method`, `client_type` | Total issue detail API requests |
| `codeplane_issue_detail_duration_seconds` | Histogram | `method`, `status` | Latency. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5 |
| `codeplane_issue_comments_total` | Counter | `action` (created/updated/deleted), `client_type` | Comment operations |
| `codeplane_issue_state_changes_total` | Counter | `from_state`, `to_state`, `client_type` | State transitions |
| `codeplane_issue_labels_operations_total` | Counter | `action` (added/removed) | Label management |
| `codeplane_issue_reactions_total` | Counter | `content`, `target_type`, `action` | Reaction operations |
| `codeplane_issue_dependencies_total` | Counter | `action` (added/removed) | Dependency operations |
| `codeplane_issue_detail_errors_total` | Counter | `error_type` | Error breakdown |
| `codeplane_issue_comment_body_size_bytes` | Histogram | — | Comment size. Buckets: 100, 500, 1k, 5k, 10k, 25k, 50k |
| `codeplane_issue_detail_optimistic_reverts_total` | Counter | `action`, `client_type` | Client-side reverts |

### Alerts and Runbooks

**Alert 1: `IssueDetailHighErrorRate`**
- Condition: `rate(codeplane_issue_detail_errors_total{error_type="internal"}[5m]) > 0.05`
- Severity: Critical
- Runbook: (1) Confirm sustained errors vs spike. (2) Query logs for `level=error` with issue operations in last 15m. (3) Check DB connectivity: pool metrics, health query. (4) Check if isolated to one repo (data corruption). (5) Check recent deploys; rollback if <30m. (6) If DB deadlocks: check `pg_stat_activity`, kill long transactions.

**Alert 2: `IssueDetailHighLatency`**
- Condition: `histogram_quantile(0.95, rate(codeplane_issue_detail_duration_seconds_bucket[5m])) > 2`
- Severity: Warning
- Runbook: (1) Check p95 by method (GET vs PATCH). (2) Check DB slow query logs for issues/comments tables. (3) Check if specific repo has huge issue/comment count. (4) Review connection pool saturation. (5) Verify indexes on `(issue_id, created_at)`, `(repository_id, number)`. (6) If global: check DB CPU/IO, consider read replicas.

**Alert 3: `IssueCommentSpamRate`**
- Condition: `rate(codeplane_issue_comments_total{action="created"}[5m]) > 50`
- Severity: Warning
- Runbook: (1) Identify high-volume users via `actor_id` logs. (2) Check if agent sessions (legitimate) or abuse. (3) Verify rate limiter functioning (30/min). (4) If single user: check bot misconfiguration, consider suspension. (5) Check for webhook loops. (6) Adjust rate limits.

**Alert 4: `IssueDetailNotFoundSpike`**
- Condition: `rate(codeplane_issue_detail_errors_total{error_type="not_found"}[5m]) > 10`
- Severity: Warning
- Runbook: (1) Check requested issue numbers — sequential (scan) or specific (broken links). (2) If scanning: rate limit 404s by IP. (3) Verify no data corruption. (4) Check for broken UI/integration links. (5) If post-bulk-operation: expected, self-resolving.

**Alert 5: `IssueDetailOptimisticRevertRate`**
- Condition: `rate(codeplane_issue_detail_optimistic_reverts_total[15m]) > 5 * avg_over_time(...[1d:])`
- Severity: Warning
- Runbook: (1) Check which action type reverts most. (2) Check if recent label/collaborator removal caused stale caches. (3) Check server logs for corresponding 4xx/5xx. (4) If correlated with client release: file client bug. (5) Investigate service layer for regressions.

### Error Cases and Failure Modes

| Error | Status | Cause | Recovery |
|-------|--------|-------|----------|
| Invalid issue number | 400 | Non-numeric/zero/negative | Client validates before send |
| Unauthenticated | 401 | No session/PAT on private repo | Redirect to login |
| Permission denied | 403 | Insufficient access | Show permission error |
| Issue not found | 404 | Invalid number | Show "Issue not found" |
| Empty title on edit | 422 | Blank after trim | Show inline validation |
| Title >255 chars | 422 | Too long | Show character count |
| Empty comment body | 422 | Blank after trim | Disable submit |
| Comment >50k chars | 422 | Too long | Show character count |
| Body >100k chars | 422 | Too long | Show character count |
| Locked issue comment | 403 | Non-admin on locked | Show lock message |
| Self-dependency | 422 | Same issue | Prevent in picker |
| Unknown label/assignee | 422 | Not in repo | Inline picker error |
| Rate limited | 429 | Too many requests | Show countdown |
| Network failure | — | Connectivity | Retry button, revert optimistic |
| Internal error | 500 | DB/server failure | Retry button, alert on-call |

## Verification

### API Integration Tests

1. Retrieve open issue: GET → all fields present, `state: "open"`, `closed_at: null`.
2. Retrieve closed issue: GET → `state: "closed"`, `closed_at` non-null.
3. Retrieve issue with labels (3): GET → `labels` array has 3 objects with `id`, `name`, `color`, `description`.
4. Retrieve issue with assignees (2): GET → `assignees` has 2 `{ id, login }` objects.
5. Retrieve issue with milestone: GET → `milestone_id` matches.
6. Retrieve bare issue (no metadata): GET → `labels: []`, `assignees: []`, `milestone_id: null`.
7. Retrieve nonexistent issue (#99999): GET → 404.
8. Retrieve issue #0: GET → 400.
9. Retrieve issue #-1: GET → 400.
10. Retrieve issue "abc": GET → 400.
11. Retrieve from nonexistent repo: GET → 404.
12. Retrieve from private repo unauthenticated: GET → 401.
13. Retrieve from private repo with read access: GET → 200.
14. Retrieve issue with max title (255 chars): GET → title returned in full.
15. Retrieve issue with max body (100,000 chars): GET → body returned in full.
16. Retrieve issue with Unicode/emoji title `"🐛 Fix für Büg #42 修复"`: GET → title exact.
17. Retrieve issue with markdown body (code blocks, tables, images): GET → body as-is.
18. List comments (5): GET → 5 items, `X-Total-Count: 5`.
19. List comments paginated (35): page 1 → 30 items, page 2 → 5 items, `X-Total-Count: 35`.
20. List comments `per_page=100`: accepted.
21. List comments `per_page=101`: clamped to 100 or rejected.
22. List comments on 0-comment issue: empty array, `X-Total-Count: 0`.
23. Create comment: POST → 201, `comment_count` incremented.
24. Create comment empty body: POST `""` → 422.
25. Create comment whitespace body: POST `"  \n  "` → 422.
26. Create comment max body (50,000 chars): POST → 201.
27. Create comment over-max (50,001 chars): POST → 422.
28. Create comment unauthenticated: POST → 401.
29. Create comment read-only: POST → 403.
30. Update comment body: PATCH → 200, `updated_at` changed.
31. Update comment empty body: PATCH `""` → 422.
32. Delete comment: DELETE → 204, `comment_count` decremented.
33. Delete non-owned comment (non-admin): DELETE → 403.
34. Delete non-owned comment (admin): DELETE → 204.
35. Delete nonexistent comment: DELETE → 404.
36. Get single comment: GET → 200, correct response.
37. Add labels: POST → added.
38. Add duplicate label: POST → idempotent.
39. Add nonexistent label: POST → 404/422.
40. Remove label: DELETE → 204.
41. Remove label not on issue: DELETE → 404/204.
42. List issue labels: GET → array.
43. Add dependency: POST → 200/201.
44. Self-dependency: POST → rejection.
45. List dependencies: GET → `{ dependencies, dependents }`.
46. Remove dependency: DELETE → 200/204.
47. Add reaction `+1`: POST → 201.
48. Add duplicate reaction: POST → idempotent.
49. Add invalid reaction: POST `"invalid"` → 422.
50. Pin issue: PUT → 200.
51. Pin with 6 already pinned: PUT → rejection.
52. Unpin: PUT → 200.
53. Lock with reason: PUT → 200.
54. Lock without reason: PUT → 200.
55. Comment on locked issue (non-admin): POST → 403.
56. Comment on locked issue (admin): POST → 201.
57. Unlock: PUT → 200.
58. Edit title: PATCH `{ "title": "New" }` → 200, only title changed.
59. Edit body: PATCH → 200.
60. Close: PATCH `{ "state": "closed" }` → `closed_at` set.
61. Reopen: PATCH `{ "state": "open" }` → `closed_at: null`.
62. Edit empty title: PATCH `""` → 422.
63. Edit over-max title (256): PATCH → 422.
64. Edit max title (255): PATCH → 200.
65. Edit over-max body (100,001): PATCH → 422.
66. Edit max body (100,000): PATCH → 200.
67. Edit unauthenticated: PATCH → 401.
68. Edit read-only: PATCH → 403.
69. Concurrent edits (title + labels): both succeed.
70. Idempotent re-edit: PATCH same twice → both 200.

### CLI E2E Tests

71. `issue view <N> --json`: JSON matches API response.
72. `issue view <N>` (text): includes title, state, author, body.
73. `issue view 99999`: non-zero exit, "not found".
74. `issue view` with labels/assignees: `--json` arrays populated.
75. `issue close <N> --json`: `state: "closed"`.
76. `issue close <N> --comment "Fixed"`: closed AND comment created.
77. `issue reopen <N> --json`: `state: "open"`.
78. `issue edit <N> --title "New" --json`: title changed.
79. `issue edit <N> --label bug --json`: label present.
80. `issue edit <N> --assignee alice --json`: assignee present.
81. `issue comment <N> --body "Test"`: success.
82. `issue react <N> +1`: success.
83. `issue pin/unpin`: pin → visible in list; unpin → removed.
84. `issue lock/unlock`: lock with reason → verify; unlock → verify.
85. `issue dependency add <N> --blocked-by <M>`: success, shows in list.
86. `issue dependency remove`: removed from list.
87. `issue dependency add` self-dep: non-zero exit, error.
88. `issue view --json title,state`: only filtered fields.
89. `issue view` unauthenticated private: auth error.

### Playwright Web UI E2E Tests

90. Issue detail page loads with title, state, body.
91. Labels visible in sidebar.
92. Assignees visible in sidebar.
93. Milestone visible.
94. Comment timeline renders (3 comments visible).
95. Zero comments → "No comments yet".
96. Empty body → "No description provided." placeholder.
97. Close issue button → state changes.
98. Reopen button → state changes.
99. Add comment → appears in timeline.
100. Close with comment → comment + state change.
101. Empty comment → submit disabled.
102. Inline title edit → saves on Enter.
103. Inline title cancel → reverts on Escape.
104. Inline title empty → validation error.
105. Body edit save → re-renders.
106. Body cancel with changes → confirmation dialog.
107. Body cancel without changes → no confirmation.
108. Labels sidebar add/remove → optimistic update.
109. Assignees sidebar add/remove → optimistic update.
110. Milestone set/clear → updates.
111. Reaction add → badge appears.
112. Reaction toggle remove → badge decrements.
113. Comment anchor `#comment-<id>` → scrolls to comment.
114. Comment edit by author → "edited" indicator.
115. Comment delete by author → removed, count decremented.
116. Non-author comment → edit/delete hidden.
117. Markdown rendering (code, links, images, tables).
118. Dependencies section visible.
119. Dependency navigation → other issue.
120. Unauthenticated public → read-only, no controls.
121. Private repo no auth → login redirect.
122. Nonexistent issue → 404 page.
123. Read-only user → controls hidden/disabled.
124. Pin/lock admin-only visibility.
125. Locked issue → composer disabled for non-admin.
126. Optimistic revert on server error.
127. Network error → retry banner.
128. Responsive mobile → sidebar collapses.

### TUI E2E Tests

129. Detail renders from list (Enter).
130. Labels visible.
131. Assignees visible.
132. Markdown body rendered.
133. Empty body placeholder.
134. Comments displayed.
135. Zero comments message.
136. Comment creation (`c`, type, `Ctrl+S`).
137. State toggle (`o`).
138. Label picker (`l`).
139. Assignee picker (`a`).
140. Scroll (`j/k`).
141. Comment nav (`n/p`).
142. Jump (`gg`/`G`).
143. Page nav (`Ctrl+D/U`).
144. Pop screen (`q`).
145. Help (`?`).
146. Command palette (`:`).
147. Edit form (`e`).
148. Dependencies display.
149. Dependency navigation (Enter).
150. Network error display.
151. Retry (`R`).
152. 404 error display.
153. Compact layout (80×24).
154. Standard layout (120×40).
155. Comment pagination (40 comments → auto-load).
156. Breadcrumb display.

### Cross-Client Consistency Tests

157. Create via API → view CLI + Web: all match.
158. Edit title via CLI → verify API + Web.
159. Comment via API → view CLI.
160. Close via CLI → verify API.
161. Add label via Web → verify CLI.
162. Add reaction via API → verify Web.
163. Pin via CLI → verify Web issue list.

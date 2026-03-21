# ISSUE_DETAIL

Specification for ISSUE_DETAIL.

## High-Level User POV

When a Codeplane user navigates to a specific issue — whether from a web link, the issue list, a CLI command, the TUI, or an editor integration — they expect a comprehensive, single-screen view that gives them full context on the issue without switching tools or contexts.

The issue detail view displays the issue's title, current state (open or closed), who filed it, when it was created and last updated, the full markdown description, and all associated metadata: labels, assignees, and milestone. Below the description, the user sees a chronological timeline that interleaves comments with system events — label additions, assignee changes, state transitions, and cross-references to other issues. Users can scroll through this timeline to understand the full history of the issue.

Authenticated users with the appropriate permissions can interact directly from the detail view. They can edit the issue's title, body, labels, assignees, and milestone. They can close or reopen the issue with a single action. They can add comments with markdown formatting. They can add emoji reactions to both the issue itself and individual comments. They can pin or unpin the issue, lock or unlock discussion, and manage dependency relationships to other issues in the same repository.

The issue detail is consistent across every Codeplane client surface. Whether a developer is in the web UI, running `codeplane issue view 42`, browsing in the TUI, or using the VS Code sidebar, they see the same data from the same API and can perform the same actions. This consistency means teams using a mix of tools — terminal-first developers, web-focused product managers, and agents operating via the API — all share a single source of truth for issue state.

The detail view is also the natural integration point for Codeplane's agent-driven workflows. When an agent picks up an issue, it reads the detail via the API. When it produces findings, it comments on the issue. When it creates a workspace and landing request from an issue, those references appear in the timeline. The issue detail is the convergence point where human and agent collaboration becomes visible.

## Acceptance Criteria

- **Core retrieval**: `GET /api/repos/:owner/:repo/issues/:number` returns a single issue with all fields: `id`, `number`, `title`, `body`, `state`, `author`, `assignees`, `labels`, `milestone_id`, `comment_count`, `closed_at`, `created_at`, `updated_at`.
- **Author resolution**: The `author` field is an embedded object with `id` and `login`, not a raw ID.
- **Assignee resolution**: The `assignees` field is an array of `{ id, login }` objects, empty array if none assigned.
- **Label resolution**: The `labels` field is an array of `{ id, name, color, description }` objects, empty array if none attached.
- **State normalization**: The `state` field is always lowercase `"open"` or `"closed"`, never any other value.
- **Timestamp format**: All timestamps (`created_at`, `updated_at`, `closed_at`) are ISO 8601 strings; `closed_at` is `null` when issue is open.
- **Issue number validation**: The `:number` path parameter must be a positive integer; non-numeric or zero/negative values return `400 Bad Request`.
- **Not-found handling**: A valid but nonexistent issue number returns `404 Not Found`, not an empty body or 200.
- **Repository scoping**: Issue numbers are scoped per-repository; issue #5 in `alice/frontend` is unrelated to issue #5 in `alice/backend`.
- **Title constraints**: Title must be non-empty after trimming whitespace. Maximum length: 255 characters. Titles consisting solely of whitespace are rejected.
- **Body constraints**: Body may be empty string. Maximum length: 100,000 characters. Body is stored as-is (markdown).
- **Comment body constraints**: Comment body must be non-empty after trimming. Maximum length: 50,000 characters.
- **Label name constraints**: Label names have a maximum of 50 characters. Label names are case-sensitive.
- **Username constraints**: Usernames have a maximum of 39 characters.
- **Comment pagination**: Comments are paginated with `page`/`per_page` parameters; default 30 per page, maximum 100 per page. `X-Total-Count` header is set.
- **Issue edit**: `PATCH /api/repos/:owner/:repo/issues/:number` accepts partial updates; only provided fields are changed. Sending `{ "milestone": null }` explicitly unsets the milestone.
- **State toggle**: Setting `state` to `"closed"` auto-populates `closed_at`; setting to `"open"` clears `closed_at`.
- **Comment CRUD**: Comments support create, read, update, and delete operations. Comment count on the issue is kept in sync (incremented on create, decremented on delete).
- **Label management on issue**: Labels can be added via `POST .../issues/:number/labels` with `{ labels: ["name1", "name2"] }` and removed via `DELETE .../issues/:number/labels/:name`.
- **Reactions**: Reactions (emoji) can be added to issues and comments. Supported reaction types include at minimum: `+1`, `-1`, `laugh`, `heart`, `hooray`, `confused`, `eyes`, `rocket`.
- **Pinning**: Issues can be pinned/unpinned to a repository. Pinned issues have positional ordering.
- **Locking**: Issues can be locked with an optional reason (`off-topic`, `too heated`, `resolved`, `spam`). Locked issues reject new comments from non-admin users.
- **Dependencies**: Issues can declare dependency relationships (`depends_on` / `blocks`). Self-dependency is rejected. Dependencies are listed with both `dependencies` and `dependents` arrays.
- **Optimistic UI**: All mutation actions in the TUI and web UI should use optimistic updates that revert on server error.
- **Empty states**: All clients handle an issue with no comments, no labels, no assignees, and no milestone gracefully — showing appropriate empty-state text rather than blank space or errors.
- **Concurrent edit safety**: When two users edit the same issue simultaneously, the last write wins but no data corruption occurs. The `updated_at` timestamp reflects the latest change.
- **Definition of Done**: Feature is complete when a user can retrieve issue detail, view all metadata and comments, edit all mutable fields, toggle state, add/edit/delete comments, manage labels, add reactions, pin, lock, manage dependencies, and perform all actions from API, CLI, TUI, web UI, and editor integrations with consistent behavior.

## Design

### API Shape

**Retrieve Issue Detail**

```
GET /api/repos/:owner/:repo/issues/:number
```

Response `200 OK`:
```json
{
  "id": 12345,
  "number": 42,
  "title": "Fix memory leak in SSE reconnection handler",
  "body": "## Problem\nThe SSE reconnection handler leaks memory when...",
  "state": "open",
  "author": { "id": 1, "login": "alice" },
  "assignees": [
    { "id": 2, "login": "bob" },
    { "id": 3, "login": "carol" }
  ],
  "labels": [
    { "id": 10, "name": "bug", "color": "d73a4a", "description": "Something isn't working" },
    { "id": 11, "name": "priority:high", "color": "e11d48", "description": "High priority" }
  ],
  "milestone_id": 5,
  "comment_count": 8,
  "closed_at": null,
  "created_at": "2026-03-20T10:30:00Z",
  "updated_at": "2026-03-22T14:15:00Z"
}
```

Error responses:
- `400`: Invalid issue number (non-numeric, zero, negative)
- `401`: Authentication required for private repository
- `403`: Insufficient repository access
- `404`: Issue or repository not found

**Update Issue**

```
PATCH /api/repos/:owner/:repo/issues/:number
Content-Type: application/json

{
  "title": "Updated title",
  "body": "Updated body",
  "state": "closed",
  "assignees": ["bob"],
  "labels": ["bug", "urgent"],
  "milestone": 5
}
```

All fields are optional. Omitted fields remain unchanged. Setting `"milestone": null` unsets the milestone.

Response `200 OK`: Full `IssueResponse` with updated fields.

**List Comments**

```
GET /api/repos/:owner/:repo/issues/:number/comments?page=1&per_page=30
```

Response `200 OK`:
```json
[
  {
    "id": 100,
    "issue_id": 12345,
    "user_id": 2,
    "commenter": "bob",
    "body": "I can reproduce this. The EventSource object is never closed...",
    "type": "comment",
    "created_at": "2026-03-20T11:00:00Z",
    "updated_at": "2026-03-20T11:00:00Z"
  }
]
```

Headers: `X-Total-Count: 8`

**Create Comment**

```
POST /api/repos/:owner/:repo/issues/:number/comments
Content-Type: application/json

{ "body": "Investigation started" }
```

Response `201 Created`: `IssueCommentResponse`.

**Update Comment**

```
PATCH /api/repos/:owner/:repo/issues/comments/:id
Content-Type: application/json

{ "body": "Updated comment text" }
```

Response `200 OK`: Updated `IssueCommentResponse`.

**Delete Comment**

```
DELETE /api/repos/:owner/:repo/issues/comments/:id
```

Response `204 No Content`.

**Get Single Comment**

```
GET /api/repos/:owner/:repo/issues/comments/:id
```

Response `200 OK`: `IssueCommentResponse`.

**Issue Labels**

```
GET  /api/repos/:owner/:repo/issues/:number/labels
POST /api/repos/:owner/:repo/issues/:number/labels     { "labels": ["bug", "urgent"] }
DELETE /api/repos/:owner/:repo/issues/:number/labels/:name
```

**Reactions**

```
POST /api/repos/:owner/:repo/issues/:number/reactions   { "content": "+1" }
```

**Pin/Lock**

```
PUT /api/repos/:owner/:repo/issues/:number/pin
PUT /api/repos/:owner/:repo/issues/:number/lock          { "reason": "resolved" }
```

**Dependencies**

```
POST   /api/repos/:owner/:repo/issues/:number/dependencies   { "blocks": 45 }
GET    /api/repos/:owner/:repo/issues/:number/dependencies
DELETE /api/repos/:owner/:repo/issues/:number/dependencies/:dependsOnNumber
```

### CLI Command

```
codeplane issue view <number> [--repo OWNER/REPO] [--json]
```

**Text output** (human-readable):
```
#42 Fix memory leak in SSE reconnection handler  [open]
Author: @alice
Created: 2 days ago  Updated: 30 minutes ago
Labels: bug, priority:high
Assignees: @bob, @carol
Milestone: v2.1

## Problem
The SSE reconnection handler leaks memory when the connection drops...

---
Comments (8):

@bob · 1 day ago
I can reproduce this. The EventSource object is never closed...

@carol · 12 hours ago
Fixed in change abc123...
```

**JSON output** (`--json`): Full `IssueResponse` object.

Additional CLI commands that operate on the issue detail:
- `codeplane issue edit <number> --title "..." --body "..." --add-assignee <user> --add-label <label> --repo OWNER/REPO`
- `codeplane issue close <number> [--comment "..."] --repo OWNER/REPO`
- `codeplane issue reopen <number> --repo OWNER/REPO`
- `codeplane issue comment <number> --body "..." --repo OWNER/REPO`
- `codeplane issue react <number> <emoji> --repo OWNER/REPO`
- `codeplane issue pin <number> --repo OWNER/REPO`
- `codeplane issue dependency add <number> --blocked-by <number> --repo OWNER/REPO`
- `codeplane issue dependency list <number> --repo OWNER/REPO`
- `codeplane issue dependency remove <number> --blocked-by <number> --repo OWNER/REPO`

### Web UI Design

The issue detail page is routed at `/:owner/:repo/issues/:number`.

**Layout:**
- **Header area**: Issue title displayed prominently with inline edit affordance. State badge (`Open` in green, `Closed` in red/purple) displayed next to or below the title. Issue number displayed as `#N`. Author username as a link. Created and updated relative timestamps.
- **Sidebar** (right column on desktop, collapsed below content on mobile): Labels displayed as colored chips. Assignees displayed as avatar + username items. Milestone displayed as a link. Dependency summary (if any). Pin and lock status indicators.
- **Body area**: Markdown-rendered issue body with syntax highlighting for code blocks, clickable links, rendered images, tables, and block quotes. Empty body shows placeholder text.
- **Timeline section**: Chronological list of comments and system events. Each comment shows author avatar, username, relative timestamp, markdown body, reaction counts, and edit/delete controls for the author. System events (label changes, assignee changes, state transitions, cross-references) shown as compact single-line entries with descriptive icons. Comment composer at the bottom with markdown textarea, preview toggle, and submit button.

**Interactions:**
- Click title to enter inline edit mode.
- Click "Edit" button to open issue edit form (title, body, labels, assignees, milestone).
- Click "Close issue" / "Reopen issue" button to toggle state.
- Click "Comment" button or use keyboard shortcut to focus comment textarea.
- Click label chips in sidebar to add/remove labels via picker.
- Click assignee section to add/remove assignees via picker.
- Click reaction emoji on comments/issue body to toggle reaction.
- URL-shareable: each comment has an anchor (e.g., `#comment-100`) for direct linking.

### TUI UI

The TUI issue detail screen is pushed onto the screen stack when a user presses Enter on an issue in the list.

**Screen Layout** (120×40 standard terminal):
```
Fix memory leak in SSE reconnection handler                  [open]
@alice · opened 2h ago · updated 30m ago · 5 comments
[bug] [priority:high]                       Assignees: @bob, @carol
Milestone: v2.1
─────────────────────────────────────────────────────────────────────
## Problem
The SSE reconnection handler leaks memory when...
─────────── Dependencies ───────────────────────────────────────────
Depends on #38: Refactor SSE connection manager
Blocks #45: Release v2.1
─────────── Comments (5) ───────────────────────────────────────────
+ @dave added label bug — 2h ago
@bob · 1h ago
I can reproduce this...
→ @alice changed state open → closed — 30m ago
@carol · 25m ago
Fixed in change abc123...
```

**Keybindings:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Scroll down |
| `k` / `↑` | Scroll up |
| `G` | Jump to bottom |
| `g g` | Jump to top |
| `Ctrl+D` / `Ctrl+U` | Page down / up |
| `n` / `p` | Next / previous comment |
| `c` | Open comment textarea |
| `e` | Edit issue form |
| `o` | Toggle open/closed |
| `l` | Label picker overlay |
| `a` | Assignee picker overlay |
| `R` | Retry failed fetch |
| `q` | Pop screen |
| `?` | Help overlay |
| `:` | Command palette |

**Responsive behavior:**
- **80×24** (compact): Metadata collapsed, labels behind `m` toggle, minimal padding.
- **120×40** (standard): Full metadata row, inline labels, standard spacing.
- **200×60+** (expanded): Full timestamps, generous padding, wider body area.

**Optimistic UI patterns:**
- State toggle: badge flips immediately, reverts on error.
- Comment creation: comment appears at bottom immediately with pending indicator, replaced with server data on success, removed on error.
- Label/assignee changes: update inline immediately, revert on error.

### SDK Shape

The `@codeplane/sdk` IssueService exposes:
- `getIssue(viewer, owner, repo, number)` → `IssueResponse`
- `updateIssue(actor, owner, repo, number, req)` → `IssueResponse`
- `createIssueComment(actor, owner, repo, number, req)` → `IssueCommentResponse`
- `listIssueComments(viewer, owner, repo, number, page, perPage)` → `{ items, total }`
- `getIssueComment(viewer, owner, repo, commentId)` → `IssueCommentResponse`
- `updateIssueComment(actor, owner, repo, commentId, req)` → `IssueCommentResponse`
- `deleteIssueComment(actor, owner, repo, commentId)` → `void`
- `createIssueEvent(actor, owner, repo, number, eventType, payload)` → event record
- `listIssueEvents(viewer, owner, repo, number, page, perPage)` → `{ items, total }`
- `addDependency(actor, owner, repo, issueNumber, dependsOnNumber)` → dependency record
- `removeDependency(actor, owner, repo, issueNumber, dependsOnNumber)` → `void`
- `listDependencies(viewer, owner, repo, issueNumber)` → `{ dependencies, dependents }`

The `@codeplane/ui-core` package provides shared hooks:
- `useIssue(owner, repo, number)` — fetches and caches issue detail
- `useIssueComments(owner, repo, number)` — paginated comment list
- `useIssueEvents(owner, repo, number)` — paginated timeline events
- `useIssueDependencies(owner, repo, number)` — dependency graph
- `useUpdateIssue(owner, repo, number)` — mutation hook for edits and state changes
- `useCreateIssueComment(owner, repo, number)` — comment creation mutation
- `useLabels(owner, repo)` — label picker data
- `useCollaborators(owner, repo)` — assignee picker data

### Neovim Plugin API

The Neovim plugin provides:
- `:Codeplane issue view <number>` — opens issue detail in a split buffer
- `:Codeplane issue close <number>` — closes issue
- `:Codeplane issue comment <number>` — opens comment buffer for composition
- Telescope integration for issue search and selection, navigating to detail

### VS Code Extension

The VS Code extension provides:
- Issues tree view in the sidebar with clickable issue items
- Opening an issue shows detail in a webview panel
- Inline actions for close/reopen, comment, and label management
- Status bar indicator showing current issue context (if working on a linked issue)

### Documentation

End-user documentation must cover:
- **Viewing an issue**: How to access issue detail from web, CLI, TUI, and editor. What each field means.
- **Editing an issue**: How to modify title, body, assignees, labels, and milestone from each client.
- **Managing issue state**: How to close and reopen issues, what happens to `closed_at`.
- **Commenting**: How to add, edit, and delete comments. Markdown support.
- **Reactions**: How to add emoji reactions and which emoji are supported.
- **Dependencies**: How to link issues as blockers/dependencies and view the dependency graph.
- **Pinning and locking**: How to pin issues to a repository and lock discussions.
- **Keyboard shortcuts**: Full keybinding reference for TUI and web UI.
- **API reference**: Complete endpoint documentation for programmatic access.

## Permissions & Security

**Authorization roles by action:**

| Action | Anonymous (public repo) | Read-Only | Member / Write | Admin | Owner |
|--------|------------------------|-----------|----------------|-------|-------|
| View issue detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| View comments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit own comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete own comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete others' comment | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit issue | ❌ | ❌ | ✅ | ✅ | ✅ |
| Close/reopen issue | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage labels | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage assignees | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage milestone | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add reaction | ❌ | ✅ | ✅ | ✅ | ✅ |
| Pin/unpin issue | ❌ | ❌ | ❌ | ✅ | ✅ |
| Lock/unlock issue | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage dependencies | ❌ | ❌ | ✅ | ✅ | ✅ |
| Comment on locked issue | ❌ | ❌ | ❌ | ✅ | ✅ |

**Private repository access**: All operations require authentication plus at least read-level repository access.

**Organization-owned repos**: Team-level permissions are resolved; a user's effective permission is the highest of their direct collaboration role and any team role granting access to the repository.

**Deploy keys**: Deploy keys grant repository transport access only; they do not grant issue API access.

**PAT scopes**: Personal access tokens require the `repo` scope for private repository issue access.

**Rate limiting:**
- Issue detail retrieval: 300 requests per minute per authenticated user, 60 per minute per IP for unauthenticated.
- Comment creation: 30 per minute per user (prevents spam flooding).
- Issue edits/state changes: 60 per minute per user.
- Reactions: 60 per minute per user.
- Label/assignee management: 60 per minute per user.

**Data privacy:**
- Issue body and comment bodies may contain PII; they are stored as-is and returned only to authorized viewers.
- User login names are embedded in responses; they are considered public profile data.
- Email addresses are never exposed in issue detail responses.
- Deleted comments are hard-deleted; they do not remain in the database or API responses.

## Telemetry & Product Analytics

**Business events:**

| Event | Properties | When Fired |
|-------|-----------|------------|
| `issue_detail_viewed` | `repo_id`, `issue_number`, `issue_state`, `client_type` (web/cli/tui/vscode/neovim/api), `viewer_id` (nullable), `comment_count`, `label_count` | Issue detail fetched |
| `issue_updated` | `repo_id`, `issue_number`, `fields_changed[]` (title/body/state/assignees/labels/milestone), `actor_id`, `client_type` | Issue patched |
| `issue_state_changed` | `repo_id`, `issue_number`, `from_state`, `to_state`, `actor_id`, `client_type` | Issue closed or reopened |
| `issue_comment_created` | `repo_id`, `issue_number`, `comment_id`, `body_length`, `actor_id`, `client_type` | Comment posted |
| `issue_comment_updated` | `repo_id`, `issue_number`, `comment_id`, `actor_id`, `client_type` | Comment edited |
| `issue_comment_deleted` | `repo_id`, `issue_number`, `comment_id`, `actor_id`, `client_type` | Comment deleted |
| `issue_label_added` | `repo_id`, `issue_number`, `label_name`, `actor_id` | Label attached |
| `issue_label_removed` | `repo_id`, `issue_number`, `label_name`, `actor_id` | Label removed |
| `issue_reaction_added` | `repo_id`, `issue_number`, `reaction_content`, `target_type` (issue/comment), `actor_id` | Reaction added |
| `issue_pinned` | `repo_id`, `issue_number`, `actor_id` | Issue pinned |
| `issue_locked` | `repo_id`, `issue_number`, `lock_reason`, `actor_id` | Issue locked |
| `issue_dependency_added` | `repo_id`, `issue_number`, `depends_on_number`, `actor_id` | Dependency created |

**Funnel metrics and success indicators:**
- **Engagement depth**: Percentage of issue detail views that result in a comment or state change within the same session.
- **Time to first comment**: Median time between issue creation and first comment — measures team responsiveness.
- **Close rate**: Percentage of issues that transition from open to closed within 7/30/90 days.
- **Multi-client usage**: Percentage of users who view the same issue from 2+ client types (indicates platform stickiness).
- **Agent participation rate**: Percentage of issues where at least one comment is authored by an agent session.
- **Comment frequency**: Average comments per issue — measures collaboration health.
- **Dependency usage**: Percentage of issues that have at least one dependency relationship — measures adoption of the feature.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Issue detail fetched | `info` | `repo_owner`, `repo_name`, `issue_number`, `viewer_id`, `response_time_ms`, `client_type` |
| Issue updated | `info` | `repo_owner`, `repo_name`, `issue_number`, `actor_id`, `fields_changed`, `response_time_ms` |
| Issue state changed | `info` | `repo_owner`, `repo_name`, `issue_number`, `actor_id`, `from_state`, `to_state` |
| Comment created | `info` | `repo_owner`, `repo_name`, `issue_number`, `comment_id`, `actor_id`, `body_length` |
| Comment deleted | `info` | `repo_owner`, `repo_name`, `issue_number`, `comment_id`, `actor_id` |
| Issue not found | `warn` | `repo_owner`, `repo_name`, `issue_number`, `viewer_id` |
| Permission denied | `warn` | `repo_owner`, `repo_name`, `issue_number`, `viewer_id`, `required_permission`, `actual_permission` |
| Invalid issue number | `warn` | `repo_owner`, `repo_name`, `raw_param`, `viewer_id` |
| Database query failure | `error` | `repo_owner`, `repo_name`, `issue_number`, `operation`, `error_message`, `stack_trace` |
| Rate limit hit | `warn` | `user_id`, `ip_address`, `endpoint`, `limit`, `window` |
| Slow query detected (>200ms) | `warn` | `repo_owner`, `repo_name`, `issue_number`, `query_duration_ms`, `operation` |
| Validation error | `warn` | `repo_owner`, `repo_name`, `issue_number`, `field`, `code`, `value_length` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_detail_requests_total` | counter | `status`, `method` | Total issue detail API requests |
| `codeplane_issue_detail_duration_seconds` | histogram | `method`, `status` | Latency for issue detail operations |
| `codeplane_issue_comments_total` | counter | `action` (created/updated/deleted) | Comment operations |
| `codeplane_issue_state_changes_total` | counter | `from_state`, `to_state` | Issue state transitions |
| `codeplane_issue_labels_operations_total` | counter | `action` (added/removed) | Label management operations |
| `codeplane_issue_reactions_total` | counter | `content`, `target_type` | Reaction additions |
| `codeplane_issue_dependencies_total` | counter | `action` (added/removed) | Dependency operations |
| `codeplane_issue_detail_errors_total` | counter | `error_type` (not_found/forbidden/validation/internal) | Error breakdown |
| `codeplane_issue_comment_body_size_bytes` | histogram | — | Distribution of comment body sizes |
| `codeplane_issue_comments_per_page_count` | histogram | — | Comments returned per page request |

### Alerts and Runbooks

**Alert: `IssueDetailHighErrorRate`**
- **Condition**: `rate(codeplane_issue_detail_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check `codeplane_issue_detail_errors_total` by error_type to identify the dominant error category.
  2. Check application logs filtered by `level=error` and `operation=getIssue` for stack traces.
  3. Verify database connectivity: check connection pool metrics and run a health check query.
  4. Check if the issue is isolated to a specific repository (check `repo_owner`/`repo_name` in logs).
  5. If database-related, check for long-running queries, lock contention, or disk space issues.
  6. If application-related, check recent deployments and consider rollback.

**Alert: `IssueDetailHighLatency`**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_detail_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check the p95 latency breakdown by method (GET vs PATCH vs POST).
  2. Check database slow query logs for queries touching the issues, issue_comments, or issue_labels tables.
  3. Check if the latency is isolated to a specific repo (a repo with an extremely large number of issues/comments).
  4. Review connection pool saturation metrics.
  5. Consider adding database indexes if a new query pattern is identified.
  6. If comment pagination is slow, check the index on `(issue_id, created_at)`.

**Alert: `IssueCommentSpamRate`**
- **Condition**: `rate(codeplane_issue_comments_total{action="created"}[5m]) > 50`
- **Severity**: Warning
- **Runbook**:
  1. Check which users are creating comments at high volume (filter logs by `actor_id`).
  2. Verify rate limiting is functioning correctly.
  3. Check if the high volume is from agent sessions (legitimate) or potential abuse.
  4. If abuse, consider IP-level blocking or account suspension.
  5. Review rate limit thresholds and adjust if needed.

**Alert: `IssueDetailNotFoundSpike`**
- **Condition**: `rate(codeplane_issue_detail_errors_total{error_type="not_found"}[5m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check logs for the `issue_number` values being requested — determine if it's a bot scanning sequential issue numbers.
  2. Verify no data corruption has occurred (issues exist in DB but aren't being found).
  3. If scanning behavior, consider adding rate limiting for not-found responses.
  4. Check for broken links in the web UI or external integrations.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Invalid issue number format | 400 | Non-numeric, zero, or negative `:number` param | Client validates before sending |
| Empty title on edit | 422 | Title trimmed to empty string | Client enforces non-empty |
| Empty comment body | 422 | Comment body trimmed to empty string | Client enforces non-empty |
| Title exceeds 255 chars | 422 | Title too long | Client enforces max length |
| Comment body exceeds 50k chars | 422 | Body too long | Client enforces max length |
| Issue body exceeds 100k chars | 422 | Body too long | Client enforces max length |
| Issue not found | 404 | Invalid number for repo | Show "issue not found" UI |
| Repository not found | 404 | Invalid owner/repo | Show "repository not found" UI |
| Authentication required | 401 | No session/PAT on private repo | Redirect to login |
| Permission denied | 403 | Insufficient repo access | Show permission error |
| Self-dependency | 422 | Issue depends on itself | Client prevents, server rejects |
| Label not found in repo | 404 | Label name doesn't exist | Refresh label list |
| User not found for assignee | 404 | Username doesn't exist | Refresh collaborator list |
| Milestone not found | 404 | Milestone ID doesn't exist | Refresh milestone list |
| Rate limited | 429 | Too many requests | Show retry-after countdown |
| Database error | 500 | Internal failure | Retry with backoff; alert on-call |
| Comment on locked issue | 403 | Issue is locked, user is not admin | Show "issue is locked" message |

## Verification

### API Integration Tests

1. **Retrieve open issue**: Create issue, GET by number → verify all fields present and correct.
2. **Retrieve closed issue**: Create issue, close it, GET → verify `state: "closed"`, `closed_at` is non-null ISO timestamp.
3. **Retrieve issue with labels**: Create issue with labels, GET → verify `labels` array contains objects with `id`, `name`, `color`, `description`.
4. **Retrieve issue with assignees**: Create issue, assign users, GET → verify `assignees` array contains `{ id, login }` objects.
5. **Retrieve issue with milestone**: Create issue with milestone, GET → verify `milestone_id` is set.
6. **Retrieve issue with no optional metadata**: Create bare issue (no labels, assignees, milestone), GET → verify empty arrays and null milestone.
7. **Retrieve nonexistent issue**: GET issue #99999 → verify `404`.
8. **Retrieve with invalid number (zero)**: GET issue #0 → verify `400`.
9. **Retrieve with invalid number (negative)**: GET issue #-1 → verify `400`.
10. **Retrieve with non-numeric number**: GET issue "abc" → verify `400`.
11. **Retrieve from nonexistent repo**: GET issue from nonexistent repo → verify `404`.
12. **Retrieve from private repo unauthenticated**: GET → verify `401`.
13. **Retrieve from private repo with read access**: GET with read-access token → verify `200`.
14. **Update issue title**: PATCH with `{ "title": "New title" }` → verify title changed, other fields unchanged.
15. **Update issue body**: PATCH with `{ "body": "New body" }` → verify body changed.
16. **Update issue state to closed**: PATCH with `{ "state": "closed" }` → verify `state: "closed"`, `closed_at` is set.
17. **Update issue state to open (reopen)**: Close issue, PATCH with `{ "state": "open" }` → verify `state: "open"`, `closed_at` is null.
18. **Update issue assignees**: PATCH with `{ "assignees": ["bob", "carol"] }` → verify assignees replaced.
19. **Update issue labels**: PATCH with `{ "labels": ["bug"] }` → verify labels replaced.
20. **Update issue milestone**: PATCH with `{ "milestone": 5 }` → verify `milestone_id: 5`.
21. **Unset milestone explicitly**: PATCH with `{ "milestone": null }` → verify `milestone_id: null`.
22. **Omit milestone field**: PATCH with `{ "title": "X" }` → verify milestone unchanged.
23. **Update with empty title**: PATCH with `{ "title": "" }` → verify `422`.
24. **Update with whitespace-only title**: PATCH with `{ "title": "   " }` → verify `422`.
25. **Update with maximum-length title (255 chars)**: PATCH → verify `200`, title saved correctly.
26. **Update with over-maximum title (256 chars)**: PATCH → verify `422`.
27. **Update with maximum-length body (100,000 chars)**: PATCH → verify `200`, body saved correctly.
28. **Update with over-maximum body (100,001 chars)**: PATCH → verify `422`.
29. **Update without authentication**: PATCH → verify `401`.
30. **Update without write permission**: PATCH with read-only token → verify `403`.
31. **List comments default pagination**: Create 5 comments, GET → verify array of 5 with correct fields.
32. **List comments with pagination**: Create 35 comments, GET page=1&per_page=30 → verify 30 items. GET page=2 → verify 5 items. Check `X-Total-Count: 35`.
33. **List comments per_page max (100)**: GET per_page=100 → verify accepted.
34. **List comments per_page over max**: GET per_page=101 → verify clamped to 100 or rejected.
35. **List comments on issue with zero comments**: GET → verify empty array, `X-Total-Count: 0`.
36. **Create comment**: POST with `{ "body": "New comment" }` → verify `201`, comment returned, issue `comment_count` incremented.
37. **Create comment with empty body**: POST with `{ "body": "" }` → verify `422`.
38. **Create comment with whitespace-only body**: POST with `{ "body": "  \n  " }` → verify `422`.
39. **Create comment with maximum-length body (50,000 chars)**: POST → verify `201`.
40. **Create comment with over-maximum body (50,001 chars)**: POST → verify `422`.
41. **Create comment without authentication**: POST → verify `401`.
42. **Update comment**: PATCH comment → verify body updated, `updated_at` changed.
43. **Update comment with empty body**: PATCH with `{ "body": "" }` → verify `422`.
44. **Delete comment**: DELETE comment → verify `204`, issue `comment_count` decremented.
45. **Delete comment without permission (not author, not admin)**: DELETE → verify `403`.
46. **Delete nonexistent comment**: DELETE → verify `404`.
47. **Get single comment by ID**: GET → verify correct `IssueCommentResponse`.
48. **Add labels to issue**: POST labels → verify labels added.
49. **Add duplicate label**: POST label already on issue → verify idempotent (no error, no duplicate).
50. **Add nonexistent label**: POST label name that doesn't exist in repo → verify `404`.
51. **Remove label from issue**: DELETE label by name → verify `204`.
52. **Remove label not on issue**: DELETE label not attached → verify `404` or idempotent `204`.
53. **List issue labels**: GET → verify array of label objects.
54. **Add dependency**: POST dependency → verify `200/201`.
55. **Add self-dependency**: POST issue depends on itself → verify rejection (non-2xx).
56. **List dependencies**: GET → verify `dependencies` and `dependents` arrays.
57. **Remove dependency**: DELETE → verify `200/204`.
58. **Add reaction**: POST reaction → verify `201`.
59. **Pin issue**: PUT pin → verify `200`.
60. **Lock issue**: PUT lock with reason → verify `200`.
61. **Comment on locked issue as non-admin**: POST comment → verify `403`.
62. **Comment on locked issue as admin**: POST comment → verify `201`.

### CLI E2E Tests

63. **`issue view` displays issue**: Create issue via API, run `codeplane issue view <N> --json` → verify JSON matches API response.
64. **`issue view` text output**: Run without `--json` → verify human-readable output includes title, state, author, body.
65. **`issue view` nonexistent issue**: Run `codeplane issue view 99999` → verify non-zero exit code, error message.
66. **`issue close` closes issue**: Run `codeplane issue close <N> --json` → verify `state: "closed"`.
67. **`issue close` with comment**: Run `codeplane issue close <N> --comment "Resolved"` → verify issue closed AND comment created.
68. **`issue reopen` reopens issue**: Close then run `codeplane issue reopen <N> --json` → verify `state: "open"`.
69. **`issue edit` updates title**: Run `codeplane issue edit <N> --title "New title" --json` → verify title changed.
70. **`issue edit` adds label**: Run `codeplane issue edit <N> --add-label "bug" --json` → verify label present.
71. **`issue edit` adds assignee**: Run `codeplane issue edit <N> --add-assignee <user> --json` → verify assignee present.
72. **`issue comment` adds comment**: Run `codeplane issue comment <N> --body "CLI comment" --json` → verify comment created.
73. **`issue react` adds reaction**: Run `codeplane issue react <N> +1` → verify success.
74. **`issue pin` pins issue**: Run `codeplane issue pin <N>` → verify success.
75. **`issue dependency add`**: Run → verify success, `issue dependency list` shows dependency.
76. **`issue dependency remove`**: Run → verify success, `issue dependency list` no longer shows dependency.
77. **`issue dependency add` self-dependency**: Run → verify non-zero exit code, error about self-dependency.

### TUI E2E Tests

78. **Issue detail screen renders**: Navigate to issue from list, verify title, state badge, author, timestamps visible.
79. **Issue detail shows labels**: Issue with labels, verify colored label badges visible.
80. **Issue detail shows assignees**: Issue with assignees, verify username list visible.
81. **Issue detail shows body**: Issue with markdown body, verify body rendered.
82. **Issue detail shows empty body**: Issue with empty body, verify "No description provided" placeholder.
83. **Issue detail shows comments**: Issue with comments, verify chronological comment list.
84. **Issue detail shows zero comments**: Issue with no comments, verify "No comments yet" message.
85. **Issue detail comment creation**: Press `c`, type comment, `Ctrl+S` → verify comment appears optimistically.
86. **Issue detail close/reopen**: Press `o` → verify state badge toggles.
87. **Issue detail navigation**: Press `n`/`p` → verify focus moves between comments.
88. **Issue detail scroll**: Press `j`/`k` → verify content scrolls.
89. **Issue detail `q` pops screen**: Press `q` → verify returns to issue list.
90. **Issue detail responsive layout (80×24)**: Resize terminal → verify compact layout.
91. **Issue detail responsive layout (120×40)**: Verify standard layout.
92. **Issue detail dependencies section**: Issue with dependencies → verify "Depends on" and "Blocks" displayed.
93. **Issue detail error state**: Disconnect network, navigate to issue → verify error message with retry hint.
94. **Issue detail retry**: Press `R` on error → verify re-fetch attempted.

### Web UI / Playwright E2E Tests

95. **Issue detail page loads**: Navigate to `/:owner/:repo/issues/:number` → verify page renders with title, state, body.
96. **Issue detail shows metadata sidebar**: Verify labels, assignees, milestone displayed.
97. **Issue detail shows comment timeline**: Verify comments render with author, timestamp, body.
98. **Issue detail close button**: Click "Close issue" → verify state changes to closed.
99. **Issue detail reopen button**: On closed issue, click "Reopen" → verify state changes to open.
100. **Issue detail add comment**: Type in comment box, submit → verify comment appears in timeline.
101. **Issue detail edit title inline**: Click title, edit, save → verify title updates.
102. **Issue detail label management**: Add/remove label via sidebar picker → verify labels update.
103. **Issue detail assignee management**: Add/remove assignee via sidebar picker → verify assignees update.
104. **Issue detail comment anchor linking**: Navigate to `#comment-<id>` → verify page scrolls to specific comment.
105. **Issue detail markdown rendering**: Create issue with code blocks, links, images, tables → verify proper rendering.
106. **Issue detail unauthenticated view (public repo)**: Visit without auth → verify read-only view, no edit controls.
107. **Issue detail private repo redirect**: Visit private repo issue without auth → verify redirect to login.
108. **Issue detail 404 page**: Navigate to nonexistent issue number → verify 404 page displays.

### Cross-Client Consistency Tests

109. **API and CLI consistency**: Create issue via API, view via CLI → verify all fields match.
110. **CLI and API consistency**: Create issue via CLI, view via API → verify all fields match.
111. **Edit via CLI, verify via API**: Edit issue fields via CLI, fetch via API → verify changes reflected.
112. **Comment via API, list via CLI**: Create comment via API, list via CLI → verify comment present.
113. **State change via CLI, verify via API**: Close via CLI, GET via API → verify `state: "closed"` and `closed_at` set.

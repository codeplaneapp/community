# JJ_BOOKMARK_DETAIL_UI

Specification for JJ_BOOKMARK_DETAIL_UI.

## High-Level User POV

When a developer clicks on a bookmark in the bookmark list—whether from the web UI, TUI, CLI, or an editor integration—they need a dedicated detail view that tells them everything about that bookmark at a glance: what change it currently points to, who authored that change, when it last moved, whether it tracks a remote, whether it is the default bookmark, whether it is protected, and what recent activity has happened on it.

Today, clicking a bookmark in the list jumps directly to the target change detail view. This is useful when the user already knows which bookmark they care about, but it skips critical contextual information. The bookmark detail view fills that gap by presenting the bookmark itself as a first-class navigable entity. From this view, a user can see the bookmark's metadata and protection status, inspect the target change summary and its diff stats, browse recent changes that have landed on this bookmark, see open landing requests targeting it, and then navigate deeper into the change detail, diff view, or landing request detail as needed.

This feature matters because bookmarks are the primary navigation anchors in a jj-native workflow. The default bookmark ("main") is the landing target for most landing requests. Feature bookmarks represent in-flight work. Understanding a bookmark's state—its tip change, recent history, protection rules, and associated landing requests—is fundamental to repository navigation and code review. Without a dedicated detail view, users must mentally stitch together information from multiple screens, losing context and slowing down.

The bookmark detail view is available across web, TUI, CLI, and editor surfaces. The web and TUI versions are rich interactive screens with tabbed navigation. The CLI provides a `bookmark show` command that outputs the same data in human-readable and JSON formats. Editor integrations surface bookmark detail in webviews or split panes. All clients consume the same API endpoint and present a consistent view of the bookmark.

## Acceptance Criteria

## Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/bookmarks/:name` returns a detailed view of a single bookmark, including its target change metadata, protection status, and associated context
- [ ] The web UI renders a dedicated bookmark detail page at `/:owner/:repo/bookmarks/:name` with header, metadata, tabs, and actions
- [ ] The TUI renders a bookmark detail screen pushed from the bookmarks list on `Enter`, with header, metadata, and tab navigation
- [ ] The CLI command `codeplane bookmark show <name>` returns bookmark detail in human-readable and JSON formats
- [ ] The VS Code extension opens a bookmark detail webview when a bookmark tree item is expanded or activated
- [ ] The Neovim plugin provides `:Codeplane bookmark <name>` to display bookmark detail in a split buffer
- [ ] All clients agree on the same bookmark detail response shape and field semantics
- [ ] The API aggregates bookmark metadata, target change summary, protection status, recent change history, and open landing request count in a single response
- [ ] Navigation from bookmark detail to change detail, diff view, and landing request list is seamless across all interactive clients

## Boundary Constraints

- Bookmark name: maximum 200 characters
- Bookmark name character set: alphanumeric, hyphens (`-`), underscores (`_`), slashes (`/`), and dots (`.`). Regex: `/^[a-zA-Z0-9._\/-]+$/`
- Bookmark name must not be empty or consist solely of whitespace
- Bookmark name must not start or end with a slash, dot, or hyphen
- Bookmark name must not contain consecutive slashes (`//`) or consecutive dots (`..`)
- Bookmark names containing URL-unsafe characters (e.g., `%`, `#`, `?`) are rejected with 400
- The `:name` path parameter must be URL-decoded before lookup; names with slashes (e.g., `feature/auth`) must be transmitted URL-encoded in the path
- Change ID format: hexadecimal string (jj change IDs)
- Commit ID format: 40-character hexadecimal SHA
- Short display form for change ID and commit ID: 12 characters
- Recent changes history: default 10, maximum 50
- Open landing requests targeting this bookmark: default 10, maximum 50
- Bookmark detail response must complete within 5 seconds end-to-end or return a partial response with degraded sections
- Target change description: maximum 100,000 characters for rendering; truncated with notice if exceeded

## Edge Cases

- Bookmark exists but the target change has been rewritten or abandoned: display bookmark metadata with a "target change unavailable" notice instead of an error
- Bookmark exists but the repository is empty (only root change): display bookmark metadata with empty change history
- Bookmark name at exactly 200 characters: accepted and displayed correctly
- Bookmark name at 201 characters: returns 400 from the API
- Bookmark name is the default bookmark: `is_default` is `true`, delete action is disabled with tooltip explanation
- Bookmark name matches a protected bookmark pattern: `is_protected` is `true`, protection rule summary is displayed
- Bookmark name does not exist in the repository: returns 404
- Bookmark name contains slashes (e.g., `feature/deep/nested/path`): handled correctly via URL encoding
- Bookmark name with a single character (`a`): accepted
- Bookmark with zero recent changes (just created with no history beyond tip): shows empty recent history section
- Bookmark with zero open landing requests targeting it: shows "No open landing requests" in that section
- Repository does not exist: returns 404
- Private repository accessed without auth: returns 404 (not 403, to avoid leaking existence)
- Bookmark target change has conflicts: conflict indicator is displayed prominently
- Bookmark target change is empty (no file changes): "Empty change" indicator is shown
- Network timeout fetching jj subprocess data: returns 504 with a clear message; clients show retry option
- Concurrent bookmark deletion while detail is open: next refresh or navigation shows 404 with "Bookmark was deleted" message

## Design

## API Shape

### Get Bookmark Detail

```
GET /api/repos/:owner/:repo/bookmarks/:name
```

Query parameters:
- `recent_changes_limit` (integer, optional): number of recent changes to include. Default: 10. Maximum: 50.
- `landing_requests_limit` (integer, optional): number of open landing requests targeting this bookmark. Default: 10. Maximum: 50.

Response `200 OK`:
```json
{
  "bookmark": {
    "name": "main",
    "target_change_id": "ksxypqvmruwn",
    "target_commit_id": "abc12345def067890123456789abcdef01234567",
    "is_tracking_remote": true,
    "is_default": true,
    "is_protected": true,
    "protection_rules": {
      "require_review": true,
      "required_approvals": 2,
      "required_checks": ["ci/build", "ci/test"],
      "require_status_checks": true,
      "dismiss_stale_reviews": true
    }
  },
  "target_change": {
    "change_id": "ksxypqvmruwn",
    "commit_id": "abc12345def067890123456789abcdef01234567",
    "description": "feat: add user authentication flow",
    "author_name": "Alice",
    "author_email": "alice@example.com",
    "timestamp": "2026-03-20T14:30:00Z",
    "has_conflict": false,
    "is_empty": false,
    "parent_change_ids": ["lmnoabcd1234"],
    "diff_stats": {
      "files_changed": 5,
      "additions": 142,
      "deletions": 31
    }
  },
  "recent_changes": [
    {
      "change_id": "ksxypqvmruwn",
      "commit_id": "abc12345def067890123456789abcdef01234567",
      "description": "feat: add user authentication flow",
      "author_name": "Alice",
      "author_email": "alice@example.com",
      "timestamp": "2026-03-20T14:30:00Z",
      "has_conflict": false,
      "is_empty": false
    }
  ],
  "open_landing_requests": {
    "count": 3,
    "items": [
      {
        "number": 42,
        "title": "Add OAuth2 support",
        "state": "open",
        "author": "bob",
        "change_count": 2,
        "created_at": "2026-03-19T10:00:00Z"
      }
    ]
  }
}
```

When the target change cannot be resolved (e.g., rewritten/abandoned):
```json
{
  "bookmark": { "..." },
  "target_change": null,
  "target_change_unavailable_reason": "Change has been rewritten or is no longer accessible",
  "recent_changes": [],
  "open_landing_requests": { "count": 0, "items": [] }
}
```

Error responses:
- `400 Bad Request`: invalid bookmark name (empty, exceeds 200 chars, disallowed characters)
- `401 Unauthorized`: authentication required for private repository
- `404 Not Found`: repository or bookmark does not exist (or private and caller is unauthenticated)
- `429 Too Many Requests`: rate limited, includes `Retry-After` header
- `500 Internal Server Error`: unexpected server failure
- `504 Gateway Timeout`: jj subprocess timed out

## SDK Shape

The `RepoHostService` in `@codeplane/sdk` provides:

```typescript
interface BookmarkDetail {
  bookmark: {
    name: string;
    target_change_id: string;
    target_commit_id: string;
    is_tracking_remote: boolean;
    is_default: boolean;
    is_protected: boolean;
    protection_rules: ProtectionRules | null;
  };
  target_change: Change | null;
  target_change_unavailable_reason?: string;
  recent_changes: Change[];
  open_landing_requests: {
    count: number;
    items: LandingRequestSummary[];
  };
}

interface ProtectionRules {
  require_review: boolean;
  required_approvals: number;
  required_checks: string[];
  require_status_checks: boolean;
  dismiss_stale_reviews: boolean;
}

interface LandingRequestSummary {
  number: number;
  title: string;
  state: string;
  author: string;
  change_count: number;
  created_at: string;
}

getBookmarkDetail(
  owner: string,
  repo: string,
  name: string,
  options?: { recentChangesLimit?: number; landingRequestsLimit?: number }
): Promise<Result<BookmarkDetail, APIError>>
```

## Web UI Design

The bookmark detail page lives at `/:owner/:repo/bookmarks/:name` within the repository workbench layout.

### Header
- Bookmark name displayed as a large heading with a monospace font
- Badges inline after the name: `Default` (primary blue), `Protected` (warning amber), `Tracking` (cyan), `Local only` (muted gray)
- Below the name: target change ID (short 12-char, monospace, clickable link to change detail) and commit ID (short 12-char, monospace, copy-on-click with tooltip confirmation)

### Actions Bar
Visible to users with write access:
- "View diff" button → navigates to the diff view for the target change
- "Browse files" button → navigates to the code explorer at this bookmark's tip
- "New landing request" button → opens landing request creation with this bookmark pre-filled as the target
- "Delete" button (destructive, red outline) → confirmation modal; disabled with tooltip for default bookmarks ("Cannot delete the default bookmark") and protected bookmarks for non-admin users ("Only admins can delete protected bookmarks")
- Overflow menu (⋯): "Copy name", "Copy change ID", "Copy commit ID"

### Tabs

**1. Overview (default tab)**
- Target Change Card: description rendered as markdown, author avatar + name, relative timestamp with full timestamp on hover, diff stats bar (files changed, +additions in green, -deletions in red), conflict indicator (⚠️ with "Has conflicts" label), empty change indicator ("Empty change — no file modifications")
- Protection Rules Card (only if `is_protected` is true): summary of rules (require review, N approvals needed, required checks listed as chips, dismiss stale reviews)
- Bookmark Properties: tracking status, creation context, parent change IDs

**2. Recent Changes**
- Scrollable list of recent changes with: change ID (monospace, clickable), first line of description, author name, relative timestamp, conflict indicator badge
- "Load more" pagination button at bottom if more changes are available (requesting next batch with increased limit)
- Empty state: illustration + "No recent changes on this bookmark"

**3. Landing Requests**
- Open landing requests targeting this bookmark. Each row shows: LR number (clickable link), title, state badge (open/reviewing/approved), author, change count, relative timestamp
- Empty state: illustration + "No open landing requests targeting this bookmark"
- Footer link: "View all landing requests →" navigates to the repository landing request list filtered by target bookmark

### Loading States
- Full-page skeleton loader matching the header + tabs layout
- Individual section skeletons within tabs for partial loading

### Error States
- Centered error card with message and "Retry" button
- 404: "Bookmark not found" with back link to bookmarks list
- Target change unavailable: amber warning banner at the top of the Overview tab: "The target change for this bookmark is no longer accessible. It may have been rewritten or abandoned."

### Responsive Behavior
- <768px: tabs stack vertically, actions collapse to a single dropdown menu, badges wrap below the heading, change IDs truncate to 8 characters
- 768px–1280px: full layout, tabs horizontal, all actions visible
- >1280px: sidebar with bookmark properties card, main area for tabs

## CLI Command

```
codeplane bookmark show <name> [--repo OWNER/REPO] [--json] [--recent-changes N] [--landing-requests N]
```

### Human-Readable Output
```
Bookmark: main
Status:   ★ Default · 🛡 Protected · Tracking remote

Target Change
  Change ID:   ksxypqvmruwn
  Commit ID:   abc12345def0
  Description: feat: add user authentication flow
  Author:      Alice <alice@example.com>
  Date:        2026-03-20 14:30:00 UTC
  Stats:       5 files changed, +142, -31
  Conflicts:   None

Protection Rules
  Require review:       Yes (2 approvals)
  Required checks:      ci/build, ci/test
  Dismiss stale reviews: Yes

Recent Changes (3)
  CHANGE ID     DESCRIPTION                          AUTHOR   DATE
  ksxypqvmruwn  feat: add user authentication flow   Alice    2026-03-20
  lmnoabcd1234  refactor: extract auth middleware     Alice    2026-03-19
  pqrsefgh5678  fix: handle expired tokens            Bob      2026-03-18

Open Landing Requests (2)
  #42  Add OAuth2 support       bob   2 changes  2026-03-19
  #38  Fix token refresh flow   alice 1 change   2026-03-17
```

### JSON Output
Returns the full `BookmarkDetail` response object as received from the API.

### Exit Codes
- `0`: success
- `1`: error (bookmark not found, repo not found, auth failure, network failure)

### Flags
- `--repo OWNER/REPO`: use API mode to fetch from a remote Codeplane instance instead of local jj
- `--json`: output raw JSON instead of human-readable format
- `--recent-changes N`: limit recent changes (default 10, max 50)
- `--landing-requests N`: limit landing request items (default 10, max 50)

## TUI UI

Pushed from bookmarks list on `Enter`. Breadcrumb: `… > Bookmarks > name`.

### Header
- Name (bold, monospace) + badge row (Default, Protected, Tracking/Local) + metadata row (change ID, commit ID, tracking status)

### Tab Bar
- Overview (1), Changes (2), Landings (3)
- Navigation: `Tab`/`Shift+Tab` cycles, `1`/`2`/`3` direct jump, `h`/`l` moves to adjacent tab without wrapping

### Overview Tab
- Target change card: description (first 5 lines), author, timestamp, diff stats, conflict/empty indicators
- Protection rules section (if protected)
- Bookmark properties

### Changes Tab
- Recent changes list with change ID, description, author, timestamp
- `j`/`k` navigates list, `Enter` opens change detail, `d` opens diff for highlighted change

### Landings Tab
- Open landing requests list with number, title, state, author, change count
- `j`/`k` navigates, `Enter` opens landing detail

### Actions
- `v`: open diff for target change
- `f`: browse files at bookmark tip
- `c`: copy bookmark name to clipboard; "Copied!" flash for 2 seconds
- `x`: delete bookmark (confirmation prompt; blocked with status flash for default/protected)
- `q`: pop back to bookmarks list
- `R`: retry on error
- `?`: show keyboard help overlay

### Responsive Layout
- 80×24: abbreviated tab labels ("Ovw", "Chg", "LR"), collapsed metadata, truncated descriptions
- 120×40: full layout with all fields
- 200×60+: expanded padding, full timestamps, wider description columns

## VS Code Extension

Clicking a bookmark tree item opens a Bookmark Detail webview panel with:
- Metadata section: name, badges, change ID, commit ID
- Target change card: description, author, timestamp, diff stats
- Protection rules summary (if protected)
- Recent changes list (first 10)
- Landing request count with link to view in browser

Quick links:
- "Open Diff" → opens the target change diff in a VS Code diff editor
- "Browse Files" → opens the file explorer webview at the bookmark's tip
- "View Landing Requests" → opens the landing requests view filtered by this bookmark

Context menu on bookmark tree item: "Show Detail", "Copy Change ID", "Open in Browser"

## Neovim Plugin

`:Codeplane bookmark <name>` opens detail in a split buffer with structured sections:
- Bookmark metadata
- Target change summary
- Protection rules (if applicable)
- Recent changes table
- Landing request count

`:Codeplane bookmark` (no name) opens Telescope picker to select a bookmark, then shows detail.

Buffer keymaps:
- `<CR>` on a change ID line navigates to change detail
- `<C-d>` opens diff for the target change
- `<C-y>` copies bookmark name to system clipboard
- `q` closes the buffer

## Documentation

- **CLI reference**: `codeplane bookmark show` — full usage, all flags, example human-readable output, example JSON output, error messages, and exit codes
- **API reference**: `GET /api/repos/:owner/:repo/bookmarks/:name` — full request/response schema, URL encoding notes for bookmark names containing slashes, all error codes with example bodies, query parameter documentation
- **Web UI guide**: Bookmark detail page — overview of tabs, actions, permissions, responsive behavior, screenshots of each tab
- **TUI guide**: Bookmark detail screen — all keyboard shortcuts, tab navigation, responsive layout behavior
- **Concepts guide update**: Expand "What are jj bookmarks" to cover the detail view, explain the relationship between bookmarks and landing requests, explain protection rules and the default bookmark concept

## Permissions & Security

## Authorization Roles

| Action | Anonymous | Read-only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View bookmark detail (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View bookmark detail (private repo) | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| View protection rules | ❌ (404 for private) | ✅ | ✅ | ✅ | ✅ |
| View open landing requests | Same as detail | ✅ | ✅ | ✅ | ✅ |
| Copy bookmark name/IDs | Same as detail | ✅ | ✅ | ✅ | ✅ |
| Navigate to diff from detail | Same as detail | ✅ | ✅ | ✅ | ✅ |
| Delete bookmark from detail | ❌ | ❌ | ✅ (non-default, non-protected) | ✅ (non-default) | ✅ (non-default) |
| Delete protected bookmark from detail | ❌ | ❌ | ❌ | ✅ (non-default) | ✅ (non-default) |
| Delete default bookmark from detail | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create landing request from detail | ❌ | ❌ | ✅ | ✅ | ✅ |

## Rate Limiting

- Authenticated users: 5,000 requests per hour (shared across all API endpoints)
- Unauthenticated users: 60 requests per hour per IP
- `GET /api/repos/:owner/:repo/bookmarks/:name`: standard read rate limit
- Delete actions from the detail view: subject to mutation burst limits (30 per minute per user)
- 429 responses include `Retry-After` header with seconds until retry is allowed
- No automatic client-side retry on 429; user must manually retry or wait

## Data Privacy

- Bookmark names, change IDs, and commit IDs are not PII
- Author names and email addresses in the target change and recent changes come from jj commit metadata; these may contain real names and are treated as part of the repository's public commit record for public repos
- Private repository bookmark details must not be exposed to unauthenticated or unauthorized users (404, not 403, to avoid existence leakage)
- Auth tokens are never logged, displayed in error messages, or included in telemetry events
- Protection rule details (check names, team names) are visible to anyone with read access to the repository; this is intentional as protection rules are part of the repository's collaboration policy
- The bookmark detail endpoint must verify repository access before performing any jj subprocess operations to prevent unauthorized side-channel access to repository data

## Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `bookmark.detail.viewed` | Bookmark detail successfully loaded | `repo_full_name`, `bookmark_name`, `is_default`, `is_protected`, `is_tracking`, `target_change_available`, `recent_changes_count`, `open_lr_count`, `client` (api/cli/tui/web/vscode/nvim), `load_time_ms` |
| `bookmark.detail.tab_changed` | User switches tab in detail view | `repo_full_name`, `bookmark_name`, `from_tab`, `to_tab`, `client` |
| `bookmark.detail.change_navigated` | User navigates to a change from detail | `repo_full_name`, `bookmark_name`, `change_id`, `navigation_source` (target_card/recent_list), `client` |
| `bookmark.detail.diff_opened` | User opens diff from bookmark detail | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.detail.files_browsed` | User opens file explorer from detail | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.detail.landing_navigated` | User navigates to a landing request from detail | `repo_full_name`, `bookmark_name`, `landing_number`, `client` |
| `bookmark.detail.deleted` | User deletes bookmark from detail view | `repo_full_name`, `bookmark_name`, `was_protected`, `client` |
| `bookmark.detail.name_copied` | User copies bookmark name | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.detail.id_copied` | User copies change ID or commit ID | `repo_full_name`, `bookmark_name`, `id_type` (change/commit), `client` |
| `bookmark.detail.lr_created` | User starts landing request creation from detail | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.detail.error` | Detail request fails | `repo_full_name`, `bookmark_name`, `error_type`, `http_status`, `client` |
| `bookmark.detail.not_found` | Bookmark does not exist (404) | `repo_full_name`, `bookmark_name_attempted`, `client` |
| `bookmark.detail.target_unavailable` | Target change was unavailable | `repo_full_name`, `bookmark_name`, `unavailable_reason`, `client` |

## Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Detail view load success rate | >98% | Percentage of detail requests returning 200 |
| Time to first meaningful paint (p50) | <600ms | From request initiation to header + overview tab rendered |
| Detail-to-change navigation rate | >50% | Percentage of detail views where user navigates to a change |
| Detail-to-diff rate | >30% | Percentage of detail views where user opens a diff |
| Detail-to-landing rate | >15% | Percentage of detail views where user navigates to a landing request |
| Tab engagement depth | >1.5 tabs/session | Average number of distinct tabs viewed per session |
| Bookmark deletion from detail | Track | How often deletion is initiated from detail vs. list |
| Return-to-detail rate | Track | How often users return to the same bookmark detail within a session |
| Error rate | <2% | Percentage of detail loads resulting in error |
| Target unavailable rate | Track | Percentage of detail loads where the target change is unavailable |
| CLI `bookmark show` adoption | Track | Percentage of CLI bookmark commands using `show` vs. `list` |
| Cross-client coverage | Track | Distribution of detail views across web, TUI, CLI, VS Code, Neovim |

## Observability

## Logging

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `info` | Bookmark detail loaded successfully | `repo_owner`, `repo_name`, `bookmark_name`, `is_default`, `is_protected`, `target_change_available`, `recent_changes_count`, `open_lr_count`, `load_time_ms` |
| `info` | Bookmark deleted from detail view | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `was_protected` |
| `warn` | Bookmark detail request failed | `repo_owner`, `repo_name`, `bookmark_name`, `http_status`, `error_message` (no tokens/secrets) |
| `warn` | Target change unavailable for bookmark | `repo_owner`, `repo_name`, `bookmark_name`, `unavailable_reason` |
| `warn` | Rate limited on bookmark detail endpoint | `repo_owner`, `repo_name`, `retry_after_seconds`, `client_ip` (hashed) |
| `warn` | Unauthorized access attempt to private repo bookmark detail | `repo_owner`, `repo_name`, `bookmark_name`, `client_ip` (hashed) |
| `warn` | jj subprocess failed during bookmark detail | `repo_owner`, `repo_name`, `bookmark_name`, `jj_command`, `exit_code`, `stderr` (truncated to 500 chars), `duration_ms` |
| `warn` | jj subprocess timed out during bookmark detail | `repo_owner`, `repo_name`, `bookmark_name`, `jj_command`, `timeout_ms` |
| `error` | Unexpected error in bookmark detail handler | `repo_owner`, `repo_name`, `bookmark_name`, `error_type`, `stack_trace` |
| `debug` | Bookmark detail query parameters parsed | `bookmark_name`, `recent_changes_limit`, `landing_requests_limit` |
| `debug` | jj CLI command executed for bookmark detail | `repo_path`, `args` (sanitized), `exit_code`, `duration_ms` |
| `debug` | Protection rules resolved for bookmark | `repo_owner`, `repo_name`, `bookmark_name`, `pattern_matched`, `rules_count` |
| `debug` | Landing requests query for bookmark detail | `repo_owner`, `repo_name`, `bookmark_name`, `query_duration_ms`, `result_count` |

All logs must use structured JSON format. Sensitive data (tokens, full file paths with user directories) must never appear in log output.

## Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_bookmark_detail_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark detail requests |
| `codeplane_bookmark_detail_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_bookmark_detail_target_unavailable_total` | Counter | `owner`, `repo` | Count of requests where target change was unavailable |
| `codeplane_bookmark_detail_errors_total` | Counter | `owner`, `repo`, `error_type` | Errors by type (auth, not_found, rate_limit, jj_failure, timeout, internal) |
| `codeplane_bookmark_detail_jj_subprocess_duration_seconds` | Histogram | `command` | jj subprocess execution time for bookmark detail (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_bookmark_detail_jj_subprocess_failures_total` | Counter | `command`, `exit_code` | jj subprocess failures during bookmark detail |
| `codeplane_bookmark_detail_landing_query_duration_seconds` | Histogram | `owner`, `repo` | Time to query landing requests targeting the bookmark |
| `codeplane_bookmark_detail_recent_changes_count` | Histogram | `owner`, `repo` | Number of recent changes returned (buckets: 0, 1, 5, 10, 25, 50) |
| `codeplane_bookmark_delete_from_detail_total` | Counter | `owner`, `repo`, `result` | Deletions initiated from detail view (success/failure/rejected) |

## Alerts

### Alert: BookmarkDetailHighErrorRate
- **Condition**: `rate(codeplane_bookmark_detail_errors_total{error_type!="not_found"}[5m]) / rate(codeplane_bookmark_detail_requests_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_bookmark_detail_errors_total` by `error_type` to identify the dominant failure mode
  2. If `jj_failure`: check `codeplane_bookmark_detail_jj_subprocess_failures_total` for exit codes; inspect jj binary availability and repo disk state; check if repos have been corrupted or moved
  3. If `timeout`: check `codeplane_bookmark_detail_jj_subprocess_duration_seconds` p99; large repos may need jj command optimization or timeout increase
  4. If `internal`: check application error logs for stack traces; look for OOM or DB connection issues
  5. If `auth`: check auth middleware logs; verify session/token infrastructure is healthy

### Alert: BookmarkDetailHighLatency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_bookmark_detail_duration_seconds_bucket[5m])) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_bookmark_detail_jj_subprocess_duration_seconds` p95 — if high, jj subprocess calls are slow
  2. Check `codeplane_bookmark_detail_landing_query_duration_seconds` p95 — if high, DB queries for landing requests are slow
  3. Check system resource usage (CPU, memory, disk I/O) on the server
  4. Check if a specific repo is dominating slow requests (filter by `owner`/`repo` labels)
  5. Consider if `recent_changes_limit` or `landing_requests_limit` is being set to maximum (50) by many clients

### Alert: BookmarkDetailJJSubprocessTimeout
- **Condition**: `rate(codeplane_bookmark_detail_jj_subprocess_failures_total{exit_code="timeout"}[5m]) > 0.5`
- **Severity**: Critical
- **Runbook**:
  1. Identify the affected repos from structured logs (`jj_command`, `repo_path`)
  2. SSH into the server and manually run `jj log` on the affected repo to verify jj is responsive
  3. Check disk I/O and available disk space — jj operations can stall on full/slow disks
  4. If a single large repo is the cause, consider increasing the per-request timeout or optimizing the jj template query
  5. Verify jj binary version; ensure it's not a known regression

### Alert: BookmarkDetailTargetUnavailableSpike
- **Condition**: `rate(codeplane_bookmark_detail_target_unavailable_total[15m]) / rate(codeplane_bookmark_detail_requests_total[15m]) > 0.1`
- **Severity**: Info
- **Runbook**:
  1. This may indicate repos are undergoing heavy rewriting or squashing activity
  2. Check which repos are contributing (from structured logs)
  3. Verify that `jj git import` is running correctly after git pushes
  4. No immediate action needed unless correlated with user complaints

## Error Cases and Failure Modes

| Error | HTTP Status | Client Behavior | Recovery |
|-------|-------------|-----------------|----------|
| Bookmark name empty or invalid chars | 400 | Show validation error inline | User corrects input |
| Bookmark not found | 404 | Show "Bookmark not found" with back link | User navigates to bookmark list |
| Repository not found | 404 | Show "Repository not found" | User checks URL |
| Private repo, no auth | 404 | Show "Not found" (no existence leak) | User authenticates |
| Auth required (401) | 401 | Redirect to login | User logs in |
| Rate limited | 429 | Show retry timer | User waits |
| jj subprocess failure | 500 | Show "Error loading bookmark" with retry | User retries; engineer checks jj health |
| jj subprocess timeout | 504 | Show "Request timed out" with retry | User retries; engineer checks repo size |
| DB connection failure | 500 | Show "Error loading bookmark" with retry | Engineer checks DB connectivity |
| Partial data (jj OK, landing query fails) | 200 (degraded) | Show bookmark data with inline warning on landing section | User retries or ignores |

## Verification

## API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/bookmarks/:name` returns 200 with correct BookmarkDetail shape for an existing bookmark
- [ ] Response includes `bookmark.name`, `bookmark.target_change_id`, `bookmark.target_commit_id`, `bookmark.is_tracking_remote`, `bookmark.is_default`, `bookmark.is_protected`
- [ ] Response includes `target_change` with `change_id`, `commit_id`, `description`, `author_name`, `author_email`, `timestamp`, `has_conflict`, `is_empty`, `parent_change_ids`, `diff_stats`
- [ ] Response includes `recent_changes` as an array of Change objects
- [ ] Response includes `open_landing_requests` with `count` and `items` array
- [ ] `GET` for the default bookmark returns `is_default: true`
- [ ] `GET` for a non-default bookmark returns `is_default: false`
- [ ] `GET` for a protected bookmark returns `is_protected: true` and `protection_rules` object with all fields populated
- [ ] `GET` for a non-protected bookmark returns `is_protected: false` and `protection_rules: null`
- [ ] `GET` for a tracking bookmark returns `is_tracking_remote: true`
- [ ] `GET` for a local-only bookmark returns `is_tracking_remote: false`
- [ ] `GET` with `recent_changes_limit=5` returns at most 5 recent changes
- [ ] `GET` with `recent_changes_limit=50` (max) returns at most 50 recent changes
- [ ] `GET` with `recent_changes_limit=51` clamps to 50
- [ ] `GET` with `recent_changes_limit=0` returns 400
- [ ] `GET` with `recent_changes_limit=-1` returns 400
- [ ] `GET` with `recent_changes_limit=abc` returns 400
- [ ] `GET` with `landing_requests_limit=5` returns at most 5 landing request items
- [ ] `GET` with `landing_requests_limit=50` (max) returns at most 50 landing request items
- [ ] `GET` with `landing_requests_limit=51` clamps to 50
- [ ] `GET` with `landing_requests_limit=0` returns 400
- [ ] `GET` with default parameters (no query string) returns default limits (10 recent changes, 10 landing requests)
- [ ] `GET` for a bookmark whose target change has been rewritten returns `target_change: null` and `target_change_unavailable_reason` string
- [ ] `GET` for a bookmark in a repo with no change history returns `recent_changes: []`
- [ ] `GET` for a bookmark with no open landing requests targeting it returns `open_landing_requests: { count: 0, items: [] }`
- [ ] `GET` for a bookmark with 3 open landing requests targeting it returns `count: 3` and up to `landing_requests_limit` items
- [ ] `GET` for a bookmark name with slashes (`feature/auth`) via URL encoding returns 200
- [ ] `GET` for a bookmark name with dots (`v1.2.3`) returns 200
- [ ] `GET` for a bookmark name at exactly 200 characters returns 200
- [ ] `GET` for a bookmark name at 201 characters returns 400
- [ ] `GET` for a bookmark name with disallowed characters (`feature#1`) returns 400
- [ ] `GET` for a bookmark name that is empty returns 400
- [ ] `GET` for a bookmark name with consecutive slashes (`feature//auth`) returns 400
- [ ] `GET` for a bookmark name with consecutive dots (`v1..2`) returns 400
- [ ] `GET` for a bookmark name starting with a hyphen (`-feature`) returns 400
- [ ] `GET` for a bookmark name ending with a dot (`feature.`) returns 400
- [ ] `GET` for a single-character bookmark name (`a`) returns 200
- [ ] `GET` for a non-existent bookmark returns 404
- [ ] `GET` for a non-existent repository returns 404
- [ ] `GET` for a private repo without authentication returns 404
- [ ] `GET` for a private repo with read access returns 200
- [ ] `GET` for a public repo without authentication returns 200
- [ ] `GET` for a public repo with authentication returns 200
- [ ] Response includes correct `diff_stats` (files_changed, additions, deletions) for the target change
- [ ] Response `target_change.timestamp` is a valid ISO 8601 string
- [ ] Response `open_landing_requests.items[].created_at` is a valid ISO 8601 string
- [ ] Rate-limited request returns 429 with `Retry-After` header
- [ ] Content-type of response is `application/json`

## CLI Integration Tests

- [ ] `codeplane bookmark show main` returns human-readable output with bookmark name, default/protected status, target change info
- [ ] `codeplane bookmark show main --json` returns valid JSON matching BookmarkDetail schema
- [ ] `codeplane bookmark show main --repo owner/repo` fetches from the API (not local)
- [ ] `codeplane bookmark show main --recent-changes 5` limits recent changes to 5
- [ ] `codeplane bookmark show main --landing-requests 3` limits landing requests to 3
- [ ] `codeplane bookmark show nonexistent` prints "Bookmark 'nonexistent' not found" and exits 1
- [ ] `codeplane bookmark show main` (local, no remote configured) shows local-only bookmark data with appropriate messaging
- [ ] `codeplane bookmark show feature/auth` handles bookmark names with slashes correctly
- [ ] `codeplane bookmark show ""` (empty name) prints error and exits 1
- [ ] Human-readable output includes protection rules when the bookmark is protected
- [ ] Human-readable output shows "Target change unavailable" when the target has been rewritten
- [ ] JSON output includes `target_change: null` and `target_change_unavailable_reason` when applicable
- [ ] Output is properly formatted at terminal widths of 80, 120, and 200 columns

## Web UI E2E Tests (Playwright)

- [ ] Navigate to `/:owner/:repo/bookmarks/:name` and verify the page loads with correct header, badges, and overview tab
- [ ] Default bookmark shows "Default" badge
- [ ] Protected bookmark shows "Protected" badge and protection rules card
- [ ] Tracking bookmark shows "Tracking" badge
- [ ] Non-tracking bookmark shows "Local only" badge
- [ ] Click "View diff" button navigates to the diff view
- [ ] Click "Browse files" button navigates to the code explorer
- [ ] Click target change ID link navigates to change detail
- [ ] Click "Recent Changes" tab shows recent changes list
- [ ] Click a change in the recent changes list navigates to change detail
- [ ] Click "Landing Requests" tab shows open landing requests
- [ ] Click a landing request in the list navigates to landing request detail
- [ ] Copy button copies bookmark name to clipboard (verify via clipboard API)
- [ ] Delete button is visible for users with write access on non-default, non-protected bookmarks
- [ ] Delete button is disabled with tooltip for default bookmarks
- [ ] Delete button is disabled with tooltip for protected bookmarks (for non-admin users)
- [ ] Delete button is not visible for read-only users
- [ ] Clicking delete shows confirmation modal; confirming deletes and redirects to bookmarks list
- [ ] Clicking delete then canceling returns to the detail view unchanged
- [ ] Navigating to a non-existent bookmark shows 404 page with link to bookmarks list
- [ ] Navigating to a bookmark in a non-existent repo shows 404 page
- [ ] Loading state shows skeleton loader
- [ ] Error state shows retry button; clicking retry re-fetches
- [ ] Bookmark name with slashes (`feature/auth`) renders and navigates correctly
- [ ] Overview tab shows target change description as rendered markdown
- [ ] Overview tab shows "No description provided." when target change description is empty
- [ ] Overview tab shows diff stats (files changed, additions, deletions)
- [ ] Overview tab shows conflict indicator when target change has conflicts
- [ ] Overview tab shows warning banner when target change is unavailable
- [ ] Landing requests tab shows "No open landing requests" when count is 0
- [ ] Landing requests tab footer link "View all landing requests →" navigates correctly
- [ ] Page is accessible: headings have correct hierarchy, buttons have accessible labels, badges have aria-labels
- [ ] Page renders correctly on viewport widths of 375px, 768px, 1280px, and 1920px

## TUI Integration Tests

- [ ] Pressing `Enter` on a bookmark in the bookmarks list pushes the bookmark detail screen
- [ ] Breadcrumb shows `… > Bookmarks > bookmark-name`
- [ ] Header displays bookmark name in bold with correct badges
- [ ] Tab bar renders three tabs: Overview, Changes, Landings
- [ ] `1` key activates Overview tab; `2` activates Changes tab; `3` activates Landings tab
- [ ] `Tab`/`Shift+Tab` cycles through tabs
- [ ] `h`/`l` moves to adjacent tabs without wrapping
- [ ] Overview tab shows target change card with all fields
- [ ] Overview tab shows protection rules for protected bookmarks
- [ ] Changes tab shows recent changes list; `j`/`k` navigates; `Enter` opens change detail
- [ ] Landings tab shows open landing requests; `Enter` opens landing detail
- [ ] `v` key opens diff for target change
- [ ] `c` key copies bookmark name; "Copied!" appears for 2 seconds
- [ ] `x` key on a deletable bookmark shows confirmation; `y` confirms deletion and pops to list
- [ ] `x` key on default bookmark shows status bar flash "Cannot delete the default bookmark"
- [ ] `q` key pops back to bookmarks list
- [ ] Loading spinner shows "Loading bookmark…"
- [ ] Error state shows "Press `R` to retry"
- [ ] 404 state shows "Bookmark not found. Press `q` to go back."
- [ ] Layout renders correctly at 80×24 (abbreviated tabs, collapsed metadata)
- [ ] Layout renders correctly at 120×40 (full layout)
- [ ] Layout renders correctly at 200×60 (expanded padding and timestamps)

## Cross-Client Consistency Tests

- [ ] API, CLI (JSON), Web UI, and TUI all display the same bookmark name, change IDs, and commit IDs for the same bookmark
- [ ] Protection status is consistent across all clients for the same bookmark
- [ ] Default bookmark status is consistent across all clients
- [ ] Recent changes count and content are consistent across API and all clients for the same parameters
- [ ] Open landing request count and content are consistent across API and all clients

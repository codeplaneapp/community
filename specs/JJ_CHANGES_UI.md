# JJ_CHANGES_UI

Specification for JJ_CHANGES_UI.

## High-Level User POV

When you open a repository in Codeplane, the changes view is your window into the repository's full history — not as a list of git commits, but as a native jj change log. Every change has a stable change ID that never mutates, even when the underlying commit is rewritten, rebased, or squashed. This is fundamentally different from how git-based forges work, and it's what makes Codeplane a jj-native tool.

From the web UI, you navigate to the "Changes" tab in any repository and see a reverse-chronological list of every change in the repository. Each entry shows the short change ID, the first line of its description, the author, a relative timestamp, and visual indicators for conflicts or empty changes. You can scroll through the list using cursor-based pagination — the list loads smoothly without full-page reloads, fetching the next page as you approach the bottom.

Clicking a change opens its detail view, where you see the full change metadata: the complete change ID, the associated (mutable) commit hash, the full description rendered as markdown, the author with avatar, the timestamp, parent change IDs, and status badges for conflicts and emptiness. Below the metadata, a tabbed interface lets you switch between three views: a file list showing which files the change touched, a rich diff viewer with syntax highlighting and unified/split display modes, and — if the change has conflicts — a dedicated conflicts tab showing which files are conflicted and the conflict type.

The diff viewer is a central piece of the experience. It supports unified and side-by-side split views, syntax highlighting for 30+ languages, a collapsible file sidebar for navigating between changed files, whitespace toggle, hunk collapse/expand, and keyboard-driven navigation. Binary files are clearly marked. Large diffs degrade gracefully with truncation warnings rather than crashing the browser.

From the CLI, you access the same data with `codeplane change list`, `codeplane change show`, `codeplane change diff`, `codeplane change files`, and `codeplane change conflicts`. These commands work both locally (shelling out to jj directly) and remotely (via the Codeplane API when you specify `--repo owner/name`). Output supports both human-readable and `--json` formats.

From the TUI, changes appear as a dedicated tab in the repository screen. You navigate with vim-style keybindings (j/k), press Enter to drill into a change detail screen, press d to jump directly to the diff, and use / to filter changes by ID, description, or author. The TUI diff screen mirrors the web experience with a file sidebar, unified/split views, and keyboard-driven hunk navigation.

From VS Code, a tree view in the sidebar shows the repository's changes, and from Neovim, a Telescope picker and :Codeplane changes command surface the same data. Both editors support jumping from a change directly to its diff or file list.

The changes UI is also deeply integrated with landing requests. When you view a landing request, its "Changes" tab shows the ordered stack of changes with their position in the stack, connected by visual lineage indicators. You can drill into any individual change from a landing request to see its full detail and diff.

This feature is the foundation of Codeplane's jj-native identity. It replaces the "commits" page of traditional forges with something designed from the ground up for jj's stable change ID model, and it works consistently across every product surface.

## Acceptance Criteria

### Definition of Done

- [ ] All six API endpoints return correct data and proper error codes (no more 501 placeholders)
- [ ] Web UI renders the changes list, change detail, change diff, change files, and change conflicts views
- [ ] CLI commands `change list`, `change show`, `change diff`, `change files`, and `change conflicts` work in both local and remote modes
- [ ] TUI changes tab, change detail screen, and diff screen are functional with keyboard navigation
- [ ] VS Code tree view shows repository changes; Neovim Telescope picker and command surface changes
- [ ] Landing request change stack tab displays changes with position-in-stack ordering
- [ ] All cross-surface tests pass with near-100% confidence
- [ ] Documentation covers all surfaces and is published

### Functional Constraints

- [ ] Change IDs are the primary identifier everywhere; commit hashes are displayed secondarily
- [ ] Change IDs are rendered in monospace font in all UI surfaces
- [ ] Conflict status (`has_conflict: true`) is visually distinguished with a warning icon (⚠) and warning color tint
- [ ] Empty changes (`is_empty: true`) are visually distinguished with an empty icon (∅) and dimmed/muted styling
- [ ] A change can be both conflicted and empty simultaneously; both indicators must render
- [ ] Parent change IDs are displayed and navigable (clicking a parent navigates to that change's detail)
- [ ] Change descriptions support full multi-line content; in list views, only the first line is shown
- [ ] Diff viewer supports both unified (default) and split view modes
- [ ] Split view requires ≥120 columns; attempting split below that threshold shows a status flash and stays unified
- [ ] Whitespace toggle re-fetches the diff with `?whitespace=ignore`
- [ ] Binary files show a "[binary]" marker instead of patch content; `patch` field is `null`
- [ ] Renamed/copied files show both `old_path` and `new_path` with a visual indicator (e.g., `old → new`)

### Pagination Constraints

- [ ] Change list uses cursor-based pagination
- [ ] Default page size: 30 items
- [ ] Maximum page size: 100 items
- [ ] `limit` values ≤ 0 return `400 Bad Request` with `"invalid limit value"`
- [ ] `limit` values > 100 are silently clamped to 100
- [ ] Non-numeric `limit` values return `400 Bad Request`
- [ ] Empty cursor string is equivalent to no cursor (start from beginning)
- [ ] `next_cursor` is an empty string `""` when there are no more pages
- [ ] TUI loads next page at 80% scroll depth; max 1,000 changes (20 pages) with cap displayed in footer

### Input Validation and Boundary Constraints

- [ ] `owner` path parameter: required, trimmed, non-empty; missing → `400`
- [ ] `repo` path parameter: required, trimmed, non-empty; missing → `400`
- [ ] `change_id` path parameter: required, trimmed, non-empty; missing → `400`
- [ ] Change IDs are 1–64 lowercase hex characters (validated by jj, not by Codeplane regex)
- [ ] Commit IDs are 40-character hex SHA strings
- [ ] Change descriptions can be up to 64 KB; list views truncate to first line, max 1,000 characters
- [ ] File paths can be up to 4,096 characters
- [ ] Timestamps are ISO 8601 format
- [ ] API returns `404` for non-existent repositories (not `500`)
- [ ] API returns `404` for non-existent change IDs (not `500`)
- [ ] Private repositories return `404` (not `403`) to unauthenticated users to prevent information leakage
- [ ] Special change ID aliases (`@` for working copy, `@-` for parent) are supported by CLI local mode but NOT by the API (API requires resolved change IDs)

### Edge Cases

- [ ] Empty repository (no changes): list endpoint returns `{ items: [], next_cursor: "" }`; UI shows "No changes yet." empty state
- [ ] Change with empty description: renders change ID only in list, shows "(no description)" in detail view
- [ ] Change with no parents (root change): `parent_change_ids` is `[]`; parent navigation is disabled
- [ ] Merge change with multiple parents: all parent IDs shown; navigation available to each
- [ ] Change touching 0 files (empty change): files endpoint returns `[]`; diff returns `{ file_diffs: [] }`
- [ ] Change touching > 10,000 files: file list truncated with `truncated: true` flag; UI shows truncation warning
- [ ] Diff with > 500 files: rendered with warning; > 10 MB total diff: returns error
- [ ] Individual file diff > 1 MB: shows "File too large to display" instead of patch content
- [ ] Unicode file paths: rendered correctly; no mojibake
- [ ] File paths with spaces, dots, special characters: handled without URL encoding issues
- [ ] Garbage-collected parent change: parent ID appears but navigation shows "change not found"
- [ ] Concurrent repository mutation during list fetch: cursor may skip or duplicate; this is acceptable
- [ ] jj CLI not installed on server: all endpoints return `500` with descriptive error

## Design

### API Shape

All endpoints are repository-scoped under `/api/repos/:owner/:repo/`.

#### `GET /api/repos/:owner/:repo/changes`

List changes in reverse chronological order.

**Query Parameters:**
| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `cursor` | string | `""` | Opaque cursor from previous response |
| `limit` | integer | `30` | 1–100; clamped at 100 |

**Response `200 OK`:**
```json
{
  "items": [
    {
      "change_id": "wqnwkozp",
      "commit_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "description": "Fix auth token refresh logic",
      "author_name": "Alice",
      "author_email": "alice@example.com",
      "timestamp": "2026-03-20T14:30:00Z",
      "has_conflict": false,
      "is_empty": false,
      "parent_change_ids": ["yzmlkxop"]
    }
  ],
  "next_cursor": "30"
}
```

**Error Responses:** 400 (invalid limit, missing owner/repo), 404 (repo not found), 500 (jj failure)

#### `GET /api/repos/:owner/:repo/changes/:change_id`

Get metadata for a single change. Response: single Change object. Errors: 400 (missing change_id), 404 (change/repo not found), 500.

#### `GET /api/repos/:owner/:repo/changes/:change_id/diff`

Get the full diff. Query param `whitespace=ignore|hide` suppresses whitespace changes.

**Response:** `{ change_id, file_diffs: [{ path, old_path?, change_type, patch?, is_binary, language?, additions, deletions }] }`

`change_type` values: `added`, `deleted`, `modified`, `renamed`, `copied`.

#### `GET /api/repos/:owner/:repo/changes/:change_id/files`

Get lightweight file list. Response: `{ change_id, files: [{ path, old_path?, change_type }], truncated: boolean }`

#### `GET /api/repos/:owner/:repo/changes/:change_id/conflicts`

Get conflicts. Response: `{ change_id, conflicts: [{ file_path, conflict_type }] }`. Non-conflicted returns empty array.

#### `GET /api/repos/:owner/:repo/file/:change_id/*path`

Get file content at revision. Response: `{ path, content }`.

### SDK Shape

`RepoHostService` methods:
- `listChanges(owner, repo, cursor?, limit?)` → `Result<{ items: Change[]; nextCursor: string }, APIError>`
- `getChange(owner, repo, changeId)` → `Result<Change, APIError>`
- `getChangeDiff(owner, repo, changeId)` → `Result<ChangeDiff, APIError>`
- `getChangeFiles(owner, repo, changeId)` → `Result<ChangeFile[], APIError>`
- `getChangeConflicts(owner, repo, changeId)` → `Result<ChangeConflict[], APIError>`
- `getFileAtChange(owner, repo, changeId, filePath)` → `Result<FileContent, APIError>`

UI-core hooks: `useChanges`, `useChangeDetail`, `useChangeDiff`, `useChangeFiles`, `useChangeConflicts`

### Web UI Design

#### Changes List Page (`/:owner/:repo/changes`)

- Header bar with "Changes" title and count badge
- Each row: tree indicators (│├└), change ID (8 chars monospace copyable), status badges (⚠∅), description first line, author avatar+name, relative timestamp
- Infinite scroll with cursor pagination, loading spinner at bottom
- Empty state: "No changes yet."
- Click row → detail page; click change ID → copy to clipboard

#### Change Detail Page (`/:owner/:repo/changes/:changeId`)

- Header: change ID monospace + copy button, status badges, breadcrumb
- Metadata bar: author avatar+name+email, relative timestamp, commit hash (12 chars monospace copy), parent change IDs as links
- Full markdown description
- Tab bar: Files (default) | Diff | Conflicts (conditional on has_conflict)
- Files tab: table with change type icons (A green / M yellow / D red / R cyan / C cyan), path, stats (+N -M), rename arrows
- Diff tab: file sidebar (25%, collapsible), syntax-highlighted diff, unified/split toggle, whitespace toggle, hunk collapse/expand, keyboard shortcuts (j/k, ]/[, t, w, G/gg, l)
- Conflicts tab: file list with conflict type

### CLI Commands

- `codeplane change list [--limit N] [--repo OWNER/REPO] [--json]` — list changes, default limit 10, human or JSON output
- `codeplane change show <change_id> [--repo OWNER/REPO] [--json]` — show single change
- `codeplane change diff [change_id] [--repo OWNER/REPO] [--json]` — show diff, defaults to @ working copy
- `codeplane change files <change_id> [--repo OWNER/REPO] [--json]` — list files
- `codeplane change conflicts <change_id> [--repo OWNER/REPO] [--json]` — list conflicts

Local mode (no --repo): shells out to jj directly. Remote mode (--repo): calls Codeplane API.

### TUI Design

#### Changes Tab (Repository Screen, Tab #2, Key `2`)

Row layout: tree indicators (3 chars) + change ID (8 chars) + status (2 chars) + description (fill) + author (16 chars) + timestamp. Responsive: 80×24 hides author, shortens IDs; 200×60 expands IDs to 12 chars.

Sort with `o` (newest/oldest/author). Filter with `/` (fuzzy across ID/description/author, max 128 chars). Pagination: 50/page, auto-load at 80% scroll, max 1,000.

Keyboard: j/k navigate, Enter detail, d diff, f files, / filter, o sort, y copy ID, G/gg jump, R retry, q back, ? help.

#### Change Detail Screen

Shows full metadata, description, tabbed Files/Diff/Conflicts. Keyboard: 1/2/3 tabs, Enter open file, d diff, p parent, y copy ID, Y copy commit hash, j/k navigate, q pop.

#### Diff Screen

File sidebar (25%) + main content. Unified (default) and split (≥120 cols) views. Syntax highlighting. Keyboard: t toggle view, ]/[ file nav, w whitespace, z/x/Z/X hunk collapse/expand, j/k scroll, Ctrl+D/U half-page, G/gg jump, l line numbers, Ctrl+B toggle sidebar, ? help.

### VS Code Extension

- Changes Tree View in sidebar: lists recent changes, expandable to show files, click opens diff
- Commands: `Codeplane: Show Changes`, `Codeplane: Show Change Diff`
- Status bar: current change info

### Neovim Plugin

- `:Codeplane changes` — Telescope picker with fuzzy search
- `:CodeplaneChangeFiles <change_id>` — quickfix list
- Statusline component: sync status and current change

### Documentation

1. "Browsing Changes" guide — jj changes concept, web UI walkthrough
2. "CLI Change Commands" reference — all 5 subcommands with examples
3. "Keyboard Shortcuts" reference — TUI shortcuts table
4. "Changes in Landing Requests" guide — change stacks in landing requests
5. "Editor Integration: Changes" guide — VS Code tree view, Neovim Telescope

## Permissions & Security

### Authorization Model

| Role | List Changes | View Change Detail/Diff/Files/Conflicts | File Content at Change |
|------|-------------|----------------------------------------|----------------------|
| **Owner** | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ |
| **Member** | ✅ | ✅ | ✅ |
| **Read-Only** | ✅ | ✅ | ✅ |
| **Anonymous (public repo)** | ✅ | ✅ | ✅ |
| **Anonymous (private repo)** | ❌ 404 | ❌ 404 | ❌ 404 |

All change endpoints are read-only. No write permissions are needed.

Private repositories return `404 Not Found` (not `403 Forbidden`) for unauthenticated requests to prevent information leakage about repository existence.

Deploy keys with read access can access all change endpoints.

### Rate Limiting

| Tier | Limit |
|------|-------|
| Authenticated user | 300 requests/minute across all change endpoints |
| Anonymous | 60 requests/minute across all change endpoints |
| Diff endpoint (higher cost) | Counts as 3 requests toward rate limit due to jj subprocess cost |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses.

### Data Privacy

- Author names and emails from jj commit metadata are exposed. This is consistent with git forge behavior — commit author metadata is considered public within the repository's access scope.
- No PII beyond what is already in the jj commit metadata is exposed by these endpoints.
- Change IDs, commit hashes, and file paths are not considered sensitive — they are repository artifacts.
- File content at change may contain secrets committed to the repository. The endpoint inherits the repository's access control, not additional content filtering.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeListViewed` | User views the changes list | `owner`, `repo`, `surface` (web/cli/tui/vscode/nvim), `page_number`, `result_count` |
| `ChangeDetailViewed` | User views a change detail | `owner`, `repo`, `change_id`, `has_conflict`, `is_empty`, `surface`, `tab` (files/diff/conflicts) |
| `ChangeDiffViewed` | User views a change diff | `owner`, `repo`, `change_id`, `file_count`, `total_additions`, `total_deletions`, `view_mode` (unified/split), `whitespace_ignored`, `surface` |
| `ChangeFileListViewed` | User views the file list | `owner`, `repo`, `change_id`, `file_count`, `truncated`, `surface` |
| `ChangeConflictsViewed` | User views conflicts | `owner`, `repo`, `change_id`, `conflict_count`, `surface` |
| `DiffViewModeToggled` | User toggles unified/split | `owner`, `repo`, `change_id`, `from_mode`, `to_mode`, `surface` |
| `DiffWhitespaceToggled` | User toggles whitespace | `owner`, `repo`, `change_id`, `whitespace_ignored`, `surface` |
| `ChangeIdCopied` | User copies a change ID | `owner`, `repo`, `change_id`, `surface` |
| `ChangeFilterApplied` | User applies a filter in TUI | `filter_length`, `result_count`, `surface` |
| `ChangeSortChanged` | User changes sort order | `sort_order`, `surface` |
| `ParentChangeNavigated` | User navigates to parent change | `owner`, `repo`, `from_change_id`, `to_change_id`, `surface` |
| `FileContentAtChangeViewed` | User views file at revision | `owner`, `repo`, `change_id`, `file_path`, `content_size_bytes`, `surface` |

### Funnel Metrics & Success Indicators

1. **Change exploration depth**: `ChangeListViewed` → `ChangeDetailViewed` → `ChangeDiffViewed`. Target: ≥40% of list views lead to a detail view; ≥60% of detail views lead to a diff view.
2. **Cross-surface adoption**: Percentage of active users using changes from ≥2 surfaces (web + CLI, TUI + editor, etc.). Target: ≥25%.
3. **Pagination engagement**: Average number of pages loaded per change list session. Target: ≥1.5 pages.
4. **Diff viewer engagement**: Average time spent on diff view. Target: ≥30 seconds.
5. **Conflict inspection rate**: Percentage of conflicted changes where users view the Conflicts tab. Target: ≥70%.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|  
| Change list request received | `info` | `owner`, `repo`, `cursor`, `limit`, `user_id` |
| Change list response served | `info` | `owner`, `repo`, `result_count`, `has_next_page`, `latency_ms` |
| Change detail request received | `info` | `owner`, `repo`, `change_id`, `user_id` |
| Change diff request received | `info` | `owner`, `repo`, `change_id`, `whitespace`, `user_id` |
| jj subprocess started | `debug` | `command`, `repo_path`, `args` (sanitized) |
| jj subprocess completed | `debug` | `command`, `exit_code`, `duration_ms`, `stdout_bytes`, `stderr_bytes` |
| jj subprocess failed | `error` | `command`, `exit_code`, `stderr`, `repo_path`, `duration_ms` |
| Change not found | `warn` | `owner`, `repo`, `change_id` |
| Repository not found | `warn` | `owner`, `repo` |
| Pagination cursor invalid | `warn` | `owner`, `repo`, `cursor_value` |
| Diff output exceeds size limit | `warn` | `owner`, `repo`, `change_id`, `diff_size_bytes` |
| File list truncated | `info` | `owner`, `repo`, `change_id`, `total_files`, `returned_files` |
| Rate limit exceeded | `warn` | `user_id`, `endpoint`, `limit`, `window` |

### Prometheus Metrics

**Counters:**
- `codeplane_changes_requests_total{endpoint, method, status_code}` — Total requests per endpoint
- `codeplane_changes_jj_subprocess_total{command, exit_code}` — Total jj subprocess invocations
- `codeplane_changes_errors_total{endpoint, error_type}` — Error count by type

**Histograms:**
- `codeplane_changes_request_duration_seconds{endpoint}` — Request latency (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10)
- `codeplane_changes_jj_subprocess_duration_seconds{command}` — jj CLI execution time (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5)
- `codeplane_changes_diff_size_bytes{endpoint}` — Diff response payload size
- `codeplane_changes_file_count{endpoint}` — Number of files per change

**Gauges:**
- `codeplane_changes_jj_subprocess_active` — Currently running jj subprocesses

### Alerts

#### Alert: High Change API Error Rate
**Condition:** `rate(codeplane_changes_errors_total{error_type="internal"}[5m]) > 0.1`
**Severity:** Warning (>0.1/s), Critical (>1/s)

**Runbook:**
1. Check `codeplane_changes_jj_subprocess_total{exit_code!="0"}` for jj CLI failures.
2. SSH into server, verify `jj --version` works and jj binary is on PATH.
3. Check disk space on repos data directory (`CODEPLANE_DATA_DIR/repos/`). Full disk causes jj failures.
4. Check `stderr` in logs for specific jj error messages ("operation log is corrupted", "repository lock held").
5. If specific repository fails, try `jj operation log` manually to reproduce.
6. Restart server process to clear stale file locks if needed.

#### Alert: High Change API Latency
**Condition:** `histogram_quantile(0.95, codeplane_changes_request_duration_seconds{endpoint="changes_diff"}) > 5`
**Severity:** Warning (>5s p95), Critical (>10s p95)

**Runbook:**
1. Check `codeplane_changes_jj_subprocess_duration_seconds` to isolate jj vs server latency.
2. If jj is slow: check for large repositories (>100k changes).
3. Check system load. jj is CPU-intensive for diff computation.
4. For diff latency, check `codeplane_changes_diff_size_bytes` — large diffs (>5 MB) expected slow.
5. If single repo is outlier, check conflict state.
6. Consider increasing resources or implementing diff caching.

#### Alert: jj Subprocess Pile-Up
**Condition:** `codeplane_changes_jj_subprocess_active > 50`
**Severity:** Critical

**Runbook:**
1. Many concurrent jj processes indicate traffic spike or hung process.
2. Check `ps aux | grep jj` for long-running (>30s) processes.
3. Kill hung processes: `kill -9 <pid>`.
4. Verify rate limiting is enforced.
5. Block offending client IP if abuse pattern.
6. Consider adding jj subprocess concurrency semaphore.

#### Alert: Repository Not Found Spike
**Condition:** `rate(codeplane_changes_errors_total{error_type="not_found"}[5m]) > 5`
**Severity:** Warning

**Runbook:**
1. Correlate with repository deletion/rename events.
2. Inspect logs for owner/repo pairs. One repo or many?
3. Verify repos data directory integrity.
4. If caused by bot/crawler, add to rate limiting deny list.

### Error Cases and Failure Modes

| Error Case | Response | Behavior |
|------------|----------|----------|
| jj binary not found | 500 | Log PATH, return internal error |
| jj command timeout (>30s) | 500 | Kill subprocess, log, return internal error |
| Repository directory missing | 404 | "repository not found" |
| Change ID not found | 404 | "change not found" |
| Invalid limit parameter | 400 | "invalid limit value" |
| Empty owner/repo | 400 | "owner/repo is required" |
| Disk I/O error | 500 | Log errno, internal error |
| Malformed jj output | 500 | Log raw output, internal error |
| Repository lock held | 500 | Log lock details, internal error |

## Verification

### API Integration Tests

#### Change List Endpoint (`GET /changes`)
- [ ] Returns 200 with empty `items` array for repository with no changes
- [ ] Returns changes in reverse chronological order
- [ ] Returns correct default page size of 30 items
- [ ] Respects custom `limit=5`
- [ ] Clamps `limit=200` to 100 items
- [ ] Returns 400 for `limit=-1`
- [ ] Returns 400 for `limit=0`
- [ ] Returns 400 for `limit=abc` (non-numeric)
- [ ] Returns empty `next_cursor` on final page
- [ ] Returns non-empty `next_cursor` when more pages exist
- [ ] Cursor pagination: second page starts where first page ended
- [ ] Cursor pagination: traversing all pages yields every change exactly once
- [ ] Returns 400 when `owner` is empty
- [ ] Returns 400 when `repo` is empty
- [ ] Returns 404 for non-existent repository
- [ ] Returns 404 for private repository when unauthenticated
- [ ] Each change includes all required fields
- [ ] `parent_change_ids` is array (empty for root)
- [ ] Conflicted changes have `has_conflict: true`
- [ ] Empty changes have `is_empty: true`
- [ ] Correct data for repo with exactly 1 change
- [ ] Correct data for repo with exactly 100 changes (max page)
- [ ] Correct data for repo with 101 changes (pagination boundary)
- [ ] `limit=100` returns exactly 100 items when >100 exist

#### Change Detail Endpoint (`GET /changes/:change_id`)
- [ ] Returns 200 with correct metadata
- [ ] Returns full multi-line description
- [ ] Returns 404 for non-existent change ID
- [ ] Returns 400 for empty change_id
- [ ] Correct `parent_change_ids` for merge change
- [ ] Empty `parent_change_ids` for root change
- [ ] `has_conflict: true` for conflicted change
- [ ] `is_empty: true` for empty change
- [ ] Both conflict and empty true simultaneously
- [ ] Short prefix change ID resolution
- [ ] 404 for ambiguous prefix

#### Change Diff Endpoint (`GET /changes/:change_id/diff`)
- [ ] Returns 200 with file_diffs for modified change
- [ ] Empty file_diffs for empty change
- [ ] `change_type: "added"` for new files
- [ ] `change_type: "deleted"` for removed files
- [ ] `change_type: "modified"` for changed files
- [ ] `change_type: "renamed"` with old_path
- [ ] `change_type: "copied"` with old_path
- [ ] `is_binary: true` and null patch for binary
- [ ] Correct additions/deletions counts
- [ ] Language detection for .ts, .py, .rs, .go, .java
- [ ] Null language for unknown extensions
- [ ] Valid unified diff format in patch
- [ ] `?whitespace=ignore` works
- [ ] `?whitespace=hide` works
- [ ] Invalid whitespace param ignored
- [ ] 404 for non-existent change ID
- [ ] Handles >500 files
- [ ] Handles >10,000 line changes

#### Change File List Endpoint (`GET /changes/:change_id/files`)
- [ ] Returns 200 with file array
- [ ] Empty array for empty change
- [ ] `truncated: false` for <10,000 files
- [ ] `truncated: true` for >10,000 files
- [ ] File paths include directories
- [ ] 404 for non-existent change
- [ ] Unicode paths handled
- [ ] Paths with spaces handled

#### Change Conflicts Endpoint (`GET /changes/:change_id/conflicts`)
- [ ] Empty array for non-conflicted change
- [ ] Entries for conflicted change
- [ ] file_path and conflict_type present
- [ ] 404 for non-existent change
- [ ] Multiple conflicted files

#### File at Change Endpoint (`GET /file/:change_id/*path`)
- [ ] Returns 200 with content
- [ ] 404 for non-existent path
- [ ] 404 for non-existent change
- [ ] 400 for empty path
- [ ] Deeply nested paths (>10 levels)
- [ ] URL-encoded special characters
- [ ] Different content at different revisions

### CLI Integration Tests
- [ ] `change list` returns local changes
- [ ] `change list --limit 5` limits output
- [ ] `change list --json` returns valid JSON
- [ ] `change list --repo owner/repo` calls API
- [ ] `change show <id>` displays metadata
- [ ] `change show <id> --json` returns JSON
- [ ] `change show <nonexistent>` errors
- [ ] `change diff` defaults to @ working copy
- [ ] `change diff <id>` shows diff
- [ ] `change diff <id> --json` returns JSON
- [ ] `change files <id>` lists files
- [ ] `change files <id> --json` returns JSON
- [ ] `change conflicts <id>` for conflicted change
- [ ] `change conflicts <id>` empty for clean change
- [ ] `change conflicts <id> --json` returns JSON
- [ ] Non-zero exit on error

### Web UI E2E Tests (Playwright)
- [ ] Navigate to changes page — loads, shows list
- [ ] Change IDs render in monospace
- [ ] Conflict badge (⚠) for conflicted changes
- [ ] Empty badge (∅) for empty changes
- [ ] Click row → navigates to detail
- [ ] Detail shows full metadata
- [ ] Markdown description renders
- [ ] Files tab default selected
- [ ] Files tab shows changed files with type icons
- [ ] Diff tab shows syntax-highlighted diff
- [ ] Unified/split view toggle works
- [ ] Whitespace toggle re-renders
- [ ] File sidebar navigation works
- [ ] Conflicts tab only for conflicted changes
- [ ] Conflicts tab shows file list
- [ ] Parent change link navigates
- [ ] Copy button copies change ID
- [ ] Scroll triggers pagination
- [ ] Empty repo shows empty state
- [ ] Private repo 404 for unauthenticated
- [ ] Non-existent change shows 404

### TUI Integration Tests
- [ ] Tab 2 switches to Changes
- [ ] Changes tab loads list
- [ ] j/k navigation works
- [ ] Enter opens detail
- [ ] d opens diff
- [ ] / activates filter
- [ ] Esc clears filter
- [ ] o cycles sort
- [ ] y copies ID
- [ ] G/gg jump
- [ ] q returns
- [ ] Detail shows metadata
- [ ] Detail tabs 1/2/3 work
- [ ] Diff sidebar shows files
- [ ] Diff ]/[ navigates files
- [ ] Diff t toggles view
- [ ] Diff w toggles whitespace
- [ ] Responsive at 80×24
- [ ] Responsive at 120×40
- [ ] Empty state rendered
- [ ] Error state with R retry
- [ ] Pagination loads next page
- [ ] 1,000 cap shown

### Cross-Surface Consistency Tests
- [ ] Same change ID → identical metadata from API, CLI remote, SDK
- [ ] Same diff → identical file_diffs from API and CLI remote
- [ ] Pagination yields identical totals
- [ ] Conflict status consistent across surfaces
- [ ] Empty status consistent across surfaces

### Performance Tests
- [ ] 10,000 changes repo: first page <500ms
- [ ] Change detail: <500ms
- [ ] Diff ≤50 files: <2s
- [ ] Diff ≤500 files: <5s
- [ ] File list 10,000 files: <5s with truncation
- [ ] 50 concurrent requests: all complete <10s, no 500s

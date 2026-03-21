# JJ_CHANGE_DETAIL

Specification for JJ_CHANGE_DETAIL.

## High-Level User POV

When a developer is working with a Codeplane repository, they frequently need to inspect a specific jj change in detail. Unlike traditional git forges that show commit detail through mutable commit hashes, Codeplane's change detail view is anchored in jj's stable Change ID — a persistent identifier that survives rebases, rewrites, and other history mutations. This makes the change detail view a reliable reference point in any workflow that involves revisiting, linking to, or reasoning about individual units of work.

The user arrives at a change detail view from many entry points: selecting a change from the repository changes list in the web UI, pressing `Enter` on a change in the TUI changes tab, running `codeplane change show <id>` in the CLI, following a link from a landing request's change stack, or navigating from a bookmark's target. Regardless of the entry point, the user sees the same comprehensive picture: the stable Change ID, the corresponding commit hash, the full description (not just the first line), the author's name and email, the timestamp, whether the change has unresolved conflicts, whether the change is empty, and which parent changes it descends from.

Beyond metadata, the change detail view provides direct access to the change's diff, file list, and conflict information. The user can drill into the files modified by this change, view a complete unified or side-by-side diff, and — if the change has conflicts — inspect exactly which files are in conflict and what kind of conflict exists. Parent change IDs are interactive: the user can navigate directly to a parent change to understand the lineage of a change stack.

The change detail view is a cornerstone of Codeplane's jj-native identity. It makes the stable Change ID the primary identifier in every surface, relegating commit hashes to a secondary reference. This means that when a developer rebases or amends work, bookmarks and links that reference a change still resolve correctly, and the change detail view continues to show the latest state of that change. This is fundamentally different from git-oriented forges where a rebase produces new commit SHAs that invalidate previous links.

For agent-assisted workflows, the change detail API provides structured access to change metadata, diffs, and files — enabling agents to reason about individual changes, generate summaries, propose reviews, and create landing requests that reference specific changes by their stable IDs.

## Acceptance Criteria

### Definition of Done

- The API endpoint `GET /api/repos/:owner/:repo/changes/:change_id` returns the full change metadata for a valid change ID
- The web UI renders a change detail page at `/:owner/:repo/changes/:change_id` showing all change metadata, file list, diff, and conflict status
- The TUI pushes a `change-detail` screen with full metadata, tabbed navigation to files/diff/conflicts, and parent change navigation
- The CLI `change show <id>` command returns structured change detail in both human-readable and JSON formats
- All surfaces display the same data for the same change ID — API is the single source of truth
- Parent change IDs are navigable links/actions in all interactive surfaces (web, TUI)
- Conflict and empty status indicators are visible and clearly styled in all surfaces
- The feature works for both server-hosted and local daemon modes

### Input Validation & Boundary Constraints

- `change_id` parameter: string, 1–64 characters, must match pattern `[a-z]{1,64}` (lowercase alphabetic jj change IDs). Inputs not matching this pattern return 400 Bad Request
- `change_id` is case-insensitive on input but normalized to lowercase before resolution
- `owner` parameter: 1–39 characters, alphanumeric plus hyphens, must not start or end with hyphen
- `repo` parameter: 1–100 characters, alphanumeric, hyphens, underscores, and dots; must not end with `.git`
- Change descriptions may be up to 64KB in length. The API returns the full description; truncation is a client-side rendering concern only
- Author name and email: returned as-is from jj, no maximum enforced by Codeplane (jj controls this)
- `parent_change_ids` array: may contain 0–N entries (0 for root changes, 2+ for merge changes). Maximum practical size is unbounded but typically 1–2
- Timestamps are returned in ISO 8601 format (`YYYY-MM-DDTHH:mm:ssZ`)

### Edge Cases

- **Change ID not found**: Returns 404 with message `"change '<id>' not found"`. Web shows "Change not found" with a back link. TUI shows inline error with `R` to retry
- **Ambiguous short change ID**: jj resolves ambiguity; if jj returns an error due to ambiguity, the API returns 400 with a message indicating the ID is ambiguous and suggesting a longer prefix
- **Empty change (is_empty = true)**: Diff and file list endpoints return empty results. The detail view shows an "Empty change" badge and the diff tab shows "No file changes"
- **Change with conflicts (has_conflict = true)**: Conflict indicator is prominently displayed. The conflicts sub-resource lists each conflicted file with its conflict type
- **Change with empty description**: Display `(no description)` in muted styling. The API returns an empty string, not null
- **Change with multiline description**: Full description is rendered with paragraph breaks preserved. First line used as title/summary where space is constrained
- **Root change (parent_change_ids = [])**: Parent section shows "No parents (root change)"
- **Merge change (parent_change_ids.length >= 2)**: All parent change IDs are listed and navigable
- **Repository not found or not accessible**: Returns 404 for the repository, not the change
- **Change ID with special characters or SQL injection attempts**: Input validation rejects non-alphabetic characters before any backend call
- **Very large diff (>1MB patch content)**: The diff endpoint returns the content; client surfaces may truncate or paginate. A warning indicator appears for diffs exceeding 500 files or 10,000 lines of patch content
- **Binary files in change**: Listed in file list with `is_binary: true`; diff shows "Binary file changed" rather than patch content
- **Concurrent change mutation**: If a change is rewritten between fetching the list and fetching detail, the API returns the latest state. The change ID remains stable

### Behavioral Constraints

- Change detail is read-only — there are no mutation actions on this view (editing a change is a jj-local operation)
- The view must load and render within 2 seconds for changes with up to 100 modified files
- The API must respond within 500ms for individual change metadata (excluding diff computation)
- The diff sub-resource may take longer for large changes; clients should show a loading indicator

## Design

### API Shape

#### `GET /api/repos/:owner/:repo/changes/:change_id`

Returns the full metadata for a single jj change.

**Path Parameters:**
- `owner` (string, required): Repository owner username or organization slug
- `repo` (string, required): Repository name
- `change_id` (string, required): Stable jj change ID (full or unambiguous prefix)

**Response (200):**
```json
{
  "change_id": "wqnwkozp",
  "commit_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "description": "Fix auth token refresh logic\n\nThe refresh endpoint was not handling expired tokens correctly.\nThis change adds proper expiry checking and token rotation.",
  "author_name": "Alice Chen",
  "author_email": "alice@example.com",
  "timestamp": "2026-03-19T14:22:00Z",
  "has_conflict": false,
  "is_empty": false,
  "parent_change_ids": ["yzmlkxop"]
}
```

**Error Responses:**
- `400`: Invalid change_id format, missing required parameters
- `401`: Authentication required (private repository)
- `403`: User does not have read access to the repository
- `404`: Repository not found or change not found
- `500`: Internal server error (jj process failure)

#### Related Sub-Resource Endpoints

- `GET /api/repos/:owner/:repo/changes/:change_id/diff` — Returns `ChangeDiffResponse` with per-file diffs. Supports `?whitespace=ignore` query parameter
- `GET /api/repos/:owner/:repo/changes/:change_id/files` — Returns array of `ChangeFileResponse` objects listing modified files
- `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` — Returns array of `ChangeConflictResponse` objects listing conflicts (empty array if no conflicts)
- `GET /api/repos/:owner/:repo/file/:change_id/*` — Returns file content at the change's revision

### SDK Shape

The `RepoHostService` in `@codeplane/sdk` provides the backing implementation:

- `getChange(owner, repo, changeId): Promise<Result<Change, APIError>>` — Resolves via `jj log -r <changeId>`
- `getChangeDiff(owner, repo, changeId): Promise<Result<ChangeDiff, APIError>>` — Resolves via `jj diff -r <changeId> --git`
- `getChangeFiles(owner, repo, changeId): Promise<Result<ChangeFile[], APIError>>` — Resolves via `jj diff --summary -r <changeId>`
- `getChangeConflicts(owner, repo, changeId): Promise<Result<ChangeConflict[], APIError>>` — Resolves via `jj resolve --list -r <changeId>`

Shared data hooks in `@codeplane/ui-core` (to be created):

- `useChangeDetail(owner, repo, changeId)` — Fetches and caches change metadata. Returns `{ data, loading, error, refetch }`
- `useChangeDiff(owner, repo, changeId, opts?)` — Fetches diff with optional whitespace parameter
- `useChangeFiles(owner, repo, changeId)` — Fetches file list
- `useChangeConflicts(owner, repo, changeId)` — Fetches conflict list

### Web UI Design

**Route:** `/:owner/:repo/changes/:changeId`

**Layout:**
The change detail page follows the repository workbench layout. The page is divided into:

1. **Header section**: Displays the full Change ID in monospace font with a copy-to-clipboard button, the state badges (conflict ⚠ and/or empty ∅ if applicable), and a link to the parent change(s)
2. **Metadata bar**: Author avatar + name, email, relative timestamp, and the corresponding commit hash (truncated to 12 chars with copy button)
3. **Description section**: Full markdown-rendered description. If empty, shows "(no description)" in muted text
4. **Tab bar**: Three tabs — **Files** (default), **Diff**, **Conflicts** (shown only if `has_conflict` is true)
5. **Files tab**: Lists all files modified by this change with change type indicators (A/M/D/R/C), path, and stats (+N -M). Clicking a file navigates to the file content at this change's revision
6. **Diff tab**: Renders the full unified diff with syntax highlighting, unified/split toggle, whitespace toggle, and expand/collapse controls. Reuses the existing diff viewer component
7. **Conflicts tab**: Lists conflicted files with conflict type, file path, and base/left/right content sections when available

**Navigation:**
- Breadcrumb: `owner/repo > Changes > <short_change_id>`
- Parent change IDs are rendered as clickable links navigating to the same view for the parent
- Back navigation returns to the changes list or the referencing page

### CLI Command

**`codeplane change show <change_id>`**

Existing command, already implemented. Outputs structured change detail.

**Human-readable output:**
```
Change: wqnwkozp
Commit: a1b2c3d4e5f6
Author: Alice Chen <alice@example.com>
Date:   3 days ago

Fix auth token refresh logic

The refresh endpoint was not handling expired tokens correctly.
This change adds proper expiry checking and token rotation.

Parents: yzmlkxop
Status:  ✓ clean
Files:   3 modified
```

**JSON output (`--json`):** Returns the full `ChangeResponse` object as JSON.

**Options:**
- `--repo OWNER/REPO` — Target a remote repository via API instead of the local working copy
- `--json` — Output structured JSON

### TUI Design

**Screen ID:** `change-detail`

**Push context:** `{ repo: "owner/repo", change_id: "wqnwkozp" }`

**Breadcrumb:** `Dashboard > owner/repo > Changes > wqnwkozp`

**Layout:**
```
┌───────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Changes > wqnwkozp        ● SYNCED │
├───────────────────────────────────────────────────────────────┤
│ Change: wqnwkozp                              commit: a1b2c3 │
│ @alice · 3 days ago                     → parent: yzmlkxop   │
│ Status: ✓ clean                                              │
├───────────────────────────────────────────────────────────────┤
│ Fix auth token refresh logic                                  │
│                                                               │
│ The refresh endpoint was not handling expired tokens correctly.│
│ This change adds proper expiry checking and token rotation.   │
├───────────────────────────────────────────────────────────────┤
│ 1:Files  [2:Diff]  3:Conflicts                               │
├───────────────────────────────────────────────────────────────┤
│   M src/auth/token.ts                              +15 -3    │
│   A src/auth/refresh.ts                            +42 -0    │
│   M tests/auth.test.ts                             +28 -5    │
├───────────────────────────────────────────────────────────────┤
│ d:diff  p:parent  y:copy ID  ?:help              File 1 of 3 │
└───────────────────────────────────────────────────────────────┘
```

**Keyboard interactions:**
- `1`/`2`/`3`: Switch between Files, Diff, Conflicts tabs
- `Tab`/`Shift+Tab`: Cycle tabs
- `Enter`: On a file — open file content at this revision; on a parent — navigate to parent change detail
- `d`: Open diff screen for this change
- `p`: Navigate to parent change (first parent; if multiple, shows a selection overlay)
- `y`: Copy full change ID to clipboard
- `Y`: Copy commit hash to clipboard
- `j`/`k`: Navigate within tab content
- `q`: Pop screen
- `R`: Retry failed fetch

**Responsive behavior:**
- 80×24 minimum: Tab labels abbreviated (`1:Fil 2:Dif 3:Con`). Commit hash hidden. Parent shown as ID only
- 120×40 standard: Full layout as shown above
- 200×60 large: Full commit hash, full timestamps, wider description area

### Documentation

1. **"Viewing Change Details"** — A guide explaining how to view a single change's metadata, description, files, diff, and conflicts from the web UI, CLI, and TUI. Includes screenshots/examples for each surface
2. **"Understanding jj Change IDs"** — A conceptual guide explaining what stable Change IDs are, how they differ from commit hashes, and why Codeplane uses them as the primary identifier
3. **"CLI Change Commands Reference"** — Reference documentation for `change show`, `change diff`, `change files`, `change conflicts` including all options and example outputs
4. **API reference entry** for `GET /api/repos/:owner/:repo/changes/:change_id` with request/response examples

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|-----------|-----------|--------|-------|-------|
| View change detail (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View change detail (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| View change diff (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View change diff (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| View change files (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View change files (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| View change conflicts (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View change conflicts (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |

- Change detail is a **read-only** surface — no mutation actions require elevated permissions
- Private repository access requires at minimum the `Read-Only` role or a valid deploy key with read permission
- PAT-based access follows the same role model as session-based access
- SSH-based access (for CLI `--repo` flag) authenticates via SSH key and checks repository read permissions

### Rate Limiting

- **Authenticated users**: 300 requests per minute per user across all change detail endpoints
- **Unauthenticated users (public repos)**: 60 requests per minute per IP
- **Diff endpoint specifically**: 60 requests per minute per user (diff computation is more expensive)
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) included in all responses
- 429 Too Many Requests returned with `Retry-After` header when limits are exceeded

### Data Privacy

- Author name and email are sourced from jj/git commit metadata — these are inherently public data in any repository that the user has read access to
- No PII beyond what is already in the repository's commit history is exposed
- Change IDs and commit hashes are not considered sensitive data
- File contents returned by the file-at-change endpoint follow the same access controls as the repository browse endpoints
- Descriptions may contain sensitive information (bug details, customer references) — access control at the repository level is the privacy boundary

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeDetailViewed` | User views the change detail page/screen | `change_id`, `owner`, `repo`, `source` (web/tui/cli/api), `has_conflict`, `is_empty`, `user_id` (if authenticated) |
| `ChangeDiffViewed` | User views the diff for a change | `change_id`, `owner`, `repo`, `source`, `file_count`, `total_additions`, `total_deletions`, `view_mode` (unified/split) |
| `ChangeFilesViewed` | User views the file list for a change | `change_id`, `owner`, `repo`, `source`, `file_count` |
| `ChangeConflictsViewed` | User views conflicts for a change | `change_id`, `owner`, `repo`, `source`, `conflict_count` |
| `ChangeParentNavigated` | User navigates from a change to its parent | `change_id`, `parent_change_id`, `owner`, `repo`, `source` |
| `ChangeIdCopied` | User copies a change ID or commit hash | `change_id`, `copied_value` (change_id or commit_id), `source` |
| `ChangeDetailError` | An error occurs loading change detail | `change_id`, `owner`, `repo`, `source`, `error_type` (404/500/timeout), `error_message` |

### Funnel Metrics

- **Change discovery → detail view rate**: What percentage of users who view the changes list subsequently view a change detail? Target: >30%
- **Detail → diff view rate**: What percentage of change detail views lead to a diff view? Target: >50%
- **Cross-surface consistency**: Are change detail view counts proportionally distributed across web, CLI, and TUI in a way that reflects the user's preferred workflow?
- **Error rate**: Percentage of `ChangeDetailViewed` events that are followed by a `ChangeDetailError`. Target: <1%
- **Repeat views**: Average number of times a specific change ID is viewed by the same user — indicates whether the view is useful as a reference point

### Success Indicators

- Users viewing change detail instead of falling back to `jj log` in their terminal
- Landing request reviews that reference specific change IDs (indicating change detail is part of the review workflow)
- Agent sessions that fetch change detail via API (indicating agent integration is working)

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------|
| Change detail request received | `info` | `owner`, `repo`, `change_id`, `user_id`, `request_id` |
| jj subprocess started for getChange | `debug` | `repo_path`, `change_id`, `jj_args`, `request_id` |
| jj subprocess completed | `debug` | `repo_path`, `change_id`, `exit_code`, `duration_ms`, `request_id` |
| jj subprocess failed | `error` | `repo_path`, `change_id`, `exit_code`, `stderr`, `duration_ms`, `request_id` |
| Change not found | `warn` | `owner`, `repo`, `change_id`, `request_id` |
| Ambiguous change ID | `warn` | `owner`, `repo`, `change_id`, `request_id` |
| Repository path resolution failed | `error` | `owner`, `repo`, `error`, `request_id` |
| Change detail response sent | `info` | `owner`, `repo`, `change_id`, `status_code`, `response_time_ms`, `request_id` |
| Diff computation started | `debug` | `owner`, `repo`, `change_id`, `request_id` |
| Diff computation completed | `info` | `owner`, `repo`, `change_id`, `file_count`, `total_lines`, `duration_ms`, `request_id` |
| Rate limit exceeded | `warn` | `user_id`, `ip`, `endpoint`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_detail_requests_total` | Counter | `owner`, `repo`, `status_code` | Total requests to the change detail endpoint |
| `codeplane_change_detail_duration_seconds` | Histogram | `owner`, `repo`, `status_code` | Response time distribution (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_change_diff_requests_total` | Counter | `owner`, `repo`, `status_code` | Total requests to the change diff endpoint |
| `codeplane_change_diff_duration_seconds` | Histogram | `owner`, `repo`, `status_code` | Diff response time distribution |
| `codeplane_change_diff_file_count` | Histogram | `owner`, `repo` | Number of files per diff response (buckets: 1, 5, 10, 25, 50, 100, 250, 500) |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command` (log/diff/resolve), `exit_code` | jj CLI execution time |
| `codeplane_jj_subprocess_errors_total` | Counter | `command`, `error_type` | jj CLI execution failures |
| `codeplane_change_detail_404_total` | Counter | `owner`, `repo` | Change-not-found responses |

### Alerts

#### `ChangeDetailHighErrorRate`
- **Condition**: `rate(codeplane_change_detail_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_change_detail_requests_total[5m]) > 0.05`
- **Severity**: Warning (>5%), Critical (>20%)
- **Runbook**:
  1. Check `codeplane_jj_subprocess_errors_total` for spike in jj failures
  2. SSH into the server and verify `jj --version` runs successfully
  3. Check disk space on the repository data directory (`CODEPLANE_DATA_DIR/repos/`)
  4. Check for jj lock contention: look for "locked" or "concurrent operation" in jj stderr logs
  5. If jj binary is missing or corrupted, redeploy the server with a valid jj installation
  6. If specific repositories are failing, check their `.jj/` directory integrity with `jj debug operation-log`

#### `ChangeDetailHighLatency`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_change_detail_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning (>2s p95), Critical (>5s p95)
- **Runbook**:
  1. Check `codeplane_jj_subprocess_duration_seconds` to determine if latency is in jj execution or HTTP handling
  2. Check system load (`top`, `vmstat`) for CPU or I/O pressure
  3. Look for repositories with unusually large histories: `jj log --limit 1` in affected repos to test baseline latency
  4. Check if the server is under heavy concurrent load via `codeplane_change_detail_requests_total` rate
  5. Consider adding jj operation caching if latency is consistently in jj execution time

#### `JJSubprocessCrashSpike`
- **Condition**: `rate(codeplane_jj_subprocess_errors_total[5m]) > 10`
- **Severity**: Critical
- **Runbook**:
  1. Check jj stderr output in application logs for the specific error messages
  2. Verify jj binary integrity: `jj version`
  3. Check for corrupted repositories by running `jj debug operation-log` in the failing repo paths from logs
  4. If a specific repository is corrupted, consider re-cloning from the upstream source
  5. Check available file descriptors (`ulimit -n`) — jj may exhaust FDs under high concurrency
  6. Escalate to the infrastructure team if jj itself is segfaulting

#### `ChangeDetail404Spike`
- **Condition**: `rate(codeplane_change_detail_404_total[5m]) > 50`
- **Severity**: Warning
- **Runbook**:
  1. Check if a specific repository is generating most 404s (look at labels)
  2. Determine if clients are using stale change IDs — this may indicate a rewrite/squash event
  3. Check if the changes list endpoint is returning stale cached data that references purged changes
  4. If 404s are from bot/scraper traffic, consider tightening rate limits for unauthenticated requests

### Error Cases and Failure Modes

| Failure Mode | Behavior | Recovery |
|-------------|----------|----------|
| jj binary not found | 500 with "internal server error" | Deploy server with jj in PATH |
| Repository directory missing | 404 with "repository not found" | Re-clone or restore from backup |
| jj process timeout (>30s) | 500 with "internal server error" | Kill stale jj processes; investigate repo size |
| Disk full | 500 on any jj operation | Free disk space; add disk monitoring alert |
| Repository lock contention | 500 with jj stderr message | Wait and retry; investigate concurrent access patterns |
| Invalid UTF-8 in jj output | 500 with parse error | Log the raw output; investigate repo content encoding |
| OOM during large diff | Process crash | Add diff size limits; increase server memory |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/changes/:change_id` returns 200 with valid `ChangeResponse` for an existing change
- [ ] Response contains all required fields: `change_id`, `commit_id`, `description`, `author_name`, `author_email`, `timestamp`, `has_conflict`, `is_empty`, `parent_change_ids`
- [ ] `change_id` in response matches the requested change ID
- [ ] `timestamp` is a valid ISO 8601 string
- [ ] `parent_change_ids` is an array (may be empty for root changes)
- [ ] `has_conflict` and `is_empty` are booleans
- [ ] Returns 404 when `change_id` does not exist in the repository
- [ ] Returns 404 when `owner` does not exist
- [ ] Returns 404 when `repo` does not exist
- [ ] Returns 400 when `change_id` is empty string
- [ ] Returns 400 when `change_id` contains uppercase letters (e.g., `WQNWKOZP`)
- [ ] Returns 400 when `change_id` contains numbers (e.g., `abc123`)
- [ ] Returns 400 when `change_id` contains special characters (e.g., `abc!def`)
- [ ] Returns 400 when `change_id` exceeds 64 characters
- [ ] Returns 400 when `owner` is missing
- [ ] Returns 400 when `repo` is missing
- [ ] Returns 401 for private repository when unauthenticated
- [ ] Returns 403 for private repository when user lacks read access
- [ ] Returns 200 for private repository when user has read access
- [ ] Returns 200 for public repository when unauthenticated
- [ ] Handles a change with an empty description (returns `description: ""`)
- [ ] Handles a change with a multiline description (returns full text with newlines)
- [ ] Handles a change with `has_conflict: true`
- [ ] Handles a change with `is_empty: true`
- [ ] Handles a root change with `parent_change_ids: []`
- [ ] Handles a merge change with `parent_change_ids` containing 2+ entries
- [ ] Handles a description at the maximum 64KB size
- [ ] Returns a consistent response when the same change is fetched twice
- [ ] Response time is under 500ms for a standard change

### Change Diff API Tests

- [ ] `GET /api/repos/:owner/:repo/changes/:change_id/diff` returns 200 with valid `ChangeDiffResponse`
- [ ] Response contains `change_id` and `file_diffs` array
- [ ] Each `FileDiffItem` contains `path`, `change_type`, `is_binary`, `additions`, `deletions`
- [ ] `change_type` values are valid: `M`, `A`, `D`, `R`, `C`
- [ ] Renamed files include `old_path`
- [ ] Binary files have `is_binary: true` and no `patch` content
- [ ] `additions` and `deletions` are non-negative integers
- [ ] `?whitespace=ignore` parameter excludes whitespace-only changes
- [ ] Returns 404 for non-existent change
- [ ] Returns empty `file_diffs` array for an empty change
- [ ] Handles a change with 100+ modified files
- [ ] Handles a change with a single file having 10,000+ lines of diff
- [ ] `language` field is populated based on file extension when available

### Change Files API Tests

- [ ] `GET /api/repos/:owner/:repo/changes/:change_id/files` returns 200 with array of `ChangeFileResponse`
- [ ] Each entry contains a `path` field
- [ ] Returns empty array for an empty change
- [ ] Returns correct file count matching the diff endpoint's file count
- [ ] Returns 404 for non-existent change

### Change Conflicts API Tests

- [ ] `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` returns 200 with array of `ChangeConflictResponse`
- [ ] Each entry contains `file_path` and `conflict_type`
- [ ] Returns empty array for a change with no conflicts
- [ ] Returns populated array for a change with conflicts
- [ ] `conflict_type` contains a descriptive string (e.g., "2-sided conflict")
- [ ] Returns 404 for non-existent change

### File at Change API Tests

- [ ] `GET /api/repos/:owner/:repo/file/:change_id/path/to/file.ts` returns 200 with file content
- [ ] Returns 404 when file does not exist at the given change
- [ ] Returns 404 when change does not exist
- [ ] Handles files in nested directories
- [ ] Handles files with special characters in path (spaces, unicode)
- [ ] Handles binary files

### CLI Integration Tests

- [ ] `codeplane change show <valid_id>` outputs change metadata in human-readable format
- [ ] `codeplane change show <valid_id> --json` outputs valid JSON matching `ChangeResponse` schema
- [ ] `codeplane change show <invalid_id>` prints an error message and exits with non-zero status
- [ ] `codeplane change diff <valid_id>` outputs diff content
- [ ] `codeplane change diff` (no ID) defaults to working copy (`@`)
- [ ] `codeplane change files <valid_id>` lists file paths
- [ ] `codeplane change conflicts <valid_id>` lists conflicts or indicates none
- [ ] `codeplane change show <id> --repo owner/repo` fetches from remote API
- [ ] `codeplane change list --limit 5` returns at most 5 changes
- [ ] `codeplane change list --limit 0` handles gracefully (error or default)

### Web UI E2E Tests (Playwright)

- [ ] Navigate to `/:owner/:repo/changes/:changeId` — page renders with change metadata
- [ ] Change ID is displayed prominently with copy button
- [ ] Clicking copy button copies the full change ID to clipboard
- [ ] Commit hash is displayed with copy button
- [ ] Author name and timestamp are displayed
- [ ] Full description is rendered (including multiline)
- [ ] Empty description shows "(no description)" placeholder
- [ ] Conflict badge is visible when `has_conflict` is true
- [ ] Empty badge is visible when `is_empty` is true
- [ ] Files tab lists all modified files with change type indicators
- [ ] Diff tab renders the unified diff with syntax highlighting
- [ ] Diff tab toggle switches between unified and split views
- [ ] Whitespace toggle re-fetches diff with whitespace ignored
- [ ] Conflicts tab appears only when change has conflicts
- [ ] Parent change ID is rendered as a clickable link
- [ ] Clicking parent change ID navigates to that change's detail view
- [ ] Breadcrumb shows correct path: `owner/repo > Changes > <id>`
- [ ] Browser back button returns to the previous page
- [ ] Page returns 404 view for non-existent change ID
- [ ] Page returns 404 view for non-existent repository
- [ ] Loading state is shown while data is being fetched
- [ ] Multiple parent change IDs are all rendered as links (merge change)
- [ ] Root change shows "No parents" or equivalent

### TUI E2E Tests

- [ ] From the changes list, pressing `Enter` on a change pushes the change detail screen
- [ ] Breadcrumb updates to show `… > Changes > <change_id>`
- [ ] Change metadata (ID, commit hash, author, timestamp) is displayed
- [ ] Full description is rendered
- [ ] Tab navigation works between Files, Diff, and Conflicts tabs
- [ ] Files tab lists modified files with change type and stats
- [ ] `d` opens the diff screen for the current change
- [ ] `p` navigates to the parent change
- [ ] `y` copies the change ID (verify clipboard if possible, or verify status bar confirmation)
- [ ] `q` pops back to the changes list
- [ ] Error state shows appropriate message with `R` to retry
- [ ] Non-existent change ID shows "Change not found" error
- [ ] Deep link `codeplane tui --screen change-detail --repo owner/repo --change <id>` opens the correct screen

### Cross-Surface Consistency Tests

- [ ] The same change ID returns identical metadata across API, CLI (`--json`), and web UI (verify key fields match)
- [ ] File counts match between the `/files` endpoint and the `/diff` endpoint's `file_diffs` array length
- [ ] Conflict presence in the change detail response (`has_conflict`) is consistent with the `/conflicts` endpoint returning a non-empty array
- [ ] Empty change status (`is_empty`) is consistent with the `/files` and `/diff` endpoints returning empty results

### Performance Tests

- [ ] API responds within 500ms for change detail (metadata only) on a repository with 10,000+ changes
- [ ] API responds within 2s for change diff on a change with 50 modified files
- [ ] API responds within 5s for change diff on a change with 500 modified files (and returns a large diff warning)
- [ ] Concurrent requests (10 simultaneous) to the same change detail endpoint do not cause jj lock errors

### Security Tests

- [ ] Unauthenticated request to a private repo's change returns 401, not 404 (no information leakage about private repo existence)
- [ ] Change ID parameter is sanitized — SQL injection patterns in change_id return 400
- [ ] Path traversal in the file-at-change endpoint (`../../etc/passwd`) returns 400 or 404
- [ ] Rate limiting returns 429 after exceeding the limit, with correct `Retry-After` header

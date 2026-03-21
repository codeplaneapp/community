# JJ_REPOSITORY_CONFLICTS_UI

Specification for JJ_REPOSITORY_CONFLICTS_UI.

## High-Level User POV

When working with jj repositories, conflicts are a natural part of the development workflow. Unlike git, where conflicts are transient merge artifacts, jj treats conflicts as first-class objects that can persist across changes and be resolved incrementally. Codeplane's repository conflicts UI gives users a single, authoritative view of every unresolved conflict in their repository — across all changes — so they can triage, prioritize, and resolve conflicts without switching between tools or guessing which changes need attention.

From the web UI, a user navigates to a repository and sees a "Conflicts" tab in the repository navigation. A badge on the tab shows how many changes currently have unresolved conflicts. Clicking the tab opens a hierarchical view: at the top level, each conflicted change is listed with its change ID, short description, author, and a count of conflicted files. The user can expand any change to reveal the individual conflicted files beneath it, each annotated with the conflict type reported by jj (such as "2-sided conflict" or "modify-delete conflict"). If conflicts have been resolved, those files appear with a success indicator and can be hidden or shown with a toggle. Users can filter the list by file path to narrow down large conflict sets, and pagination ensures the view remains responsive even in repositories with many conflicted changes.

From the CLI, a user runs `codeplane repo conflicts` to get a quick textual summary of all repository conflicts. When working inside a local jj working copy, the CLI queries jj directly without needing a server connection. When targeting a remote repository, it fetches the same information through the API. The output groups conflicts by change and supports machine-readable JSON for scripting and automation.

From the TUI, the conflicts view appears as Tab 4 in the repository detail screen. Users navigate the hierarchical change-and-file list with keyboard shortcuts, expand and collapse changes, open diffs for conflicted files, and jump to change detail views — all without leaving the terminal.

The conflicts UI also surfaces within landing request views. When a landing request references changes that have conflicts, the review UI clearly flags this so reviewers know that the changes cannot be cleanly landed until conflicts are resolved.

For agent-augmented teams, the conflicts API provides the structured data agents need to detect, triage, and potentially auto-resolve conflicts as part of automated workflows.

The core value of this feature is confidence: at any moment, a developer, reviewer, or agent can answer "does this repository have conflicts, where are they, and what kind are they?" from any Codeplane surface.

## Acceptance Criteria

### Definition of Done

- [ ] A user can view all unresolved conflicts in a repository from the web UI, CLI, TUI, and editor integrations
- [ ] The API endpoint `GET /api/repos/:owner/:repo/conflicts` returns a correct, paginated summary of all conflicted changes and their conflicted files
- [ ] The API endpoint `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` returns the conflict list for a specific change
- [ ] The web UI Conflicts tab displays a hierarchical change → file view with accurate counts, expand/collapse, filtering, and pagination
- [ ] The CLI `codeplane repo conflicts` command works in both local mode (inside a jj working copy) and remote API mode
- [ ] The TUI conflicts tab (Tab 4) renders the hierarchical view with full keyboard navigation
- [ ] All conflict data is read-only; no mutation endpoints are required for this feature
- [ ] The feature degrades gracefully when no conflicts exist (empty state) and when the backend returns errors

### Functional Constraints

- [ ] Repository-level conflict summary must aggregate across ALL changes, not just the working copy
- [ ] Changes must be sorted by conflicted file count (descending), then by change ID (ascending) for stable ordering
- [ ] Files within a change must be sorted alphabetically by file path
- [ ] Conflict types must be returned exactly as reported by jj (e.g., `"2-sided conflict"`, `"modify-delete conflict"`) — no normalization or mapping
- [ ] The resolved/unresolved toggle must default to hiding resolved conflicts
- [ ] The badge on the Conflicts tab must show the count of conflicted _changes_, not conflicted files
- [ ] Pagination defaults: repository conflicts page = 30 changes, max = 100; per-change conflicts page = 50 files, max = 100
- [ ] An empty conflict list (no conflicts) must return HTTP 200 with `total_conflicted_changes: 0` and an empty `changes` array — never a 404 or error
- [ ] A request for conflicts on a non-existent repository must return 404
- [ ] A request for conflicts on a non-existent change ID must return 404
- [ ] Private repositories must return 404 (not 403) to unauthenticated or unauthorized users to avoid disclosing repository existence

### Boundary Constraints

- [ ] Change IDs: 1–64 lowercase hexadecimal characters (`[a-f0-9]`)
- [ ] File paths: max 4096 characters, repository-relative (no leading `/`, no absolute paths, no `..` traversal)
- [ ] Conflict type strings: max 256 characters
- [ ] Description strings: max 65535 characters (jj change descriptions)
- [ ] Author name strings: max 512 characters
- [ ] `page` parameter: integer ≥ 1; values < 1 default to 1
- [ ] `per_page` parameter: integer 1–100; values > 100 clamp to 100; values < 1 default to 30 (repo-level) or 50 (change-level)
- [ ] Filter input (file path substring): max 1024 characters, case-insensitive matching
- [ ] Content fields (`base_content`, `left_content`, `right_content`): max 1 MB each when present
- [ ] `hunks` field: max 5 MB when present

### Edge Cases

- [ ] Repository with zero conflicts: empty state is displayed, badge shows nothing or "0"
- [ ] Repository with exactly one conflicted change containing one conflicted file: renders correctly without UI collapse bugs
- [ ] Change with conflicts where all files have been resolved: change appears when "show resolved" is toggled on, hidden otherwise
- [ ] Very long file paths (near 4096 chars): truncated with ellipsis in compact views, full path shown in expanded/detail views
- [ ] Very long change descriptions: truncated to first line in list view
- [ ] File path containing special characters (spaces, unicode, dots, hyphens): rendered and filterable correctly
- [ ] Conflict type containing unexpected strings (future jj versions): displayed verbatim without crashing
- [ ] Repository where jj subprocess fails or times out: graceful error with retry option
- [ ] Pagination boundary: requesting page beyond available data returns empty changes array with correct totals
- [ ] Concurrent conflict resolution while viewing: stale data is acceptable; refresh button re-fetches
- [ ] Change ID that doesn't match hex pattern: 400 Bad Request with descriptive error message
- [ ] Multiple changes conflicting on the same file path: each change lists the file independently (conflicts are per-change)

## Design

### Web UI Design

#### Conflicts Tab Placement

The Conflicts tab appears in the repository navigation bar alongside existing tabs (Code, Bookmarks, Changes, Issues, Landings, Workflows, etc.). It is positioned after the Changes tab to reflect the natural progression: browse changes → inspect conflicts.

#### Tab Badge

A numeric badge appears on the Conflicts tab when `total_conflicted_changes > 0`. The badge displays the count of conflicted changes (not files). When all conflicts are resolved or there are none, the badge is hidden.

#### Section Header

At the top of the conflicts view:
- **Title**: "Conflicts" with a warning icon (⚠) in amber/warning color when unresolved conflicts exist, or a success icon (✓) in green when all resolved
- **Summary line**: "(N changes, M files)" showing aggregated counts
- **Controls row**: Toggle for "Show resolved" (default: off) and a file path filter input

#### Hierarchical List

The main content is a two-level hierarchical list:

**Level 1 — Conflicted Changes** (expandable/collapsible):
| Column | Content |
|---|---|
| Expand indicator | `▸` (collapsed) / `▾` (expanded) |
| Change ID | Short hex ID, monospace font, clickable to navigate to change detail |
| Commit ID | Short hex, dimmed, monospace |
| Description | First line of change description, truncated with ellipsis |
| Author | Author name |
| Conflict count | Badge showing number of conflicted files |

**Level 2 — Conflicted Files** (visible when parent change is expanded):
| Column | Content |
|---|---|
| Indent | 24px left indent from change row |
| Status icon | `✗` (unresolved, warning color) or `✓` (resolved, success color with strikethrough) |
| File path | Full repository-relative path, monospace, clickable to open diff view |
| Conflict type | jj conflict type string, dimmed |

#### Empty State

When no conflicts exist:
- Centered illustration or icon (✓ in success color)
- Text: "No conflicts found"
- Subtext: "All changes in this repository are conflict-free."

#### Error State

When the API returns an error:
- Inline error banner with the error message
- "Retry" button to re-fetch

#### Loading State

- Skeleton rows mimicking the hierarchical structure
- Spinner in the section header

#### Pagination

A "Load more" button at the bottom of the list fetches the next page of conflicted changes. The summary counts in the header always reflect the total, not just the loaded subset.

#### Filter

The file path filter input:
- Placeholder text: "Filter by file path…"
- Case-insensitive substring match applied to file paths across all loaded changes
- Filters both the file rows and hides changes that have no matching files
- An "×" button clears the filter
- Debounced input (300ms) to avoid excessive re-rendering

---

### API Shape

#### Repository Conflict Summary

```
GET /api/repos/:owner/:repo/conflicts
```

**Query Parameters:**
| Param | Type | Default | Constraint |
|---|---|---|---|
| `page` | integer | 1 | ≥ 1 |
| `per_page` | integer | 30 | 1–100 |
| `show_resolved` | boolean | false | Include changes where all files are resolved |

**Success Response (200):**
```json
{
  "total_conflicted_changes": 5,
  "total_conflicted_files": 12,
  "all_resolved": false,
  "changes": [
    {
      "change_id": "abc123def456",
      "commit_id": "789abc012def",
      "description": "Refactor auth middleware",
      "author": "alice",
      "conflicted_file_count": 3,
      "conflicts": [
        {
          "file_path": "src/auth/middleware.ts",
          "conflict_type": "2-sided conflict",
          "resolution_status": "unresolved"
        }
      ]
    }
  ]
}
```

**Error Responses:**
| Status | Condition |
|---|---|
| 400 | Invalid query parameters |
| 404 | Repository not found or not accessible |
| 500 | Internal server error (jj subprocess failure, DB error) |

#### Per-Change Conflict List

```
GET /api/repos/:owner/:repo/changes/:change_id/conflicts
```

**Query Parameters:**
| Param | Type | Default | Constraint |
|---|---|---|---|
| `page` | integer | 1 | ≥ 1 |
| `per_page` | integer | 50 | 1–100 |

**Success Response (200):**
```json
{
  "total": 3,
  "conflicts": [
    {
      "file_path": "src/auth/middleware.ts",
      "conflict_type": "2-sided conflict",
      "resolution_status": "unresolved"
    }
  ]
}
```

**Error Responses:**
| Status | Condition |
|---|---|
| 400 | Invalid change_id format |
| 404 | Repository or change not found |
| 500 | Internal server error |

---

### SDK Shape

The SDK exposes the following interfaces and service methods in `@codeplane/sdk`:

**Interfaces:**
```typescript
interface ChangeConflict {
  file_path: string;
  conflict_type: string;
  base_content?: string;
  left_content?: string;
  right_content?: string;
  hunks?: string;
  resolution_status?: string;
  resolved_by?: string;
  resolution_method?: string;
  resolved_at?: string;
}

interface ConflictedChangeEntry {
  change_id: string;
  commit_id: string;
  description: string;
  author: string;
  conflicted_file_count: number;
  conflicts: ChangeConflict[];
}

interface RepositoryConflictSummary {
  total_conflicted_changes: number;
  total_conflicted_files: number;
  all_resolved: boolean;
  changes: ConflictedChangeEntry[];
}
```

**RepoHostService methods:**
- `getChangeConflicts(repoPath: string, changeId: string): Promise<ChangeConflict[]>` — calls `jj resolve --list -r <change_id>`, parses output, returns conflict list
- `getRepositoryConflicts(repoPath: string, page: number, perPage: number, showResolved: boolean): Promise<RepositoryConflictSummary>` — aggregates conflicts across all changes with conflict markers

**UI-Core hooks (for web/TUI consumers):**
- `useRepoConflicts(owner, repo, options)` — returns `{ data: RepositoryConflictSummary, isLoading, error, refresh }`
- `useChangeConflicts(owner, repo, changeId, options)` — returns `{ data: { total, conflicts }, isLoading, error, refresh }`

---

### CLI Command

```
codeplane repo conflicts [--repo OWNER/REPO] [--show-resolved] [--json]
```

**Behavior:**
- **Local mode** (inside a jj working copy, no `--repo` flag): Queries local jj directly using `jj resolve --list` for each change with conflicts. Does not require a running Codeplane server.
- **Remote mode** (`--repo` flag or outside jj working copy): Calls `GET /api/repos/:owner/:repo/conflicts` on the configured Codeplane server.

**Human-readable output:**
```
Conflicts: 2 changes, 5 files

  abc123de — Refactor auth middleware (alice) — 3 conflicts
    ✗ src/auth/middleware.ts          2-sided conflict
    ✗ src/auth/session.ts             modify-delete conflict
    ✗ src/auth/types.ts               2-sided conflict

  def456ab — Update API routes (bob) — 2 conflicts
    ✗ src/routes/users.ts             2-sided conflict
    ✗ src/routes/repos.ts             add-add conflict
```

**JSON output (`--json`):**
Returns the `RepositoryConflictSummary` object.

**Per-change variant:**
```
codeplane change conflicts <CHANGE_ID> [--repo OWNER/REPO] [--json]
```

Outputs only the conflicts for a specific change.

---

### TUI Design

The TUI conflicts view is Tab 4 in the repository detail screen.

**Layout:** Two-level hierarchical list matching the web UI structure, rendered with Ink `<Box>` and `<Text>` components.

**Keyboard bindings:**
| Key | Action |
|---|---|
| `j` / `↓` | Move focus down |
| `k` / `↑` | Move focus up |
| `Enter` | Toggle expand/collapse (on change row) or open diff (on file row) |
| `d` | Open diff view for focused file |
| `v` | Open change detail for focused change |
| `/` | Activate file path filter input |
| `Esc` | Clear filter or exit filter mode |
| `h` | Toggle show/hide resolved conflicts |
| `G` | Jump to last row |
| `g g` | Jump to first row |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `x` | Expand all changes |
| `z` | Collapse all changes |
| `R` | Refresh from API |

**Responsive layouts:**
- **80×24 (minimum):** Change ID (8 chars) + conflict count; file path only
- **120×40 (standard):** All columns — ID, commit ID, description (truncated), author, count; file path + conflict type
- **200×60+ (large):** Full descriptions, resolution metadata, timestamps

**Section header:** "Conflicts (N changes, M files)" with ⚠/✓ icon.

**States:**
- Empty: "No conflicts. All clear! ✓" centered
- Loading: Spinner with "Loading…"
- Error: Inline message with "Press `R` to retry"
- 501 from server: "Conflicts endpoint not available. Backend may need updating."

---

### Editor Integration Design

**VS Code:**
- A "Conflicts" tree view item under the repository section in the Codeplane sidebar
- Each conflicted change is a collapsible tree node showing change ID and description
- Each conflicted file is a leaf node showing file path and conflict type
- Clicking a file opens a diff editor for that file at the conflicted change
- Badge on the Codeplane status bar icon when conflicts exist
- Command: `Codeplane: Show Repository Conflicts`

**Neovim:**
- Command: `:Codeplane repo conflicts` — opens a Telescope picker listing conflicted changes
- Selecting a change expands to show conflicted files
- Selecting a file opens the diff view
- Statusline component shows conflict count when > 0

---

### Documentation

The following end-user documentation should be written:

1. **"Understanding JJ Conflicts in Codeplane"** — A conceptual guide explaining what jj conflicts are, how they differ from git merge conflicts, and why Codeplane surfaces them as first-class objects. Targeted at users new to jj.

2. **"Viewing Repository Conflicts"** — A how-to guide covering: finding the Conflicts tab in the web UI, expanding changes and viewing conflicted files, using the file path filter, toggling resolved conflict visibility, understanding conflict type labels.

3. **"CLI: Repository and Change Conflicts"** — CLI reference documenting: `codeplane repo conflicts` with all flags, `codeplane change conflicts <id>` with all flags, local vs. remote mode behavior, JSON output format for scripting.

4. **"API: Conflict Endpoints"** — API reference for `GET /api/repos/:owner/:repo/conflicts` and `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` with request/response schemas, error codes, and pagination.

## Permissions & Security

### Authorization Model

| Role | Repository Conflicts (repo-level) | Change Conflicts (per-change) |
|---|---|---|
| **Owner** | ✅ Full read access | ✅ Full read access |
| **Admin** | ✅ Full read access | ✅ Full read access |
| **Member (Write)** | ✅ Full read access | ✅ Full read access |
| **Member (Read-Only)** | ✅ Full read access | ✅ Full read access |
| **Anonymous (public repo)** | ✅ Read access | ✅ Read access |
| **Anonymous (private repo)** | ❌ 404 Not Found | ❌ 404 Not Found |
| **Authenticated (no repo access)** | ❌ 404 Not Found | ❌ 404 Not Found |

**Key security rules:**
- All conflict endpoints are **read-only**. There are no mutation operations exposed through the conflicts API.
- Private repositories must return **404** (not 403) for unauthorized or unauthenticated requests to prevent repository existence disclosure.
- Conflict data does not include file contents by default in the repository-level summary. Content fields (`base_content`, `left_content`, `right_content`) are only populated on the per-change endpoint and follow the same access controls as repository file browsing.
- Deploy key access: Deploy keys with read permission can access conflict data via API.

### Rate Limiting

| Context | Limit |
|---|---|
| Authenticated user | 300 requests/minute per user across all conflict endpoints |
| Anonymous (public repo) | 60 requests/minute per IP |
| Per-repository cap | 600 requests/minute across all users (prevents abuse on popular repos) |
| CLI local mode | No rate limit (queries local jj directly, no server involvement) |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all API responses.

### Data Privacy

- Conflict data mirrors repository content visibility. No additional PII is exposed beyond what is already available through file browsing and change listing.
- Author names and emails in conflict metadata follow the same privacy settings as the change/commit author fields.
- Conflict resolution metadata (`resolved_by`) references Codeplane user IDs, not external identity information.
- No user-generated content beyond what jj itself produces is stored or returned by the conflict endpoints.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `RepoConflictsViewed` | User opens the Conflicts tab (web/TUI) or runs `repo conflicts` (CLI) | `owner`, `repo`, `surface` (web/cli/tui/vscode/neovim), `total_conflicted_changes`, `total_conflicted_files`, `all_resolved`, `show_resolved_enabled` |
| `ChangeConflictsViewed` | User views conflicts for a specific change | `owner`, `repo`, `change_id`, `surface`, `conflict_count` |
| `ConflictChangeExpanded` | User expands a change row to see files | `owner`, `repo`, `change_id`, `surface`, `conflicted_file_count` |
| `ConflictFileOpened` | User clicks/navigates to a conflicted file's diff | `owner`, `repo`, `change_id`, `file_path`, `conflict_type`, `surface` |
| `ConflictFilterApplied` | User applies a file path filter | `owner`, `repo`, `surface`, `filter_length`, `result_count` |
| `ConflictResolvedToggled` | User toggles show/hide resolved conflicts | `owner`, `repo`, `surface`, `show_resolved` |
| `ConflictsPaginated` | User loads the next page of conflicts | `owner`, `repo`, `surface`, `page_number` |

### Funnel Metrics

1. **Discovery rate**: % of repository views that navigate to the Conflicts tab
2. **Engagement depth**: % of Conflicts tab views that expand at least one change
3. **Action rate**: % of Conflicts tab views that open at least one conflicted file's diff
4. **Resolution funnel**: Time from `RepoConflictsViewed` to `total_conflicted_changes` reaching 0 (conflicts resolved)
5. **CLI adoption**: % of conflict views from CLI vs. web vs. TUI vs. editors

### Success Indicators

- **Conflicts tab load success rate**: > 95% of page loads complete without error
- **Engagement**: > 60% of Conflicts tab views result in at least one change expansion
- **Cross-surface usage**: Conflict data accessed from ≥ 2 surfaces per active repository per week
- **Resolution velocity**: Average time-to-resolution for conflicts decreases after feature launch
- **Error rate**: < 2% of conflict API requests result in 5xx errors

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| Conflict summary fetched | `info` | `repo_id`, `owner`, `repo`, `total_changes`, `total_files`, `page`, `per_page`, `duration_ms` | Every successful repository conflicts API call |
| Change conflicts fetched | `info` | `repo_id`, `change_id`, `conflict_count`, `duration_ms` | Every successful per-change conflicts API call |
| jj subprocess invocation | `debug` | `repo_path`, `command`, `args`, `exit_code`, `duration_ms`, `stderr_preview` (first 500 chars) | Every `jj resolve --list` call |
| jj subprocess failure | `error` | `repo_path`, `command`, `exit_code`, `stderr`, `duration_ms` | When jj subprocess exits non-zero unexpectedly |
| jj output parse failure | `warn` | `repo_path`, `change_id`, `raw_line`, `parse_error` | When a line from jj output doesn't match the expected format |
| Conflict DB query | `debug` | `repo_id`, `change_id`, `query_name`, `row_count`, `duration_ms` | Every database query for conflict data |
| Rate limit exceeded | `warn` | `user_id` or `ip`, `endpoint`, `limit`, `window` | When a request is rate-limited |
| Invalid change ID format | `warn` | `repo_id`, `supplied_change_id`, `validation_error` | When change_id fails hex validation |

### Prometheus Metrics

**Counters:**
| Metric | Labels | Description |
|---|---|---|
| `codeplane_repo_conflicts_requests_total` | `owner`, `repo`, `status_code`, `surface` | Total requests to repository conflicts endpoint |
| `codeplane_change_conflicts_requests_total` | `owner`, `repo`, `status_code` | Total requests to per-change conflicts endpoint |
| `codeplane_jj_subprocess_invocations_total` | `command`, `exit_code` | Total jj subprocess calls for conflict resolution |
| `codeplane_jj_parse_failures_total` | `repo_id`, `error_type` | Count of jj output parsing failures |

**Histograms:**
| Metric | Labels | Buckets | Description |
|---|---|---|---|
| `codeplane_repo_conflicts_duration_seconds` | `owner`, `repo` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0 | Latency of repository conflicts endpoint |
| `codeplane_change_conflicts_duration_seconds` | `owner`, `repo` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 | Latency of per-change conflicts endpoint |
| `codeplane_jj_subprocess_duration_seconds` | `command` | 0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0 | jj subprocess execution time |

**Gauges:**
| Metric | Labels | Description |
|---|---|---|
| `codeplane_repo_conflicted_changes_gauge` | `owner`, `repo` | Current number of conflicted changes per repo (updated on fetch) |
| `codeplane_repo_conflicted_files_gauge` | `owner`, `repo` | Current number of conflicted files per repo (updated on fetch) |

### Alerts

#### Alert: High Conflict Endpoint Error Rate
- **Condition**: `rate(codeplane_repo_conflicts_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_repo_conflicts_requests_total[5m]) > 0.05`
- **Severity**: Warning (>5%), Critical (>20%)
- **Runbook**:
  1. Check server logs for `jj subprocess failure` events — filter by `repo_path` to identify if the issue is repo-specific or global.
  2. Verify jj binary is accessible and executable on the server (`which jj`, `jj --version`).
  3. Check disk space on repository storage — jj operations fail when disk is full.
  4. If repo-specific, check if the repository is corrupted (`jj debug` commands).
  5. If global, check if a jj version upgrade introduced breaking output format changes (compare `jj resolve --list` output against the regex parser).
  6. Check database connectivity for conflict persistence queries.
  7. If the issue persists, restart the server process and monitor.

#### Alert: High Conflict Endpoint Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_conflicts_duration_seconds_bucket[5m])) > 5.0`
- **Severity**: Warning (>5s p95), Critical (>10s p95)
- **Runbook**:
  1. Check `codeplane_jj_subprocess_duration_seconds` histogram — is jj itself slow?
  2. If jj is slow: check repository size, operation log length, and disk I/O metrics. Large repos with long operation logs can cause `jj resolve --list` to be slow. Consider running `jj operation abandon` to trim history.
  3. If jj is fast but endpoint is slow: check DB query latency for conflict persistence. Look for missing indexes on `(repository_id, change_id)`.
  4. Check for resource contention — high CPU or memory usage on the server.
  5. If a single repo is causing the issue, check if it has an unusually large number of conflicted changes (thousands).

#### Alert: jj Parse Failures Spike
- **Condition**: `rate(codeplane_jj_parse_failures_total[10m]) > 1`
- **Severity**: Warning
- **Runbook**:
  1. Check `jj output parse failure` log entries for the `raw_line` field.
  2. Determine if jj output format has changed (new jj version deployed?).
  3. Compare the failing lines against the parsing regex `/^(.+?)\s{2,}(.+)$/`.
  4. If a jj version change is the cause, update the parser to handle the new format.
  5. If the output is genuinely malformed, check if the repository's jj state is corrupted.

#### Alert: Conflict Endpoint Rate Limiting Exceeded
- **Condition**: `rate(codeplane_repo_conflicts_requests_total{status_code="429"}[5m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Identify the user or IP triggering rate limits from `rate limit exceeded` log entries.
  2. Determine if this is legitimate usage (e.g., a CI bot polling conflicts) or abuse.
  3. If legitimate: consider increasing per-user rate limits or suggesting the user use webhooks/SSE for change notifications instead of polling.
  4. If abuse: consider temporary IP-level blocking.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Recovery |
|---|---|---|
| jj binary not found on server | 500 | Server must have jj installed; alert fires on startup check |
| jj subprocess times out (>30s) | 500 (gateway timeout) | Retry once; if persistent, check repo health |
| jj subprocess exits with "No such change" | 404 | Return 404 to client — change ID is invalid |
| jj subprocess exits with "No such revision" | 404 | Return 404 — change not found in repo |
| jj subprocess exits with permission error | 500 | Check filesystem permissions on repo storage |
| Database connection failure | 500 | Standard DB reconnection handling; alert on persistent failure |
| Repository not found in DB | 404 | Return 404 — repo doesn't exist or user lacks access |
| Malformed change_id parameter | 400 | Validate against `^[a-f0-9]{1,64}$` regex before any processing |
| Pagination parameters out of range | 400 | Return descriptive error indicating valid ranges |
| Repository path traversal attempt | 400 | Block and log — security event |

## Verification

### API Integration Tests

#### Repository Conflicts Endpoint

1. **Test: Fetch conflicts for a repository with no conflicts** — Create a repo with no conflicted changes. `GET /api/repos/:owner/:repo/conflicts` returns 200 with `total_conflicted_changes: 0`, `total_conflicted_files: 0`, `all_resolved: true`, `changes: []`.

2. **Test: Fetch conflicts for a repository with one conflicted change** — Create a repo with one change that has a 2-sided conflict on one file. Verify response includes exactly one entry in `changes` with correct `change_id`, `conflicted_file_count: 1`, and correct file path and conflict type.

3. **Test: Fetch conflicts for a repository with multiple conflicted changes** — Create a repo with 3 changes, each with varying numbers of conflicts (1, 3, 5). Verify changes are sorted by `conflicted_file_count` descending. Verify `total_conflicted_changes: 3` and `total_conflicted_files: 9`.

4. **Test: Pagination — first page** — Repo with 50 conflicted changes. `GET ...?page=1&per_page=10` returns 10 changes, `total_conflicted_changes: 50`.

5. **Test: Pagination — second page** — Same repo. `GET ...?page=2&per_page=10` returns the next 10 changes, different from page 1.

6. **Test: Pagination — beyond last page** — `GET ...?page=100&per_page=10` returns 200 with `changes: []` and correct totals.

7. **Test: per_page clamped to max 100** — `GET ...?per_page=500` returns at most 100 changes.

8. **Test: per_page defaults to 30** — `GET ...` (no per_page) returns at most 30 changes.

9. **Test: show_resolved=false excludes resolved changes** — Repo with 2 conflicted changes; mark all conflicts in one as resolved. Default request returns only 1 change.

10. **Test: show_resolved=true includes resolved changes** — Same repo. `GET ...?show_resolved=true` returns both changes.

11. **Test: Non-existent repository returns 404** — `GET /api/repos/nobody/nonexistent/conflicts` returns 404.

12. **Test: Private repo returns 404 for unauthenticated user** — Create private repo. Unauthenticated request returns 404 (not 403).

13. **Test: Private repo returns 404 for user without access** — Authenticated user who is not a member gets 404.

14. **Test: Private repo returns 200 for repo member** — Authenticated member gets 200 with conflict data.

15. **Test: Public repo returns 200 for anonymous user** — Public repo conflicts accessible without auth.

16. **Test: Files within a change are sorted alphabetically** — Change with conflicts in `z.ts`, `a.ts`, `m.ts`. Verify response order is `a.ts`, `m.ts`, `z.ts`.

17. **Test: Conflict type strings are preserved verbatim** — Verify `"2-sided conflict"`, `"3-sided conflict"`, `"modify-delete conflict"`, `"add-add conflict"` come through without transformation.

#### Per-Change Conflicts Endpoint

18. **Test: Fetch conflicts for a change with no conflicts** — `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` returns 200 with `total: 0`, `conflicts: []`.

19. **Test: Fetch conflicts for a change with multiple conflicts** — Change with 3 conflicted files. Verify all are returned with correct `file_path` and `conflict_type`.

20. **Test: Invalid change ID format** — `GET ...changes/INVALID!!!/conflicts` returns 400.

21. **Test: Non-existent change ID** — Valid hex format but no such change. Returns 404.

22. **Test: Change ID at maximum length (64 chars)** — `GET ...changes/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789/conflicts` succeeds or returns 404 (not 400).

23. **Test: Change ID exceeds maximum length (65 chars)** — Returns 400 with validation error.

24. **Test: Change ID with uppercase hex** — `GET ...changes/ABCDEF/conflicts` returns 400 (only lowercase hex allowed).

25. **Test: Pagination for per-change conflicts** — Change with 60 conflicted files. Default returns 50. `?per_page=100` returns all 60.

26. **Test: File paths with special characters** — Conflict in `src/my file (1).ts` and `日本語/ファイル.ts`. Both returned correctly.

27. **Test: Very long file path (4096 chars)** — Conflict in a file with a path exactly 4096 chars long. Verify it is returned.

28. **Test: File path exceeding 4096 chars** — Verify the API handles this gracefully (either truncates or rejects with error).

#### Rate Limiting Tests

29. **Test: Authenticated user rate limit** — Send 301 requests in 1 minute as an authenticated user. Verify the 301st returns 429 with rate limit headers.

30. **Test: Anonymous rate limit** — Send 61 requests in 1 minute as anonymous. Verify the 61st returns 429.

31. **Test: Rate limit headers present** — Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` are present on all responses.

### CLI Integration Tests

32. **Test: `codeplane repo conflicts` in local mode with no conflicts** — Inside a jj repo with no conflicts. Output: "No conflicts found" or equivalent.

33. **Test: `codeplane repo conflicts` in local mode with conflicts** — Inside a jj repo with 2 conflicted changes. Output includes change IDs, file paths, conflict types, grouped by change.

34. **Test: `codeplane repo conflicts --json` in local mode** — Returns valid JSON matching `RepositoryConflictSummary` schema.

35. **Test: `codeplane repo conflicts --repo owner/repo` in remote mode** — Calls the API and displays results.

36. **Test: `codeplane repo conflicts --show-resolved`** — Includes resolved conflicts in output.

37. **Test: `codeplane change conflicts <id>` in local mode** — Returns conflicts for a specific change.

38. **Test: `codeplane change conflicts <id> --json`** — Returns valid JSON.

39. **Test: `codeplane change conflicts <invalid_id>`** — Returns descriptive error.

40. **Test: `codeplane repo conflicts` outside jj working copy without --repo** — Returns error indicating no repository context.

### Web UI E2E Tests (Playwright)

41. **Test: Conflicts tab is visible in repository navigation** — Navigate to a repository. Verify "Conflicts" tab exists.

42. **Test: Conflicts tab badge shows correct count** — Repo with 3 conflicted changes. Badge shows "3".

43. **Test: Conflicts tab badge is hidden when no conflicts** — Repo with no conflicts. No badge visible.

44. **Test: Empty state renders correctly** — Navigate to Conflicts tab on a repo with no conflicts. Verify empty state illustration and text.

45. **Test: Conflict list renders with correct changes** — Repo with 2 conflicted changes. Both appear with correct change IDs.

46. **Test: Expanding a change reveals conflicted files** — Click expand on a change row. Verify child file rows appear with correct file paths and conflict types.

47. **Test: Collapsing a change hides files** — Expand then collapse a change. Verify file rows disappear.

48. **Test: Clicking file path navigates to diff view** — Click a conflicted file path. Verify navigation to the diff view for that change/file.

49. **Test: File path filter narrows results** — Type a path fragment into the filter. Verify only matching files (and their parent changes) are shown.

50. **Test: File path filter — clearing restores all results** — Apply filter, then clear. Verify full list returns.

51. **Test: Show resolved toggle** — Repo with some resolved conflicts. Toggle "Show resolved" on. Verify resolved items appear with success icon.

52. **Test: Pagination — load more button** — Repo with 40 conflicted changes. Verify "Load more" button appears after first 30. Click it. Verify additional changes load.

53. **Test: Loading state shows skeleton** — Intercept API call to delay response. Verify skeleton/spinner renders during load.

54. **Test: Error state shows retry button** — Mock API to return 500. Verify error message and retry button render. Click retry.

55. **Test: Section header shows correct summary** — Verify "(N changes, M files)" text matches actual data.

56. **Test: Warning icon when unresolved, success icon when all resolved** — Verify icon color/type changes based on conflict state.

### TUI Integration Tests

57. **Test: Tab 4 displays conflicts view** — Navigate to Tab 4 in repository detail. Verify conflicts section header renders.

58. **Test: j/k navigation moves focus between rows** — Press j and k. Verify focus indicator moves.

59. **Test: Enter toggles expand/collapse on change row** — Focus on change, press Enter. Verify files appear. Press Enter again. Verify files hidden.

60. **Test: d opens diff view on file row** — Focus on a file row, press d. Verify diff view opens.

61. **Test: v opens change detail on change row** — Focus on change, press v. Verify change detail opens.

62. **Test: / activates filter, Esc clears** — Press /. Verify filter input appears. Type text. Press Esc. Verify filter clears.

63. **Test: h toggles resolved visibility** — Press h. Verify resolved items appear/disappear.

64. **Test: R refreshes data** — Press R. Verify API is re-called and data refreshes.

65. **Test: x expands all, z collapses all** — Press x. Verify all changes expanded. Press z. Verify all collapsed.

66. **Test: Empty state in TUI** — Repo with no conflicts. Verify "No conflicts. All clear! ✓" message.

67. **Test: Error state in TUI** — Mock API error. Verify error message with "Press `R` to retry".

68. **Test: 501 state in TUI** — Mock 501 response. Verify "Conflicts endpoint not available" message.

69. **Test: Responsive layout at 80×24** — Verify compact layout with truncated columns.

70. **Test: Responsive layout at 120×40** — Verify full column set renders.

### Cross-Surface Consistency Tests

71. **Test: API response matches CLI JSON output** — Same repo queried via API and `codeplane repo conflicts --json`. Verify structural equivalence.

72. **Test: Web UI conflict count matches API total** — Compare tab badge and header counts with API `total_conflicted_changes` and `total_conflicted_files`.

73. **Test: Conflict types consistent across surfaces** — Same conflict viewed via web, CLI, and API returns identical `conflict_type` strings.

74. **Test: File ordering consistent across surfaces** — Same change's conflicts queried via all surfaces returns files in identical alphabetical order.

### Regression and Edge Case Tests

75. **Test: Repository with 100 conflicted changes, 500 conflicted files** — Verify API handles the upper end of expected data without timeout. Verify pagination works correctly across all pages.

76. **Test: Change with 100 conflicted files (max per page)** — Verify all 100 returned in a single page with `per_page=100`.

77. **Test: Concurrent requests to conflict endpoints** — Send 10 simultaneous requests. All return consistent data.

78. **Test: Repository with mixed conflict types** — Repo with `2-sided`, `3-sided`, `modify-delete`, and `add-add` conflicts. All types render correctly in every surface.

79. **Test: Conflict on file with deeply nested path (20+ levels)** — Verify file path renders and is filterable.

80. **Test: Change description with special characters (unicode, emoji, HTML entities)** — Verify description renders safely without XSS or encoding issues.

81. **Test: Change description with newlines** — Verify only first line shown in list view.

82. **Test: API response time under 2 seconds for repo with 50 conflicted changes** — Performance baseline test.

83. **Test: CLI local mode works without network** — Disconnect network. Run `codeplane repo conflicts` inside jj working copy. Verify it succeeds using local jj.

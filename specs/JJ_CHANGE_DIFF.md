# JJ_CHANGE_DIFF

Specification for JJ_CHANGE_DIFF.

## High-Level User POV

When you're working in a jj-native repository on Codeplane, you need to see exactly what a given change introduces — the files touched, the lines added and removed, and the nature of each modification. The JJ Change Diff feature lets you view a richly-rendered, syntax-highlighted diff for any jj change, identified by its stable change ID.

From the web, you navigate to a change and see its diff broken out file-by-file. A sidebar tree shows every modified file at a glance — color-coded by type (added, deleted, modified, renamed, copied) — and clicking a file scrolls you directly to its section. You choose between a unified view (interleaved additions and deletions in one column) or a side-by-side split view (old content on the left, new content on the right). A whitespace toggle strips out noise when you only care about meaningful changes. You can expand or collapse individual hunks to focus on the sections that matter, and you can copy the raw patch to your clipboard for use elsewhere.

From the CLI, `codeplane change diff` prints the raw diff for any change — defaulting to your working copy (`@`) — suitable for piping, scripting, or quick terminal review. From the TUI, you get the same rich experience as the web but rendered with ANSI colors, keyboard-driven file navigation, scroll-synced split panes, and automatic syntax highlighting adapted to your terminal's color capabilities. Landing request review surfaces reuse the same diff viewer, adding the ability to leave inline comments on specific lines.

The change diff is the most fundamental inspection surface in a jj-native forge. It lets you understand what any change does before you land it, review it, or build on top of it.

## Acceptance Criteria

### Definition of Done

- [ ] A user can retrieve the full structured diff for any valid jj change ID via the API, CLI, TUI, and (when available) Web UI
- [ ] The diff response includes per-file metadata: path, old_path (for renames/copies), change_type, patch content, binary flag, detected language, and addition/deletion counts
- [ ] The feature works for all five change types: `added`, `deleted`, `modified`, `renamed`, `copied`
- [ ] Binary files are detected and flagged without attempting to render patch content
- [ ] Language detection works for 30+ file extensions, with graceful fallback to plain text
- [ ] Whitespace-only changes can be filtered out via a query parameter
- [ ] Empty changes (no file modifications) return a valid response with an empty `file_diffs` array
- [ ] All existing e2e tests for TUI diff syntax highlighting pass

### Input Validation & Boundary Constraints

- [ ] `change_id` must be a non-empty, trimmed string; empty or whitespace-only values return HTTP 400
- [ ] `change_id` values containing path-traversal patterns (`..`, `/`) are rejected or sanitized before reaching the jj CLI
- [ ] `owner` and `repo` path parameters must be non-empty, trimmed strings; empty values return HTTP 400
- [ ] The `whitespace` query parameter accepts only `ignore`, `hide`, or empty/absent; any other value is treated as absent (no error)
- [ ] File paths in the response preserve their original encoding and do not exceed 4096 characters
- [ ] Patch content for a single file is unbounded but the total response is subject to the server's max response size (configurable, default 50 MB)
- [ ] Change IDs that do not resolve in the repository return HTTP 404 with a descriptive error message
- [ ] Repositories that do not exist return HTTP 404

### Edge Cases

- [ ] A change that touches 0 files returns `{ change_id: "...", file_diffs: [] }`
- [ ] A change that touches 500+ files returns all files (no artificial truncation) within the response size limit
- [ ] A change with mixed binary and text files correctly flags each file individually
- [ ] Renamed files include both `path` (new) and `old_path` (old) in the response
- [ ] Copied files include both `path` (new) and `old_path` (source) in the response
- [ ] A file with no extension returns an empty or undefined `language` field
- [ ] Files named `Dockerfile`, `Makefile`, etc. are detected by basename, not extension
- [ ] A file with a double extension (e.g., `component.test.tsx`) resolves language from the final extension
- [ ] Diff output that contains literal `diff --git` inside file content does not break the parser
- [ ] Unicode file paths and content are handled correctly
- [ ] Requesting a diff while the repository is locked by a concurrent jj operation returns a retriable server error, not a hang

### CLI-Specific

- [ ] `codeplane change diff` with no argument defaults to `@` (working copy)
- [ ] `codeplane change diff <id>` returns the diff for the specified change
- [ ] JSON output mode (`--json`) returns the structured `{ change_id, diff }` payload
- [ ] Default (non-JSON) output returns the raw diff text suitable for piping

### TUI-Specific

- [ ] Syntax highlighting renders correctly at ≥80×24 terminal size
- [ ] Unified and split views are both available and togglable via `t`
- [ ] File tree sidebar shows all modified files with change-type indicators
- [ ] Keyboard navigation (`j`/`k`, `]`/`[`, `Ctrl+D`/`Ctrl+U`, `G`, `gg`) works in both view modes
- [ ] Split view is only available when terminal width ≥120 columns
- [ ] Whitespace toggle (`w`) re-fetches with the `ignore_whitespace` parameter
- [ ] Hunk collapse/expand (`z`/`x`/`Z`/`X`) works correctly

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/changes/:change_id/diff`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner username or org slug |
| `repo` | string | Yes | Repository name |
| `change_id` | string | Yes | jj change ID (short or full-length hex) |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `whitespace` | string | No | Set to `ignore` or `hide` to exclude whitespace-only changes from the diff output |

**Success Response (200):**
```json
{
  "change_id": "kxsmqppt",
  "file_diffs": [
    {
      "path": "src/index.ts",
      "old_path": null,
      "change_type": "added",
      "patch": "@@ -0,0 +1,15 @@\n+import ...",
      "is_binary": false,
      "language": "typescript",
      "additions": 15,
      "deletions": 0,
      "old_content": null,
      "new_content": null
    },
    {
      "path": "image.png",
      "old_path": null,
      "change_type": "modified",
      "patch": null,
      "is_binary": true,
      "language": null,
      "additions": 0,
      "deletions": 0,
      "old_content": null,
      "new_content": null
    }
  ]
}
```

**Error Responses:**
| Status | Condition |
|--------|-----------|
| 400 | Missing or empty `owner`, `repo`, or `change_id` |
| 401 | Authentication required (if repo is private) |
| 403 | Insufficient permissions to read repository |
| 404 | Repository not found or change ID not found |
| 500 | Internal jj command failure |
| 503 | Repository temporarily locked by concurrent operation |

### SDK Shape

The `RepoHostService` in `packages/sdk` exposes:

```typescript
async getChangeDiff(
  owner: string,
  repo: string,
  changeId: string
): Promise<Result<ChangeDiff, APIError>>
```

With supporting types:

```typescript
interface ChangeDiff {
  change_id: string;
  file_diffs: FileDiffItem[];
}

interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: string; // "added" | "deleted" | "modified" | "renamed" | "copied"
  patch?: string;
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}
```

This executes `jj diff -r <changeId> --git` in the repository directory and parses the output using `parseGitDiff()`, which:
1. Splits output on `diff --git` headers
2. Detects change type from mode lines (`new file mode`, `deleted file mode`, `rename from`, `copy from`)
3. Detects binary files from `Binary files` or `GIT binary patch` markers
4. Counts additions/deletions from hunk lines (lines starting with `+`/`-`, excluding `+++`/`---`)
5. Detects language from file extension via `detectLanguage()` supporting 30+ extensions

### CLI Command

**Command:** `codeplane change diff [id]`

| Argument/Option | Type | Required | Default | Description |
|-----------------|------|----------|---------|-------------|
| `id` | positional arg | No | `@` | Change ID to diff; defaults to working copy |
| `--repo` | option | No | Auto-detected | Repository in `OWNER/REPO` format |

**Default output:** Raw diff text (human-readable, pipeable)

**JSON output (`--json`):**
```json
{
  "change_id": "@",
  "diff": "diff --git a/file.ts b/file.ts\n..."
}
```

### TUI UI

The TUI diff screen is a full-screen view with three zones:

**Layout:**
- **File tree sidebar** (25% width, collapsible with `Ctrl+B`): Shows all files with change type icons (`A`=green, `D`=red, `M`=yellow, `R`=blue, `C`=cyan) and per-file stat summaries (`+N -M`). Binary files show `[bin]` suffix. Navigated with `j`/`k`, selected with `Enter`.
- **Main diff content area** (remaining width): Renders file headers, hunk headers (cyan `@@`), and diff lines with syntax highlighting. Supports unified and split modes.
- **Status bar** (bottom row): Shows current file position ("File 3/12"), view mode ("unified"/"split"), whitespace state, and key hint.

**View Modes:**
- **Unified (default):** Single column with old line numbers (left) and new line numbers (right). Added lines have green background with `+` prefix. Deleted lines have red background with `-` prefix. Context lines in default colors.
- **Split:** Left pane shows old content (deletions in red), right pane shows new content (additions in green). Filler lines inserted for vertical alignment. Synchronized scrolling. Requires ≥120 columns.

**Syntax Highlighting:**
- Tree-sitter-based highlighting via the `@opentui/core` `SyntaxStyle` system
- Three color tier fallbacks: Truecolor (24-bit), ANSI 256, ANSI 16 — auto-detected from `COLORTERM`/`TERM` environment variables
- 17 syntax token types with palette-appropriate colors
- Diff sign colors (`+`/`-`) always use diff-specific colors, not syntax colors
- Hunk headers always render in cyan, not affected by syntax highlighting

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `t` | Toggle unified/split view |
| `]` / `[` | Next/previous file |
| `j` / `k` | Scroll down/up |
| `Ctrl+D` / `Ctrl+U` | Half-page down/up |
| `G` | Jump to bottom |
| `g g` | Jump to top |
| `w` | Toggle whitespace visibility (re-fetches from API) |
| `l` | Toggle line numbers |
| `z` | Collapse current hunk |
| `x` | Expand all hunks in current file |
| `Z` | Collapse all hunks in all files |
| `X` | Expand all hunks in all files |
| `c` | Create inline comment (landing request context only) |
| `Ctrl+B` | Toggle sidebar |
| `R` | Retry failed fetch |
| `q` / `Esc` | Close screen |
| `?` | Show help overlay |
| `:` | Open command palette |

### Documentation

The following end-user documentation should be written:

1. **API reference page** for `GET /api/repos/:owner/:repo/changes/:change_id/diff` — including all parameters, response schema, error codes, and curl examples
2. **CLI reference page** for `codeplane change diff` — including usage, options, output formats, and examples for piping/scripting
3. **TUI guide section** on the diff viewer — covering navigation, view modes, keyboard shortcuts, and syntax highlighting behavior
4. **Conceptual guide** on jj change diffs vs git commit diffs — explaining how Codeplane's diff is anchored to change IDs rather than commit SHAs, and how this interacts with jj's rewriting model where change IDs remain stable across rewrites

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Anonymous | Can view diffs for public repositories |
| Read-only member | Can view diffs for repositories they have read access to |
| Member / Write | Can view diffs |
| Admin | Can view diffs |
| Owner | Can view diffs |

No elevated permissions are required to view a diff. The diff endpoint inherits the repository's visibility and access control model. If a repository is private, the user must be authenticated and have at least read access.

### Rate Limiting

- **Authenticated users:** 300 requests/minute per user per repository
- **Anonymous users:** 60 requests/minute per IP per repository
- **Rationale:** Diffs can be computationally expensive (jj subprocess execution + parsing). The rate limit prevents abuse such as exhaustive enumeration of change history or denial-of-service via rapid large-diff requests.

### Data Privacy

- Diff content reflects source code, which may contain secrets, PII, or proprietary logic. The diff endpoint must respect the same access control as the repository itself.
- No diff content should be cached in shared/public caches. Responses must include `Cache-Control: private` for authenticated requests and appropriate `Vary: Authorization` headers.
- Change IDs are stable identifiers; they must not be logged at levels that could be scraped from production log stores by unauthorized users. Log at `debug` level only.
- The `old_content` and `new_content` fields (if populated in future) must never be indexed in full-text search without explicit repository-level consent.

### Input Sanitization

- `change_id`, `owner`, and `repo` parameters are sanitized against path traversal (`..`, `/`) before being used in filesystem paths or jj CLI arguments
- jj commands are invoked with `JJ_CONFIG: "ui.pager=false\nui.color=never"` to prevent escape sequence injection from jj output
- No user-supplied strings are interpolated into shell commands; all arguments are passed as array elements to `Bun.spawn()`

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeDiffViewed` | Successful 200 response from diff endpoint | `owner`, `repo`, `change_id`, `file_count`, `total_additions`, `total_deletions`, `has_binary_files`, `whitespace_ignored`, `client` (web/cli/tui/editor), `response_time_ms` |
| `ChangeDiffFailed` | Non-200 response from diff endpoint | `owner`, `repo`, `change_id`, `error_status`, `error_message`, `client` |
| `DiffViewModeToggled` | User toggles unified/split in TUI or web | `from_mode`, `to_mode`, `client` |
| `DiffWhitespaceToggled` | User toggles whitespace filtering | `new_state` (`visible`/`hidden`), `client` |
| `DiffFileNavigated` | User navigates to a specific file in diff | `file_index`, `total_files`, `navigation_method` (`sidebar_click`/`keyboard_next`/`keyboard_prev`), `client` |
| `DiffPatchCopied` | User copies patch to clipboard | `file_count`, `total_lines`, `client` |

### Funnel Metrics

- **Diff engagement rate:** % of change detail views that lead to a diff view (target: >40%)
- **Multi-file navigation rate:** % of diff sessions where user navigates to ≥2 files (indicates rich usage beyond glancing)
- **View mode preference distribution:** ratio of unified vs split usage, informing defaults
- **Whitespace toggle usage rate:** indicates whether the feature is discoverable and needed
- **Diff-to-landing-request conversion:** % of diff views that lead to a landing request creation within 30 minutes (key collaboration metric)

### Success Indicators

- P95 response time for change diff API ≤ 500ms for repositories with ≤100 changed files
- Error rate ≤ 0.1% for well-formed requests against existing repositories
- Zero data exposure incidents from diff content leaking outside repository access boundaries

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------|  
| Diff request received | `info` | `owner`, `repo`, `change_id_prefix` (first 8 chars only), `whitespace`, `request_id`, `user_id` (if authed) |
| jj subprocess started | `debug` | `command`, `repo_path`, `request_id` |
| jj subprocess completed | `debug` | `exit_code`, `stdout_bytes`, `stderr_bytes`, `duration_ms`, `request_id` |
| Diff parse started | `debug` | `raw_output_bytes`, `request_id` |
| Diff parse completed | `debug` | `file_count`, `total_additions`, `total_deletions`, `binary_file_count`, `parse_duration_ms`, `request_id` |
| Diff request completed | `info` | `status_code`, `file_count`, `response_bytes`, `total_duration_ms`, `request_id` |
| Change not found | `warn` | `owner`, `repo`, `change_id_prefix`, `jj_stderr`, `request_id` |
| jj command failure | `error` | `owner`, `repo`, `change_id_prefix`, `exit_code`, `jj_stderr`, `request_id` |
| Parse failure | `error` | `raw_header_sample` (first 200 chars), `error_message`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_diff_requests_total` | Counter | `status`, `owner` | Total diff API requests by HTTP status |
| `codeplane_change_diff_duration_seconds` | Histogram | `phase` (`jj_exec`, `parse`, `total`) | Duration of diff operations by phase |
| `codeplane_change_diff_file_count` | Histogram | — | Number of files per diff response |
| `codeplane_change_diff_size_bytes` | Histogram | — | Response payload size in bytes |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command` | Duration of jj subprocess calls |
| `codeplane_jj_subprocess_errors_total` | Counter | `command`, `exit_code` | jj subprocess failures |

### Alerts

#### `ChangeDiffHighErrorRate`
- **Condition:** `rate(codeplane_change_diff_requests_total{status=~"5.."}[5m]) / rate(codeplane_change_diff_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_jj_subprocess_errors_total` — if elevated, the jj binary may be unavailable, corrupted, or the repository disk is full
  2. SSH into the server and run `jj version` to verify the jj binary is functional
  3. Check disk usage on the repos data directory (`CODEPLANE_DATA_DIR/repos/`)
  4. Check recent deploy logs for jj version changes that may have introduced breaking CLI output format changes
  5. Inspect structured logs for the `jj_stderr` field to identify the specific error pattern
  6. If a single repository is causing all errors, check if its `.jj` directory is corrupted; consider re-importing from git with `jj git import`

#### `ChangeDiffHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_change_diff_duration_seconds_bucket{phase="total"}[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check which phase is slow via `codeplane_change_diff_duration_seconds` broken down by `phase`
  2. If `jj_exec` is slow: check server CPU/IO; very large diffs (1000+ files) are expected to be slow — verify if a single repo is causing the spike
  3. If `parse` is slow: check for unusually large diff output; a 100MB diff output indicates a binary file was not properly detected
  4. Consider adding a file-count warning at the API layer for diffs exceeding 500 files
  5. Check if the jj operation log shows a long-running concurrent operation that is holding a lock

#### `JJSubprocessTimeout`
- **Condition:** `rate(codeplane_jj_subprocess_errors_total{exit_code="-1"}[5m]) > 0`
- **Severity:** Critical
- **Runbook:**
  1. A `-1` exit code indicates the subprocess was killed (timeout or OOM)
  2. Check server memory usage — jj diff on very large repositories can consume significant memory
  3. Check for zombie jj processes: `ps aux | grep jj`
  4. Verify the subprocess timeout configuration is reasonable (default: 30s)
  5. If recurring on specific repos, investigate repo size and consider adding a size guard

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| jj binary not found | Exit code 127 | All diff requests fail | Health check should verify jj presence at startup; alert on first failure |
| Repository `.jj` dir corrupted | jj exits with non-zero, stderr contains "corrupt" | Single repo affected | Re-init from colocated git backend |
| Concurrent jj operation lock | jj exits with lock-related error | Temporary per-repo failure | Retry with backoff; return 503 to client |
| Diff output exceeds memory | Process OOM | Server instability | Set subprocess stdout limit; stream parsing for very large diffs |
| Path traversal in change_id | Sanitization check | Potential directory escape | Input validation rejects `..` and `/` in change_id parameter |
| Malformed jj output (version skew) | Parse returns 0 files for non-empty diff | Silent data loss | Log raw output sample; validate file_count > 0 when jj exit code was 0 and stdout was non-empty |

## Verification

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| `API-DIFF-001` | `GET /api/repos/:owner/:repo/changes/:change_id/diff` returns 200 with valid `ChangeDiffResponse` for a change that modifies a single file |
| `API-DIFF-002` | Response `file_diffs[0]` contains correct `path`, `change_type: "modified"`, non-empty `patch`, `is_binary: false`, and accurate `additions`/`deletions` counts |
| `API-DIFF-003` | A change that adds a new file returns `change_type: "added"` and `deletions: 0` |
| `API-DIFF-004` | A change that deletes a file returns `change_type: "deleted"` and `additions: 0` |
| `API-DIFF-005` | A change that renames a file returns `change_type: "renamed"`, populates `old_path`, and the `path` is the new name |
| `API-DIFF-006` | A change that copies a file returns `change_type: "copied"` with both `path` and `old_path` |
| `API-DIFF-007` | A change that modifies a binary file returns `is_binary: true` and `patch` is null/empty |
| `API-DIFF-008` | A change that touches 0 files (empty change) returns `{ change_id: "...", file_diffs: [] }` |
| `API-DIFF-009` | `?whitespace=ignore` excludes whitespace-only changes from the response |
| `API-DIFF-010` | `?whitespace=hide` behaves identically to `?whitespace=ignore` |
| `API-DIFF-011` | `?whitespace=invalid_value` is ignored (treated as unset); response includes all changes |
| `API-DIFF-012` | Missing `change_id` (empty path segment) returns HTTP 400 |
| `API-DIFF-013` | Non-existent `change_id` returns HTTP 404 with descriptive error message |
| `API-DIFF-014` | Non-existent repository returns HTTP 404 |
| `API-DIFF-015` | Missing `owner` returns HTTP 400 |
| `API-DIFF-016` | Missing `repo` returns HTTP 400 |
| `API-DIFF-017` | Authenticated user can view diff on a private repo they have read access to |
| `API-DIFF-018` | Unauthenticated user gets 401 on a private repo |
| `API-DIFF-019` | Authenticated user without repo access gets 403 on a private repo |
| `API-DIFF-020` | Anonymous user can view diff on a public repo |
| `API-DIFF-021` | `language` field is correctly populated for known file extensions (`.ts` → `"typescript"`, `.py` → `"python"`, `.rs` → `"rust"`) |
| `API-DIFF-022` | `language` field is null/undefined for files with no recognized extension |
| `API-DIFF-023` | A change touching 100+ files returns all files in a single response |
| `API-DIFF-024` | A change with a file that has a very long path (4096 characters) is returned correctly |
| `API-DIFF-025` | A change with unicode characters in file paths and content is returned correctly |
| `API-DIFF-026` | A change where a file contains literal `diff --git` text inside its content does not corrupt the parsed output |
| `API-DIFF-027` | Response time is ≤2 seconds for a change with ≤50 modified files |
| `API-DIFF-028` | Rate limiting returns 429 after exceeding the configured request limit |
| `API-DIFF-029` | `change_id` containing `..` is rejected or sanitized (returns 400 or 404, not a filesystem error) |
| `API-DIFF-030` | A diff for `@` (working copy shorthand) resolves correctly when passed as `change_id` |

### CLI Integration Tests

| Test ID | Description |
|---------|-------------|
| `CLI-DIFF-001` | `codeplane change diff` (no argument) outputs the diff for the working copy (`@`) |
| `CLI-DIFF-002` | `codeplane change diff <valid_id>` outputs the diff for the specified change |
| `CLI-DIFF-003` | `codeplane change diff <invalid_id>` exits with non-zero status and a human-readable error |
| `CLI-DIFF-004` | `codeplane change diff --json` outputs valid JSON with `change_id` and `diff` fields |
| `CLI-DIFF-005` | `codeplane change diff --json <id>` outputs JSON for the specified change |
| `CLI-DIFF-006` | Output of `codeplane change diff` is pipeable (no ANSI escape codes in non-TTY mode) |
| `CLI-DIFF-007` | `codeplane change diff --repo owner/repo <id>` fetches the diff from a remote repository via API |
| `CLI-DIFF-008` | `codeplane change diff` in a directory without a jj repo exits with a descriptive error |

### TUI E2E Tests

| Test ID | Description |
|---------|-------------|
| `TUI-DIFF-001` | Navigating to a change diff screen renders the file tree sidebar and diff content |
| `TUI-DIFF-002` | File tree shows correct change type indicators (A/D/M/R/C) with proper colors |
| `TUI-DIFF-003` | Clicking/selecting a file in the sidebar scrolls the diff content to that file |
| `TUI-DIFF-004` | `]` navigates to the next file; `[` navigates to the previous file |
| `TUI-DIFF-005` | File navigation wraps from last to first file (and vice versa) |
| `TUI-DIFF-006` | Pressing `t` toggles from unified to split view |
| `TUI-DIFF-007` | Pressing `t` again toggles back to unified view |
| `TUI-DIFF-008` | Split view is rejected with a flash message when terminal width < 120 |
| `TUI-DIFF-009` | `w` toggles whitespace filtering; status bar updates to reflect the state |
| `TUI-DIFF-010` | `l` toggles line number display |
| `TUI-DIFF-011` | `z` collapses the current hunk; collapsed hunk shows summary line |
| `TUI-DIFF-012` | `x` expands all hunks in the current file |
| `TUI-DIFF-013` | `Z` collapses all hunks across all files |
| `TUI-DIFF-014` | `X` expands all hunks across all files |
| `TUI-DIFF-015` | `Ctrl+B` hides the sidebar; pressing again restores it |
| `TUI-DIFF-016` | `j`/`k` scrolls the diff content up/down |
| `TUI-DIFF-017` | `Ctrl+D`/`Ctrl+U` scrolls half-page down/up |
| `TUI-DIFF-018` | `G` jumps to the end; `gg` jumps to the top |
| `TUI-DIFF-019` | In split view, scrolling is synchronized between left and right panes |
| `TUI-DIFF-020` | Binary files display "Binary file changed" message, not patch content |
| `TUI-DIFF-021` | Empty diff (no files) shows "No changes" message |
| `TUI-DIFF-022` | `R` retries a failed diff fetch |
| `TUI-DIFF-023` | `q` closes the diff screen and returns to the previous view |
| `TUI-DIFF-024` | `?` shows the keyboard help overlay |

### TUI Syntax Highlighting Tests (existing suite)

| Test ID | Description |
|---------|-------------|
| `SNAP-SYN-010` | Renders syntax highlighting at 80×24 minimum |
| `SNAP-SYN-001` | Renders TypeScript diff with full syntax colors at 120×40 |
| `SNAP-SYN-004` | Addition lines have green background with visible syntax colors |
| `SNAP-SYN-005` | Deletion lines have red background with visible syntax colors |
| `SNAP-SYN-007` | Unknown language falls back to plain text |
| `SNAP-SYN-011` | Multi-language diff uses per-file highlighting |
| `SNAP-SYN-012` | Hunk headers render in cyan, unaffected by syntax highlighting |
| `SNAP-SYN-013` | Diff signs (`+`/`-`) use diff colors, not syntax colors |
| `KEY-SYN-001` | Syntax highlighting persists after view mode toggle |
| `KEY-SYN-003` | File navigation applies correct per-file language |
| `KEY-SYN-008` | Rapid file navigation settles on correct highlighting |
| `KEY-SYN-009` | Scrolling through highlighted diff is smooth |
| `RSP-SYN-004` | Terminal resize preserves syntax highlighting |
| `INT-SYN-001` | API `language` field takes precedence for filetype resolution |
| `INT-SYN-002` | Path fallback when API language is null |
| `INT-SYN-006` | Dockerfile detected by basename |
| `INT-SYN-008` | Double extension resolves correctly |
| `INT-SYN-009` | Binary file skips syntax highlighting |
| `EDGE-SYN-001` | Syntax highlighting does not block scrolling |
| `EDGE-SYN-003` | SyntaxStyle cleanup on screen unmount (no crash) |
| `EDGE-SYN-005` | 10+ languages in single diff all highlight correctly |

### SDK/Parser Integration Tests

| Test ID | Description |
|---------|-------------|
| `SDK-DIFF-001` | `parseGitDiff` correctly parses a single added file diff |
| `SDK-DIFF-002` | `parseGitDiff` correctly parses a single deleted file diff |
| `SDK-DIFF-003` | `parseGitDiff` correctly parses a modified file diff with accurate addition/deletion counts |
| `SDK-DIFF-004` | `parseGitDiff` correctly handles renamed files (sets `old_path` and `change_type: "renamed"`) |
| `SDK-DIFF-005` | `parseGitDiff` correctly handles copied files |
| `SDK-DIFF-006` | `parseGitDiff` detects binary files and sets `is_binary: true` |
| `SDK-DIFF-007` | `parseGitDiff` returns empty array for empty input |
| `SDK-DIFF-008` | `parseGitDiff` handles multi-file diff with mixed change types |
| `SDK-DIFF-009` | `detectLanguage` maps `.ts` → `typescript`, `.py` → `python`, `.rs` → `rust`, `.go` → `go` |
| `SDK-DIFF-010` | `detectLanguage` returns empty string for unknown extensions |
| `SDK-DIFF-011` | `parseGitDiff` handles a diff with 500+ files without error |
| `SDK-DIFF-012` | `parseGitDiff` handles a file with 10,000+ changed lines and returns correct counts |
| `SDK-DIFF-013` | `parseGitDiff` does not crash when diff content contains `diff --git` as literal text |
| `SDK-DIFF-014` | `RepoHostService.getChangeDiff` returns `Result.err(notFound(...))` for a non-existent change ID |
| `SDK-DIFF-015` | `RepoHostService.getChangeDiff` returns `Result.err(notFound(...))` for a non-existent repository |

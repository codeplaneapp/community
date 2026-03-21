# JJ_DIFF_UNIFIED_VIEW

Specification for JJ_DIFF_UNIFIED_VIEW.

## High-Level User POV

When you open a diff for any jj change or landing request in Codeplane, the unified view is the default way you see what changed. It presents every modification in a single, vertically scrollable column where removed lines and added lines appear directly adjacent to each other, surrounded by a few lines of unchanged context. This is the same mental model as running `jj diff` in your terminal — but rendered with rich syntax highlighting, line numbers, a file tree sidebar, and structured keyboard or mouse navigation, regardless of whether you're in the web browser, the terminal UI, or the desktop app.

The unified view is optimized for reading diffs the way most developers already think about them: top to bottom, file by file, hunk by hunk. You can see exactly which lines were removed (shown in red) and which were added (shown in green), with the old and new line numbers displayed side by side in a gutter so you can correlate changes to source locations in either version of the file. Context lines — the unchanged code around each modification — appear in the default text color, giving you orientation within the file without distracting from the actual changes.

Multi-file diffs are broken into per-file sections. Each section starts with a file header showing the filename, the type of change (added, deleted, modified, renamed, or copied), and a compact summary of how many lines were added and removed. A file tree sidebar lets you see every touched file at a glance and jump directly to any file. Within each file, hunks — the distinct blocks of modified lines — are separated by hunk headers that show the line ranges and, when available, the enclosing function or scope name.

The unified view is the only layout available at compact display sizes (below 120 columns in the TUI, or narrow browser windows). At wider sizes, you can toggle to a side-by-side split view with a single keypress or click, but the system always starts in unified mode. You can also toggle whitespace visibility to hide formatting-only noise, collapse or expand hunks to focus on specific sections, and toggle line numbers on or off. The unified view works identically whether you're inspecting a standalone change or reviewing a landing request, and inline comments (for landing request reviews) appear embedded between the diff lines.

The unified diff view is a read-only inspection surface. It doesn't modify repository state. Its purpose is to let you quickly and confidently understand what a change does before you decide to land it, review it, or build on top of it.

## Acceptance Criteria

### Definition of Done

- [ ] The unified view is the default rendering mode whenever a diff is displayed across all client surfaces (Web UI, TUI, Desktop)
- [ ] Diff data is fetched from `GET /api/repos/:owner/:repo/changes/:change_id/diff` for change diffs
- [ ] Diff data is fetched from `GET /api/repos/:owner/:repo/landings/:number/diff` for landing request diffs
- [ ] Each file's diff is rendered as an interleaved single-column layout: removed lines (red background, `−` glyph), added lines (green background, `+` glyph), and context lines (default background)
- [ ] A two-column line number gutter displays the old file line number (left) and new file line number (right)
- [ ] Added lines show a line number only in the right (new) column; removed lines show only in the left (old) column; context lines show both
- [ ] Per-file headers display: filename, change type indicator (added/deleted/modified/renamed/copied), and `+N −M` addition/deletion summary
- [ ] Hunk headers render with line range information (e.g., `@@ -42,7 +42,12 @@`) and enclosing scope name when available
- [ ] Syntax highlighting is applied to all code lines, with language detection from file extension
- [ ] Binary files display a "Binary file — cannot display diff" placeholder instead of patch content
- [ ] Empty diffs (0 files changed) display "No file changes in this diff." in muted text
- [ ] The user can toggle to split view via `t` key (TUI) or a toggle control (Web UI), only when display width ≥ 120 columns
- [ ] The user can toggle whitespace filtering via `w` key (TUI) or a toggle control (Web UI), which re-fetches the diff with the `whitespace=ignore` query parameter
- [ ] The user can toggle line number visibility via `l` key (TUI) or a toggle control (Web UI)
- [ ] The user can collapse/expand hunks individually and in bulk
- [ ] File navigation (next/previous file) works with `]`/`[` keys (TUI) or click-to-jump (Web UI)
- [ ] The unified view is scrollable with line-by-line and page-based controls
- [ ] All five change types are rendered correctly: added, deleted, modified, renamed, copied
- [ ] Renamed and copied files display both old and new paths in the file header
- [ ] The status bar (TUI) or toolbar (Web UI) displays current view mode ("Unified"), whitespace state, and file position
- [ ] All existing e2e tests pass without being skipped or commented out

### Input Validation & Boundary Constraints

- [ ] `change_id` must be a non-empty, trimmed string; empty or whitespace-only values return HTTP 400
- [ ] `change_id` values containing path-traversal patterns (`..`, `/`) are rejected before reaching the jj subprocess
- [ ] `owner` and `repo` path parameters must be non-empty, trimmed strings; empty values return HTTP 400
- [ ] The `whitespace` query parameter accepts only `ignore`, `hide`, or empty/absent; unrecognized values are treated as absent (no error, no filtering)
- [ ] File paths in the response must not exceed 4,096 characters
- [ ] Patch content for a single file is unbounded but the total response is subject to the server's max response size (configurable, default 50 MB)
- [ ] Change IDs that do not resolve in the repository return HTTP 404 with a descriptive error message
- [ ] Repositories that do not exist return HTTP 404
- [ ] Line numbers support files up to 999,999 lines (6-digit gutter maximum)
- [ ] Diff content is truncated at 100,000 total lines with a visible truncation message to prevent memory exhaustion
- [ ] Filenames in file headers are truncated from the left with `…/` prefix when display width is insufficient (max 255 characters)
- [ ] Hunk scope names are truncated with `…` at 40 characters in standard width; hidden at minimum width

### Edge Cases

- [ ] A change that touches 0 files returns `{ change_id: "...", file_diffs: [] }` and the viewer displays "No file changes in this diff."
- [ ] A change that touches 500+ files returns all files without artificial truncation (within the response size limit)
- [ ] A change with mixed binary and text files correctly flags each file individually — binary files show placeholder, text files render patches
- [ ] Renamed files include both `path` (new) and `old_path` (old) in the file header
- [ ] Copied files include both `path` (new) and `old_path` (source) in the file header
- [ ] A file with no extension returns an empty or undefined `language` field and renders without syntax highlighting (plain text)
- [ ] Files named `Dockerfile`, `Makefile`, etc. are detected by basename, not extension
- [ ] A file with a double extension (e.g., `component.test.tsx`) resolves language from the final extension
- [ ] Diff output that contains literal `diff --git` inside file content does not break the parser
- [ ] Unicode file paths and content (including CJK and emoji) are handled correctly; wide characters occupy 2 columns
- [ ] Tab characters are rendered as 4 spaces
- [ ] Requesting a diff while the repository is locked by a concurrent jj operation returns a retriable 503 error
- [ ] A diff with only whitespace changes, when whitespace filtering is active, shows "No visible changes (whitespace hidden)"
- [ ] A diff with a file containing 999,999 lines renders with a 6-digit gutter without layout breakage
- [ ] Navigating files wraps around: last → first, first → last
- [ ] Rapid scroll input is processed sequentially without dropping keypresses
- [ ] Terminal or browser resize mid-scroll preserves scroll position relative to line offset
- [ ] Malformed or empty patch strings render as plain text without crashing
- [ ] Concurrent resize and scroll operations do not cause render crashes

## Design

### Web UI Design

**Route:** `/:owner/:repo/changes/:change_id` (Diff tab) and `/:owner/:repo/landings/:number` (Diff tab)

**Layout:**
The web UI diff viewer occupies the main content area below the repository header. It consists of:

1. **Toolbar row** — Contains the view mode toggle (Unified / Split buttons), whitespace toggle checkbox ("Hide whitespace"), line number toggle, and expand/collapse all buttons. The currently active view mode is visually distinguished (primary color background, bold text).

2. **File tree sidebar** (collapsible, left, 25% width) — Lists all changed files with change-type badges (A/D/M/R/C in colored pills) and per-file `+N −M` stats. Clicking a file scrolls the diff content to that file's section. The currently viewed file is highlighted. A collapse button hides the sidebar.

3. **Diff content area** (scrollable, 75% width or full width when sidebar collapsed):
   - Per-file sections, each starting with a sticky file header bar showing: filename (or `old → new` for renames), change type badge, and `+N −M` summary.
   - Hunk headers in a distinct style (monospace, muted background) showing `@@ line ranges @@` and scope name.
   - Line-by-line diff content with two-column line number gutter (old/new) and interleaved added/removed/context lines.
   - "Binary file — cannot display diff" placeholder for binary files.
   - "Copy patch" button per-file in the file header to copy raw patch to clipboard.

**Color scheme:**
- Added lines: `#1a4d1a` background, `#22c55e` sign glyph color
- Removed lines: `#4d1a1a` background, `#ef4444` sign glyph color
- Context lines: default background, default foreground
- Hunk headers: `#2d333b` background, `#768390` text color
- Line number gutter: `#6b7280` foreground, `#161b22` background
- Added line number background: `#0d3a0d`
- Removed line number background: `#3a0d0d`

**Interactions:**
- Clicking a file in the sidebar scrolls to that file section
- Clicking a hunk header collapses/expands that hunk
- Toolbar toggles switch between unified/split view, whitespace on/off, line numbers on/off
- "Expand all" / "Collapse all" buttons affect all hunks
- Scroll position is preserved when toggling view mode
- Diff preferences (view mode, whitespace, line numbers) are persisted in a browser-side store and applied on next visit

### TUI UI Design

The TUI unified view is the default rendering mode. Layout at three breakpoints:

- **80×24 (minimum):** No sidebar. 4+4 char (8ch) line number gutter. Word wrap forced. Filename truncated with `…/`. Hunk scope name hidden. Status bar abbreviated.
- **120×40 (standard):** Sidebar available (25%/30ch). 5+5 char (10ch) gutter. No wrap. Full filename. Hunk scope names visible (truncated at 40ch). `t` enables split view toggle.
- **200×60 (large):** 6+6 char (12ch) gutter. Extra context lines (5 instead of 3). Full file paths. Full status bar hints.

**Components:** Uses the OpenTUI `<diff>` component with `view="unified"`, `filetype`, `syntaxStyle`, and color props. Syntax highlighting via tree-sitter with automatic color tier detection (truecolor → ANSI256 → ANSI16).

**Keyboard reference:**

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Scroll down one line | Diff content focused |
| `k` / `Up` | Scroll up one line | Diff content focused |
| `Ctrl+D` | Scroll down half page | Diff content focused |
| `Ctrl+U` | Scroll up half page | Diff content focused |
| `G` | Jump to bottom | Diff content focused |
| `g g` | Jump to top | Diff content focused |
| `]` | Next file | Multi-file diff |
| `[` | Previous file | Multi-file diff |
| `l` | Toggle line numbers | Always |
| `w` | Toggle whitespace | Always |
| `t` | Toggle to split view | Terminal ≥ 120 columns |
| `z` | Collapse all hunks | Always |
| `x` | Expand all hunks | Always |
| `Enter` | Toggle hunk collapse | Cursor on hunk header |
| `R` | Retry fetch | Error state |
| `?` | Help overlay | Always |
| `q` | Pop screen | Always |
| `:` | Command palette | Always |
| `Esc` | Close overlay or pop | Always |
| `Ctrl+B` | Toggle sidebar | Terminal ≥ 120 columns |

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/changes/:change_id/diff`

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `owner` | path | string | Yes | Repository owner username or org slug |
| `repo` | path | string | Yes | Repository name |
| `change_id` | path | string | Yes | jj change ID (short or full-length hex) |
| `whitespace` | query | string | No | `ignore` or `hide` to exclude whitespace-only changes |

**Success response (200):**
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
    }
  ]
}
```

**Error responses:** 400 (invalid params), 401 (auth required), 403 (insufficient perms), 404 (repo/change not found), 500 (jj failure), 503 (repo locked)

**Landing diff endpoint:** `GET /api/repos/:owner/:repo/landings/:number/diff` — returns `{ landing_number, changes: [{ change_id, file_diffs }] }` with `?ignore_whitespace=true` query param.

### SDK Shape

```typescript
interface ChangeDiff {
  change_id: string;
  file_diffs: FileDiffItem[];
}

interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: "added" | "deleted" | "modified" | "renamed" | "copied";
  patch?: string;
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}

// RepoHostService
async getChangeDiff(owner: string, repo: string, changeId: string): Promise<Result<ChangeDiff, APIError>>
```

### CLI Command

**Command:** `codeplane change diff [change_id]`

- Defaults to `@` (working copy) when no change ID is provided
- Default output: raw unified diff text, suitable for piping
- `--json` flag: returns structured `{ change_id, diff }` payload
- `--whitespace ignore` flag: filters whitespace-only changes
- Exit codes: 0 success, 1 error, 2 not found

### Documentation

1. **Web UI Diff Viewer Guide** — How to navigate diffs in the web UI: toggling between unified and split view, using the file tree, collapsing/expanding hunks, toggling whitespace and line numbers, copying patches. Include annotated screenshots.
2. **TUI Diff Viewer Guide** — Keybinding reference card for the TUI diff viewer. Explain all keyboard shortcuts, responsive behavior, and how to navigate multi-file diffs.
3. **CLI `change diff` Reference** — Man-page-style documentation for `codeplane change diff`, including all flags, default behavior, and output formats.
4. **API Reference: Change Diff** — OpenAPI-style documentation for `GET /api/repos/:owner/:repo/changes/:change_id/diff` with request/response examples and error codes.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View diff on public repo | ✅ | ✅ | ✅ | ✅ | ✅ |
| View diff on private repo | ❌ | ✅ | ✅ | ✅ | ✅ |
| View landing diff on public repo | ✅ | ✅ | ✅ | ✅ | ✅ |
| View landing diff on private repo | ❌ | ✅ | ✅ | ✅ | ✅ |

- The unified diff viewer is strictly read-only. No write operations are performed from any diff-viewing surface.
- `GET` diff endpoints respect repository visibility settings. Private repositories require at minimum read-level access.
- The diff viewer does not expose or render repository secrets, environment variables, or credential files. However, diff content itself may contain sensitive code — this is inherent to the data and not controllable by the viewer.

### Rate Limiting

- `GET /api/repos/:owner/:repo/changes/:change_id/diff`: 300 requests/minute per authenticated user; 60 requests/minute for anonymous (public repos)
- `GET /api/repos/:owner/:repo/landings/:number/diff`: 300 requests/minute per authenticated user; 60 requests/minute for anonymous
- 429 responses include a `Retry-After` header and display an inline message: "Rate limited. Retry in {N}s."
- No automatic retry. User must explicitly press `R` (TUI) or click retry (Web UI) after the cooldown.
- Client-side in-memory caching prevents redundant fetches when navigating back to a previously viewed diff within the same session.

### Data Privacy & PII

- Auth tokens are passed via `Authorization: Bearer` header and are never logged, displayed, or included in error messages.
- Diff content is cached in memory only (not written to disk) in the TUI to prevent credential-adjacent data leakage.
- Change IDs and landing numbers are not PII but are logged in structured telemetry.
- Filenames may contain usernames or project names — these are inherent to the repository and are not treated as PII exposure by the viewer.

### Token-based Auth

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at TUI bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Input Sanitization

- No user input is sent to the API from the diff viewer (read-only display)
- Diff content, filenames, and hunk headers rendered through component built-in sanitization
- Change IDs and landing numbers validated as expected formats before API calls
- Change IDs are sanitized to reject path-traversal patterns before passing to the jj subprocess

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `diff.unified.viewed` | Unified diff screen/view loaded with data | `client` (web/tui/desktop), `repo`, `change_id`, `landing_number` (if applicable), `file_count`, `total_additions`, `total_deletions`, `total_lines`, `viewport_width`, `viewport_height`, `load_time_ms`, `entry_point` (change_list/landing_detail/deep_link/command_palette) |
| `diff.unified.file_navigated` | User navigates to a different file | `client`, `repo`, `change_id`, `from_file`, `to_file`, `file_index`, `total_files`, `direction` (next/prev/click), `method` (keyboard/mouse) |
| `diff.unified.whitespace_toggled` | Whitespace visibility toggled | `client`, `repo`, `change_id`, `whitespace_visible` (bool), `file_count_before`, `file_count_after` |
| `diff.unified.line_numbers_toggled` | Line number visibility toggled | `client`, `repo`, `change_id`, `line_numbers_visible` (bool) |
| `diff.unified.view_toggled` | View mode switched from unified to split | `client`, `repo`, `change_id`, `from_view`, `to_view`, `viewport_width` |
| `diff.unified.hunk_collapsed` | Hunk collapse/expand action | `client`, `repo`, `change_id`, `action` (collapse_all/expand_all/toggle_single), `file`, `hunk_count` |
| `diff.unified.scroll` | Scroll position change (throttled to 1 event/2s) | `client`, `repo`, `change_id`, `scroll_pct`, `direction`, `method` (line/page/jump) |
| `diff.unified.patch_copied` | Raw patch copied to clipboard | `client`, `repo`, `change_id`, `file`, `patch_length` |
| `diff.unified.error` | Diff fetch failed | `client`, `repo`, `change_id`, `landing_number`, `error_type`, `http_status` |
| `diff.unified.retry` | User retried a failed fetch | `client`, `repo`, `change_id`, `retry_success` (bool) |
| `diff.unified.exited` | User navigated away from diff view | `client`, `repo`, `change_id`, `time_spent_ms`, `files_viewed`, `total_files`, `max_scroll_depth_pct` |

### Common Properties (all events)

- `session_id`, `timestamp`, `user_id` (if authenticated), `client_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Diff load completion rate | >98% | Core readiness — diffs that fail to load block code review entirely |
| Mean time to interactive | <800ms | Perceived performance — users abandon slow diff viewers |
| File navigation usage (multi-file diffs) | >60% of multi-file views | Navigation feature discoverability |
| Whitespace toggle usage | >8% of views | Feature awareness — proves users know the toggle exists |
| Hunk collapse usage | >15% of views | Feature awareness — important for large diffs |
| Split view toggle rate | >20% of views at ≥120 width | Feature awareness — shows users explore view options |
| Error rate | <2% | Reliability threshold |
| Retry success rate | >80% | Recovery effectiveness — transient failures should resolve |
| Average time spent on diff | >15s | Engagement depth — users are actually reading, not bouncing |
| Files viewed per session (multi-file) | >50% of files in diff | Thorough review behavior |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-----------|
| `debug` | Diff view mounted | `repo`, `change_id`, `client`, `viewport_width`, `viewport_height` |
| `debug` | Diff data loaded | `repo`, `change_id`, `file_count`, `total_lines`, `duration_ms` |
| `debug` | File navigated | `repo`, `change_id`, `file`, `index`, `total` |
| `debug` | Scroll position changed | `repo`, `change_id`, `position_pct`, `method` |
| `debug` | Line numbers toggled | `repo`, `visible` |
| `debug` | Whitespace toggled | `repo`, `visible` |
| `debug` | Hunk action | `repo`, `action`, `file` |
| `info` | Diff fully loaded and interactive | `repo`, `change_id`, `file_count`, `additions`, `deletions`, `total_ms` |
| `info` | View mode toggled | `repo`, `from_view`, `to_view`, `viewport_width` |
| `warn` | Diff fetch failed | `repo`, `change_id`, `http_status`, `error_message` |
| `warn` | Rate limited | `repo`, `change_id`, `retry_after_seconds` |
| `warn` | Diff truncated (>100,000 lines) | `repo`, `change_id`, `total_lines`, `cap` |
| `warn` | Slow load (>3s) | `repo`, `change_id`, `duration_ms` |
| `warn` | Syntax highlight fallback | `repo`, `file`, `filetype`, `reason` |
| `error` | Auth error (401) | `repo`, `http_status` |
| `error` | Render crash | `repo`, `change_id`, `error_message`, `stack_trace` |
| `error` | Diff parser failure | `repo`, `change_id`, `file`, `error_message` |

Log destination: stderr (TUI/CLI), browser console (Web UI). Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_diff_requests_total` | counter | `owner`, `repo`, `status`, `whitespace` | Total diff API requests |
| `codeplane_diff_request_duration_seconds` | histogram | `owner`, `repo`, `status` | Diff API response latency (buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_diff_response_size_bytes` | histogram | `owner`, `repo` | Diff response payload size |
| `codeplane_diff_file_count` | histogram | `owner`, `repo` | Number of files in diff responses (buckets: 1, 5, 10, 25, 50, 100, 250, 500) |
| `codeplane_diff_total_lines` | histogram | `owner`, `repo` | Total diff lines (buckets: 10, 100, 500, 1000, 5000, 10000, 50000, 100000) |
| `codeplane_diff_jj_subprocess_duration_seconds` | histogram | `owner`, `repo` | Duration of `jj diff` subprocess execution |
| `codeplane_diff_parse_duration_seconds` | histogram | `owner`, `repo` | Duration of git-format diff parsing |
| `codeplane_diff_errors_total` | counter | `owner`, `repo`, `error_type` | Diff-related errors (values: jj_failure, parse_error, timeout, not_found, locked) |
| `codeplane_diff_truncations_total` | counter | `owner`, `repo` | Diffs truncated due to line limit |

### Alerts

**Alert: DiffErrorRateHigh**
- Condition: `rate(codeplane_diff_errors_total[5m]) / rate(codeplane_diff_requests_total[5m]) > 0.05`
- Severity: Warning
- Runbook: Check `jj` binary availability and version on the server. Inspect `codeplane_diff_errors_total` labels to identify dominant error type. If `jj_failure`: check repo health, disk space, and jj version. If `parse_error`: check for unusual diff content triggering parser edge cases — inspect recent server logs for the specific file and patch content. If `timeout`: check repository size and server CPU/IO load. If `locked`: check for hung jj operations via `jj op log` and consider restarting the cleanup scheduler.

**Alert: DiffLatencyP99High**
- Condition: `histogram_quantile(0.99, rate(codeplane_diff_request_duration_seconds_bucket[5m])) > 5`
- Severity: Warning
- Runbook: Compare `codeplane_diff_jj_subprocess_duration_seconds` vs `codeplane_diff_parse_duration_seconds` to determine if latency is in jj execution or parsing. If jj is slow: check disk I/O with `iostat`, repository size, and whether the server is under concurrent load. If parsing is slow: check `codeplane_diff_total_lines` for unusually large diffs. Consider enabling response caching for hot repositories.

**Alert: DiffTruncationsSpiking**
- Condition: `rate(codeplane_diff_truncations_total[1h]) > 10`
- Severity: Info
- Runbook: Review which repositories are producing very large diffs via label cardinality. This may indicate automated tooling creating massive changes. Consider contacting repository owners or adjusting the truncation threshold if the default (100,000 lines) is too aggressive for this deployment.

**Alert: DiffSubprocessTimeout**
- Condition: `histogram_quantile(0.99, rate(codeplane_diff_jj_subprocess_duration_seconds_bucket[5m])) > 30`
- Severity: Critical
- Runbook: The jj subprocess is hanging or extremely slow. SSH into the server and check for zombie `jj` processes with `ps aux | grep jj`. Check disk I/O with `iostat`. Check if the repository's jj operation log is corrupt via `jj op log`. If a specific repository is causing issues, run `jj debug` locally. Consider restarting the Codeplane server process if jj processes cannot be recovered. Verify the cleanup scheduler is running and clearing stale locks.

### Error Cases and Failure Modes

| Error | Behavior | Recovery |
|-------|----------|---------|
| jj binary not found | 500 error, logged at `error` level | Install jj on server, restart |
| Repository does not exist | 404 response | User navigates to valid repo |
| Change ID not found | 404 response with descriptive message | User verifies change ID |
| Repository locked by concurrent operation | 503 with `Retry-After` header | User retries after delay |
| Diff output exceeds 100,000 lines | Truncated with message, logged at `warn` | Informational; consider narrower change |
| Diff parse failure (malformed output) | Falls back to raw text display, logged at `error` | Investigate jj output format change |
| Syntax highlighting failure | Falls back to plain text for that file | Automatic; no user action needed |
| Network timeout (30s) | Error state with retry prompt | User retries |
| Auth token expired | 401 → auth error screen | Re-authenticate |
| Rate limited (429) | Inline message with countdown | Wait and retry |
| Browser/terminal resize during load | Layout re-renders; fetch continues | Automatic |
| Component/render crash | Error boundary catches; "Press `r` to restart" | User restarts |
| Out of memory (very large diff) | Truncation cap prevents OOM | Automatic |

## Verification

### Test File Locations

- `e2e/api/diff.test.ts` — API-level integration tests
- `e2e/tui/diff.test.ts` — TUI unified view e2e tests
- `e2e/web/diff.test.ts` — Playwright web UI tests
- `e2e/cli/change-diff.test.ts` — CLI command tests

### API Integration Tests (22 tests)

- API-DIFF-UNI-001: `GET /changes/:change_id/diff` returns 200 with valid `ChangeDiffResponse` for a single-file modification
- API-DIFF-UNI-002: `GET /changes/:change_id/diff` returns all five change types correctly (added, deleted, modified, renamed, copied)
- API-DIFF-UNI-003: `GET /changes/:change_id/diff` returns binary file with `is_binary: true` and `patch: null`
- API-DIFF-UNI-004: `GET /changes/:change_id/diff` returns mixed binary and text files with correct flags per file
- API-DIFF-UNI-005: `GET /changes/:change_id/diff` with `?whitespace=ignore` excludes whitespace-only file changes
- API-DIFF-UNI-006: `GET /changes/:change_id/diff` with `?whitespace=hide` excludes whitespace-only changes (alias)
- API-DIFF-UNI-007: `GET /changes/:change_id/diff` with `?whitespace=invalid` ignores the parameter (no filtering, no error)
- API-DIFF-UNI-008: `GET /changes/:change_id/diff` with empty change returns `{ file_diffs: [] }`
- API-DIFF-UNI-009: `GET /changes/:change_id/diff` with renamed file includes `old_path` and `path`
- API-DIFF-UNI-010: `GET /changes/:change_id/diff` with copied file includes `old_path` and `path`
- API-DIFF-UNI-011: `GET /changes/:change_id/diff` detects language for `.ts`, `.py`, `.go`, `.rs`, `.java`, `.rb`, `.json`, `.md`, `.yaml`, `.sql`, `.sh`, `.css`, `.html`, `.vue`, `.svelte`, `.astro`, `.toml`, `.zig`, `.lua`, `.dockerfile`
- API-DIFF-UNI-012: `GET /changes/:change_id/diff` returns `language: undefined` for unknown extension
- API-DIFF-UNI-013: `GET /changes/:change_id/diff` detects `Dockerfile` and `Makefile` by basename
- API-DIFF-UNI-014: `GET /changes/:change_id/diff` handles `component.test.tsx` — resolves from final extension `.tsx`
- API-DIFF-UNI-015: `GET /changes/:change_id/diff` with missing `change_id` returns 400
- API-DIFF-UNI-016: `GET /changes/:change_id/diff` with missing `owner` returns 400
- API-DIFF-UNI-017: `GET /changes/:change_id/diff` with nonexistent repo returns 404
- API-DIFF-UNI-018: `GET /changes/:change_id/diff` with nonexistent change ID returns 404
- API-DIFF-UNI-019: `GET /changes/:change_id/diff` on private repo without auth returns 401
- API-DIFF-UNI-020: `GET /changes/:change_id/diff` on private repo with read access returns 200
- API-DIFF-UNI-021: `GET /changes/:change_id/diff` with a change touching 500+ files returns all files
- API-DIFF-UNI-022: `GET /changes/:change_id/diff` with diff content containing literal `diff --git` text does not break the parser

### TUI E2E Tests — Terminal Snapshot Tests (28 tests)

- SNAP-DIFF-UNI-001: Unified diff at 120×40 with single-file TypeScript change — full layout with line numbers, syntax highlighting, hunk headers, file header, status bar
- SNAP-DIFF-UNI-002: Unified diff at 80×24 minimum — compact layout, word-wrapped lines, truncated filename, no sidebar, abbreviated status hints
- SNAP-DIFF-UNI-003: Unified diff at 200×60 large — expanded gutter, full filename path, extra context lines, full status bar descriptions
- SNAP-DIFF-UNI-004: Multi-file diff file header — filename, change type "modified", addition/deletion summary "+14 −7"
- SNAP-DIFF-UNI-005: New file (all additions) — all lines green background, left gutter empty, change type "added"
- SNAP-DIFF-UNI-006: Deleted file (all deletions) — all lines red background, right gutter empty, change type "deleted"
- SNAP-DIFF-UNI-007: Renamed file with changes — header shows "renamed: old → new", diff content visible
- SNAP-DIFF-UNI-008: Renamed file without changes — header shows "renamed: old → new", no diff content
- SNAP-DIFF-UNI-009: Binary file placeholder — "Binary file — cannot display diff." in muted text
- SNAP-DIFF-UNI-010: Empty diff — "No file changes in this diff." centered in muted text
- SNAP-DIFF-UNI-011: Loading state — spinner with "Loading diff…"
- SNAP-DIFF-UNI-012: Error state — red error message with "Press `R` to retry"
- SNAP-DIFF-UNI-013: Hunk header rendering — cyan color, line range, scope name with `▼` indicator
- SNAP-DIFF-UNI-014: Collapsed hunk — `▶` indicator, hunk summary line, content hidden
- SNAP-DIFF-UNI-015: All hunks collapsed (`z`) — all hunks show `▶`, only headers visible
- SNAP-DIFF-UNI-016: Line numbers visible — two-column gutter (old/new), muted color, dark background
- SNAP-DIFF-UNI-017: Line numbers hidden (`l` toggled) — no gutter, diff content takes full width
- SNAP-DIFF-UNI-018: Added line rendering — green background, green `+` sign, right line number only
- SNAP-DIFF-UNI-019: Removed line rendering — red background, red `−` sign, left line number only
- SNAP-DIFF-UNI-020: Context line rendering — default background, both line numbers present
- SNAP-DIFF-UNI-021: Syntax highlighting on TypeScript — keywords red, strings blue, comments gray italic
- SNAP-DIFF-UNI-022: Syntax highlighting on Python file — correct token colors for Python grammar
- SNAP-DIFF-UNI-023: Whitespace toggled off — whitespace-only changes hidden
- SNAP-DIFF-UNI-024: Status bar content — "Unified", whitespace state, line number state, file position "File 2/7"
- SNAP-DIFF-UNI-025: File tree sidebar visible (Ctrl+B) at 120×40 — sidebar at 25%, diff content at 75%
- SNAP-DIFF-UNI-026: File tree sidebar hidden at 80×24 — diff takes full width
- SNAP-DIFF-UNI-027: Help overlay (`?`) — modal showing all diff keybindings
- SNAP-DIFF-UNI-028: No color mode (`TERM=dumb`) — plain `+`/`-` signs, no backgrounds, readable layout

### TUI E2E Tests — Keyboard Interaction Tests (38 tests)

- KEY-DIFF-UNI-001: `j` scrolls down one line
- KEY-DIFF-UNI-002: `k` scrolls up one line
- KEY-DIFF-UNI-003: `Down` scrolls down one line (same as `j`)
- KEY-DIFF-UNI-004: `Up` scrolls up one line (same as `k`)
- KEY-DIFF-UNI-005: `k` at top of diff — no-op
- KEY-DIFF-UNI-006: `j` at bottom of diff — no-op
- KEY-DIFF-UNI-007: `Ctrl+D` scrolls down half page
- KEY-DIFF-UNI-008: `Ctrl+U` scrolls up half page
- KEY-DIFF-UNI-009: `G` jumps to bottom
- KEY-DIFF-UNI-010: `g g` jumps to top
- KEY-DIFF-UNI-011: `]` navigates to next file — file header updates, scroll resets
- KEY-DIFF-UNI-012: `[` navigates to previous file
- KEY-DIFF-UNI-013: `]` on last file — wraps to first file
- KEY-DIFF-UNI-014: `[` on first file — wraps to last file
- KEY-DIFF-UNI-015: `]` on single-file diff — no-op
- KEY-DIFF-UNI-016: `[` on single-file diff — no-op
- KEY-DIFF-UNI-017: `l` toggles line numbers off
- KEY-DIFF-UNI-018: `l` toggles line numbers back on
- KEY-DIFF-UNI-019: `w` toggles whitespace off
- KEY-DIFF-UNI-020: `w` toggles whitespace back on
- KEY-DIFF-UNI-021: `t` at 120 columns — switches to split view
- KEY-DIFF-UNI-022: `t` at 80 columns — no-op
- KEY-DIFF-UNI-023: `z` collapses all hunks
- KEY-DIFF-UNI-024: `x` expands all hunks
- KEY-DIFF-UNI-025: `Enter` on hunk header — toggles collapse
- KEY-DIFF-UNI-026: `Enter` on non-hunk-header line — no-op
- KEY-DIFF-UNI-027: `R` in error state — retries fetch
- KEY-DIFF-UNI-028: `R` in normal state — no-op
- KEY-DIFF-UNI-029: `?` shows help overlay
- KEY-DIFF-UNI-030: `Esc` closes help overlay
- KEY-DIFF-UNI-031: `q` pops screen
- KEY-DIFF-UNI-032: `:` opens command palette
- KEY-DIFF-UNI-033: Rapid `j` presses (20×) — scroll advances exactly 20 lines
- KEY-DIFF-UNI-034: `Ctrl+B` at 120 columns — toggles sidebar
- KEY-DIFF-UNI-035: `Ctrl+B` at 80 columns — no-op
- KEY-DIFF-UNI-036: `z` then `]` — new file opens with hunks expanded (per-file collapse state)
- KEY-DIFF-UNI-037: `w` toggle persists across file navigation
- KEY-DIFF-UNI-038: Global keybindings active — `g r` navigates to repos

### TUI E2E Tests — Responsive Tests (12 tests)

- RESP-DIFF-UNI-001: Layout at 80×24 — no sidebar, 8ch gutter, word wrap, truncated filename
- RESP-DIFF-UNI-002: Layout at 120×40 — sidebar available, 10ch gutter, no wrap, full filename
- RESP-DIFF-UNI-003: Layout at 200×60 — 12ch gutter, extra context lines, full paths
- RESP-DIFF-UNI-004: Resize 120→80 — sidebar collapses, gutter narrows, wrap mode changes
- RESP-DIFF-UNI-005: Resize 80→120 — wider gutter, wrap mode changes, sidebar remains hidden until `Ctrl+B`
- RESP-DIFF-UNI-006: Resize 200→80 — graceful degradation across two breakpoints
- RESP-DIFF-UNI-007: Scroll position preserved through resize
- RESP-DIFF-UNI-008: Hunk collapse state preserved through resize
- RESP-DIFF-UNI-009: Line number toggle state preserved through resize
- RESP-DIFF-UNI-010: Whitespace toggle state preserved through resize
- RESP-DIFF-UNI-011: File navigation state preserved through resize
- RESP-DIFF-UNI-012: Resize during loading state — layout adjusts, fetch continues

### TUI E2E Tests — Integration Tests (18 tests)

- INT-DIFF-UNI-001: Full flow — changes list → `d` → unified diff → scroll → `q` back
- INT-DIFF-UNI-002: Landing flow — landing detail → change stack → `d` → unified diff → `q` back
- INT-DIFF-UNI-003: Combined landing diff — change stack → `D` → unified diff → `q` back
- INT-DIFF-UNI-004: Multi-file navigation — `]` through all files → `[` back → `q`
- INT-DIFF-UNI-005: View toggle round trip — unified → `t` split → `t` unified → scroll preserved
- INT-DIFF-UNI-006: Auth expiry — 401 → auth error screen
- INT-DIFF-UNI-007: Rate limit — 429 → inline message → wait → `R` → success
- INT-DIFF-UNI-008: Network timeout → error → `R` → success
- INT-DIFF-UNI-009: Server 500 → error → `R` → success
- INT-DIFF-UNI-010: `R` retry clears error and renders diff
- INT-DIFF-UNI-011: 50+ files — navigation wraps, performance smooth
- INT-DIFF-UNI-012: 10,000+ line file — scrolling responsive (<16ms per frame)
- INT-DIFF-UNI-013: Mixed binary/text files — binary placeholder, text renders, `]`/`[` works
- INT-DIFF-UNI-014: Deep link — `codeplane tui --screen diff --repo owner/repo --change_id abc123`
- INT-DIFF-UNI-015: Command palette navigation to diff screen
- INT-DIFF-UNI-016: Diff cache hit — view → back → view again → instant load
- INT-DIFF-UNI-017: Syntax highlighting across file types — `.ts` → `.py` → `.go` via file navigation
- INT-DIFF-UNI-018: Whitespace toggle with mixed content — some files all-whitespace, some mixed

### TUI E2E Tests — Edge Case Tests (14 tests)

- EDGE-DIFF-UNI-001: Diff with 0 files — empty state, navigation no-ops
- EDGE-DIFF-UNI-002: Diff with 1 file — `]`/`[` no-ops, "File 1/1"
- EDGE-DIFF-UNI-003: Whitespace-only changes with whitespace filtering on — "No visible changes (whitespace hidden)"
- EDGE-DIFF-UNI-004: Very long filename (255 chars) — truncated with `…/`
- EDGE-DIFF-UNI-005: File with 999,999 lines — 6-digit gutter renders correctly
- EDGE-DIFF-UNI-006: Diff exceeding 100,000 lines — truncation message displayed
- EDGE-DIFF-UNI-007: Unicode content (CJK, emoji) — wide chars take 2 columns, alignment preserved
- EDGE-DIFF-UNI-008: Tab characters — rendered as 4 spaces
- EDGE-DIFF-UNI-009: Concurrent resize + scroll — no crash, consistent layout
- EDGE-DIFF-UNI-010: Unrecognized file extension — plain text, no crash
- EDGE-DIFF-UNI-011: Empty patch string from API — treated as empty diff
- EDGE-DIFF-UNI-012: Malformed diff string — renders as plain text without crash
- EDGE-DIFF-UNI-013: Rapid `t` toggle at exactly 120 columns — toggles correctly without glitch
- EDGE-DIFF-UNI-014: No auth token — auth error screen before diff renders

### Web UI Playwright Tests (20 tests)

- PW-DIFF-UNI-001: Navigate to change detail, verify unified view is default with correct layout
- PW-DIFF-UNI-002: Verify file tree sidebar shows all changed files with correct badges and stats
- PW-DIFF-UNI-003: Click file in sidebar — content scrolls to that file's section
- PW-DIFF-UNI-004: Verify per-file header: filename, change type badge, `+N −M` summary
- PW-DIFF-UNI-005: Verify added lines render with green background and `+` glyph
- PW-DIFF-UNI-006: Verify removed lines render with red background and `−` glyph
- PW-DIFF-UNI-007: Verify context lines render with default styling
- PW-DIFF-UNI-008: Verify two-column line number gutter (old/new) with correct number assignment
- PW-DIFF-UNI-009: Click "Hide whitespace" toggle — whitespace-only changes disappear
- PW-DIFF-UNI-010: Click "Hide whitespace" when all changes are whitespace-only — shows "No visible changes"
- PW-DIFF-UNI-011: Click hunk header to collapse — content hidden, `▶` indicator shown
- PW-DIFF-UNI-012: Click "Collapse all" — all hunks collapsed
- PW-DIFF-UNI-013: Click "Expand all" — all hunks expanded
- PW-DIFF-UNI-014: Toggle line numbers off — gutter disappears, content takes full width
- PW-DIFF-UNI-015: Toggle to split view — layout switches to side-by-side (wide viewport only)
- PW-DIFF-UNI-016: Verify binary file shows "Binary file — cannot display diff" placeholder
- PW-DIFF-UNI-017: Verify empty diff shows "No file changes in this diff"
- PW-DIFF-UNI-018: Verify renamed file header shows "old → new" with both paths
- PW-DIFF-UNI-019: Verify "Copy patch" button copies raw patch to clipboard
- PW-DIFF-UNI-020: Verify syntax highlighting is applied (check for colored tokens in code)

### CLI E2E Tests (10 tests)

- CLI-DIFF-UNI-001: `codeplane change diff` with no args defaults to `@` and returns raw diff text
- CLI-DIFF-UNI-002: `codeplane change diff <valid_id>` returns diff for specified change
- CLI-DIFF-UNI-003: `codeplane change diff <valid_id> --json` returns structured `{ change_id, diff }` JSON
- CLI-DIFF-UNI-004: `codeplane change diff <invalid_id>` returns exit code 2 with error message
- CLI-DIFF-UNI-005: `codeplane change diff --whitespace ignore` filters whitespace-only changes
- CLI-DIFF-UNI-006: `codeplane change diff` on empty change returns empty output (exit 0)
- CLI-DIFF-UNI-007: `codeplane change diff` with binary file shows binary file notice
- CLI-DIFF-UNI-008: `codeplane change diff` output can be piped to `wc -l` (raw text, no ANSI escapes in piped mode)
- CLI-DIFF-UNI-009: `codeplane change diff` on nonexistent repo returns exit code 1
- CLI-DIFF-UNI-010: `codeplane change diff` with 500+ file change returns complete output

All 162 tests must be left failing if the backend is unimplemented — never skipped or commented out.

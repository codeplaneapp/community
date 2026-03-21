# JJ_CHANGE_DIFF_CONTENT_UI

Specification for JJ_CHANGE_DIFF_CONTENT_UI.

## High-Level User POV

When a developer navigates to a jj change in Codeplane — whether from the changes list, a landing request, an issue reference, or a direct URL — they need to see exactly what that change contains. The Change Diff Content UI is the primary reading surface for understanding what a jj change does to the codebase.

The experience begins when the user clicks into a change detail view. The diff content area renders every file touched by the change with syntax-highlighted, line-numbered code. Added lines appear on a green-tinted background, removed lines on a red-tinted background, and unchanged context lines provide surrounding code for orientation. Each file section has a collapsible header showing the file name, the type of change (added, deleted, modified, renamed, or copied), and a summary of how many lines were added or removed.

Users can switch between unified view (single-column, interleaved additions and deletions) and split view (side-by-side old and new content). A file tree sidebar lets them jump directly to any changed file. They can toggle whitespace visibility to focus on meaningful changes, collapse or expand individual hunks or all hunks at once, and copy the raw patch for any file to the clipboard. Binary files show a clear placeholder rather than garbled output.

This surface must feel fast and navigable. Keyboard shortcuts let power users scroll, jump between files, and toggle preferences without reaching for the mouse. The entire diff content area works as a single composable component that can be embedded in the change detail page, the landing request diff tab, and eventually in side-by-side review flows. It is the foundational visual primitive for understanding code changes throughout Codeplane.

Because Codeplane is jj-native, the diff is always anchored to a stable change ID rather than a commit SHA. This means the same change can be revisited even after the underlying commit has been rewritten or rebased — the content updates to reflect the current state of that change, and the URL remains stable.

## Acceptance Criteria

### Definition of Done

- [ ] The change diff content UI renders all file diffs returned by the `GET /api/repos/:owner/:repo/changes/:change_id/diff` endpoint
- [ ] The component is reusable and embeddable in change detail pages, landing request diff views, and any future surface that displays change diffs
- [ ] Unified view (single-column interleaved layout) is the default rendering mode
- [ ] Split view (side-by-side) is available when viewport width ≥ 1024px
- [ ] The file tree sidebar renders to the left of the diff content at ≥ 1024px viewport width
- [ ] Syntax highlighting is applied to all recognized programming languages using Tree-sitter or equivalent browser-based highlighter
- [ ] All five change types (added, deleted, modified, renamed, copied) render correctly with appropriate visual indicators
- [ ] Binary files display a placeholder message without attempting to render diff content
- [ ] The feature is gated behind the `JJ_CHANGE_DIFF_CONTENT_UI` feature flag
- [ ] Loading, error, and empty states are all handled with appropriate UI feedback
- [ ] Keyboard navigation works for all documented shortcuts
- [ ] The component is fully responsive from 320px to 2560px+ viewport widths

### Content Rendering

- [ ] Added lines display with a green-tinted background (`#1a2e1a` / `rgba(34,197,94,0.08)`)
- [ ] Removed lines display with a red-tinted background (`#2e1a1a` / `rgba(239,68,68,0.08)`)
- [ ] Context lines display with the default background (no tint)
- [ ] Line numbers appear in a two-column gutter: old file line number on the left, new file line number on the right
- [ ] Hunk headers (`@@ ... @@`) display with a distinct background and the scope name when available
- [ ] Each file section begins with a header showing: change type badge, file path, and `+N −M` stat summary
- [ ] Renamed and copied files show both the old and new paths in the header (e.g., `old/path.ts → new/path.ts`)
- [ ] Files with `is_binary: true` show "Binary file changed" in a muted placeholder
- [ ] Files where `patch` is empty or undefined and `is_binary` is false show "Empty file" or "No content changes" as appropriate
- [ ] Permission-only changes (no patch, not binary, not empty) display "File mode changed"

### Input Validation & Boundary Constraints

- [ ] `change_id` parameter: 1–128 characters, lowercase alphanumeric and hyphens only
- [ ] `whitespace` query parameter: must be exactly `"ignore"`, `"hide"`, or absent; any other value is treated as absent
- [ ] File path display: max 4,096 characters before left-truncation with ellipsis prefix (`…/deeply/nested/file.ts`)
- [ ] Individual file patch display: max 1 MB before "File too large to display inline" fallback
- [ ] Total diff payload: max 10 MB before client-side rejection with guidance to use CLI
- [ ] File count display: max 1,000 rendered files; excess shows "Showing 1,000 of N files"
- [ ] Line number gutter: supports up to 999,999 lines (6-digit gutter width)
- [ ] Stat summary numbers: exact integers up to 9,999; abbreviated as `10.0k`, `1.2M` above that
- [ ] Hunk context: 3 lines of context by default (server-determined)
- [ ] `change_id` values containing path-traversal patterns (`..`, `/`) are rejected or sanitized before reaching the jj CLI

### Edge Cases

- [ ] A change with zero file diffs displays an "Empty change — no files modified" message
- [ ] A change with a single file diff renders without the file tree sidebar regardless of viewport width
- [ ] File paths containing spaces, dots, unicode characters, or deeply nested directories (20+ levels) render correctly and do not overflow
- [ ] File paths exceeding 4,096 characters are truncated from the left with an ellipsis prefix
- [ ] A diff response containing 500+ files displays all files but shows a performance warning banner
- [ ] A diff response containing 1,000+ files truncates the rendered file list at 1,000 and shows a "Showing 1,000 of N files" indicator
- [ ] A single file with a patch exceeding 1 MB displays a "File too large to display inline" message with an option to download the raw patch
- [ ] A total diff response exceeding 10 MB triggers a "Diff too large" error with guidance to use the CLI
- [ ] Syntax highlighting gracefully degrades to plain text for unrecognized file extensions
- [ ] If syntax highlighting fails for a recognized language, the diff still renders as plain text without crashing
- [ ] Whitespace-only diffs render normally when filtering is off; when filtering is on, those files are excluded
- [ ] A file with no extension returns an empty or undefined `language` field
- [ ] Files named `Dockerfile`, `Makefile`, etc. are detected by basename, not extension
- [ ] A file with a double extension (e.g., `component.test.tsx`) resolves language from the final extension
- [ ] Diff output that contains literal `diff --git` inside file content does not break the parser
- [ ] Unicode file paths and content are handled correctly
- [ ] A change with mixed binary and text files correctly flags each file individually
- [ ] Requesting a diff while the repository is locked by a concurrent jj operation returns a retriable server error, not a hang

## Design

### Web UI Design

#### Page Location

The Change Diff Content UI is rendered as the primary content area within the change detail page at `/:owner/:repo/changes/:change_id`. It also appears as the "Diff" tab content within landing request detail pages at `/:owner/:repo/landings/:number`.

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar                                                         │
│ [Unified | Split]  [☐ Hide whitespace]  [Expand all] [Collapse] │
├──────────────┬──────────────────────────────────────────────────┤
│ File Tree    │ Diff Content                                     │
│ (25% width)  │                                                  │
│              │ ┌──────────────────────────────────────────────┐ │
│ Summary      │ │ M src/index.ts  +12 −3                      │ │
│ 5 files      │ ├──────────────────────────────────────────────┤ │
│ +42 −15      │ │  10│ 10│ import { foo } from \"./bar\"        │ │
│              │ │  11│   │-  const x = 1                      │ │
│ ▸ src/       │ │    │ 11│+  const x = 2                      │ │
│   index.ts M │ │  12│ 12│                                    │ │
│   utils.ts A │ │ ...                                         │ │
│ ▸ tests/     │ └──────────────────────────────────────────────┘ │
│   foo.test…A │                                                  │
│ README.md M  │                                                  │
│ old.ts D     │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

#### Toolbar

The toolbar is a sticky horizontal bar at the top of the diff content area containing:

- **View mode toggle**: A segmented control with "Unified" and "Split" options. Split is disabled (grayed out with tooltip "Split view requires wider viewport") when viewport width < 1024px.
- **Whitespace checkbox**: A labeled checkbox "Hide whitespace". When toggled, the diff is re-fetched with `?whitespace=ignore`. The checkbox reflects the current query parameter state.
- **Expand All / Collapse All buttons**: Icon buttons that expand or collapse all hunk sections across all files. Disabled when there is only one hunk per file.
- **Copy Patch button**: A clipboard icon button that copies the full raw patch (all files concatenated) to the clipboard. Shows a brief "Copied!" toast on success.
- **Stats summary**: Right-aligned text showing the aggregate change stats: `5 files changed, +42 −15`.

#### File Tree Sidebar

The file tree sidebar occupies the left 25% of the diff area (min 200px, max 320px) at viewports ≥ 1024px. Below 1024px the sidebar is hidden and a mobile file selector dropdown replaces it in the toolbar row.

Contents of the sidebar:

- **Summary header**: Total file count and aggregate `+N −M` stats.
- **File list**: A scrollable tree grouped by directory. Each entry shows a single-letter change type badge with color (`A` green, `D` red, `M` amber, `R` blue, `C` purple), the file name, per-file `+N −M` stats, `[bin]` suffix for binary files, and for renamed files a secondary line showing the old path.
- **Search/filter input**: A text input at the top for case-insensitive substring filtering of file paths. Max 128 characters. Clears with `Esc` or the clear button.
- **Active file highlight**: The currently-scrolled-to file is highlighted with a distinct background. Clicking a file scrolls the diff content to that file's section.

#### Diff Content Pane

The diff content pane is the main scrollable area. Files are rendered sequentially, each as an independent section.

**File Header**: Change type badge (colored single letter), file path (or `old → new` for renames/copies), `+N −M` stat pill, collapse/expand chevron, copy file patch button.

**Hunk Rendering (Unified Mode)**: Hunk separator line with `@@ -old,count +new,count @@ scope_name` in cyan/muted text. Two-column line number gutter (old | new), right-aligned, monospace, muted color. Added lines: green-tinted background, `+` prefix in green. Removed lines: red-tinted background, `−` prefix in red. Context lines: no background tint, space prefix. Syntax highlighting applied to code content only.

**Hunk Rendering (Split Mode)**: Two panes side-by-side (50/50 width). Left pane shows old file content. Right pane shows new file content. Scroll is synchronized. Blank padding lines inserted to align hunks.

**Syntax Highlighting**: Uses `language` field from API response, falls back to file extension mapping. Covers 30+ languages. Token colors follow GitHub Dark-inspired palette: Keywords `#FF7B72` bold, Strings `#A5D6FF`, Comments `#8B949E` italic, Numbers/Constants `#79C0FF`, Functions `#D2A8FF`, Types `#FFA657`, Operators `#FF7B72`, Default text `#E6EDF3`.

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Scroll down one line |
| `k` / `↑` | Scroll up one line |
| `Ctrl+D` / `Page Down` | Scroll down half a page |
| `Ctrl+U` / `Page Up` | Scroll up half a page |
| `G` | Jump to bottom of diff |
| `g g` | Jump to top of diff |
| `]` | Jump to next file section |
| `[` | Jump to previous file section |
| `t` | Toggle unified ↔ split view |
| `w` | Toggle whitespace filtering |
| `z` | Collapse all hunks |
| `x` | Expand all hunks |
| `Enter` | Toggle expand/collapse on focused hunk |
| `l` | Toggle line numbers |
| `c` | Copy current file's patch to clipboard |
| `C` | Copy entire diff patch to clipboard |
| `/` | Focus the file tree search input |
| `Esc` | Clear file tree search / return focus to diff content |
| `?` | Show keyboard shortcut help overlay |

#### Loading State

While the diff is being fetched: a skeleton loader with 3 simulated file sections, each with a header bar and 8–12 shimmering content lines. The file tree sidebar shows a skeleton with 5–8 shimmering entries. Toolbar controls are visible but disabled.

#### Error State

- `404`: "Change not found. This change ID may not exist in this repository."
- `500`: "Failed to load diff. Please try again." with a "Retry" button.
- Network timeout (>30s): "Diff loading timed out. The change may be very large. Try using the CLI."
- All error states show within the content pane, not as a full-page takeover.

#### Empty State

When the API returns a valid response with an empty `file_diffs` array: "Empty change — no files were modified." The file tree sidebar is hidden. Toolbar stats show "0 files changed".

#### Responsive Breakpoints

| Viewport Width | File Tree | View Modes | Line Number Width |
|----------------|-----------|------------|-------------------|
| < 640px | Hidden; file dropdown in toolbar | Unified only | 3+3 characters |
| 640px–1023px | Hidden; file dropdown in toolbar | Unified only | 4+4 characters |
| 1024px–1439px | Visible (200px fixed) | Unified + Split | 5+5 characters |
| ≥ 1440px | Visible (25%, max 320px) | Unified + Split | 6+6 characters |

#### URL State

Diff preferences are persisted in URL query parameters: `?view=split` or `?view=unified` (default: unified), `?whitespace=ignore` (default: absent). User preference is also persisted in `localStorage` under key `codeplane:diff-preferences` as `{ viewMode, hideWhitespace }`. URL parameters take precedence over localStorage.

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/changes/:change_id/diff`

**Path Parameters**: `owner` (1–39 chars), `repo` (1–100 chars), `change_id` (1–128 chars, lowercase alphanumeric and hyphens).

**Query Parameters**: `whitespace` (optional, `"ignore"` or `"hide"`).

**Success Response (200)**: `{ change_id: string, file_diffs: FileDiffItem[] }`

**FileDiffItem**: `{ path, old_path?, change_type, patch?, is_binary, language?, additions, deletions, old_content?, new_content? }`

**Error Responses**: 400 (missing/invalid params), 401 (unauthenticated, private repo), 403 (no read access), 404 (repo or change not found), 500 (internal error), 503 (repo locked).

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

### CLI Command

The CLI already exposes `codeplane change diff [id]` which outputs raw unified diff text or structured JSON with `--json`. No additional CLI changes are required for this feature.

### TUI UI

The TUI diff screen is a full-screen view with three zones: file tree sidebar (25% width, collapsible with `Ctrl+B`), main diff content area (remaining width with syntax highlighting), and status bar (bottom row). Split view requires ≥120 terminal columns. Syntax highlighting uses Tree-sitter via `@opentui/core` `SyntaxStyle` with three color tier fallbacks (Truecolor, ANSI 256, ANSI 16).

Keyboard shortcuts: `t` toggle view, `]`/`[` next/prev file, `j`/`k` scroll, `Ctrl+D`/`Ctrl+U` half-page, `G`/`gg` jump, `w` whitespace, `l` line numbers, `z`/`x`/`Z`/`X` hunk collapse/expand, `Ctrl+B` sidebar, `R` retry, `q`/`Esc` close, `?` help, `:` command palette.

### Documentation

1. **User Guide: "Viewing Change Diffs"** — How to navigate to a change diff, use the file tree, toggle view modes, use keyboard shortcuts, and understand change type indicators.
2. **API Reference: "JJ VCS — Change Diff"** — Full endpoint documentation with request/response examples, error codes, and curl examples.
3. **Keyboard Shortcuts Reference** — Add diff-specific shortcuts to the global keyboard shortcuts help page.
4. **Conceptual Guide: "jj Change Diffs vs. Git Commit Diffs"** — Explaining how Codeplane's diff is anchored to stable change IDs rather than commit SHAs, and how this interacts with jj's rewriting model.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Repository Owner | Full read access to all change diffs |
| Repository Admin | Full read access to all change diffs |
| Repository Member (Write) | Full read access to all change diffs |
| Repository Member (Read) | Full read access to all change diffs |
| Anonymous (public repo) | Full read access to all change diffs |
| Anonymous (private repo) | No access — returns 401 |
| Authenticated non-member (private repo) | No access — returns 403 or 404 (to prevent enumeration) |

The Change Diff Content UI is a **read-only** surface. No write operations are performed. The API endpoint enforces repository read permission checks before returning diff content.

### Rate Limiting

- **Authenticated users**: 300 requests per minute per user
- **Anonymous users** (public repos): 60 requests per minute per IP address
- **Burst allowance**: Up to 10 requests in a 1-second window before throttling
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in all responses
- Rate-limited requests return `429 Too Many Requests` with a `Retry-After` header

### Data Privacy

- Diff content contains source code and must only be served to users with read access to the repository.
- For private repositories, both "not found" and "no access" return the same error shape to prevent enumeration of change IDs.
- No PII is exposed beyond author names and emails already visible in change metadata.
- Clipboard copy operations are entirely client-side and do not send data to the server.
- The `raw_output_preview` field in error logs is truncated to 500 characters to prevent full source code leakage into log aggregation systems.
- No diff content should be cached in shared/public caches. Responses must include `Cache-Control: private` for authenticated requests and appropriate `Vary: Authorization` headers.
- Change IDs are stable identifiers; they must not be logged at levels that could be scraped from production log stores by unauthorized users. Log at `debug` level only.

### Input Sanitization

- `change_id`, `owner`, and `repo` parameters are sanitized against path traversal (`..`, `/`) before being used in filesystem paths or jj CLI arguments.
- jj commands are invoked with `JJ_CONFIG: "ui.pager=false\nui.color=never"` to prevent escape sequence injection from jj output.
- No user-supplied strings are interpolated into shell commands; all arguments are passed as array elements to `Bun.spawn()`.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeDiffViewed` | User navigates to change diff content | `repo_id`, `owner`, `repo_name`, `change_id`, `file_count`, `total_additions`, `total_deletions`, `view_mode`, `whitespace_hidden`, `is_authenticated`, `source` (change_detail / landing_diff / direct_url), `client` (web / cli / tui / editor), `response_time_ms` |
| `DiffViewModeToggled` | User switches between unified and split | `repo_id`, `change_id`, `from_mode`, `to_mode`, `client` |
| `DiffWhitespaceToggled` | User toggles whitespace filtering | `repo_id`, `change_id`, `whitespace_hidden`, `client` |
| `DiffFileNavigated` | User clicks a file in the sidebar or uses `]`/`[` | `repo_id`, `change_id`, `file_path`, `file_index`, `total_files`, `navigation_method` (sidebar_click / keyboard_next / keyboard_prev), `client` |
| `DiffFileTreeSearched` | User types in the file tree search input | `repo_id`, `change_id`, `query_length`, `result_count` (debounced, fired once per 2s of inactivity) |
| `DiffPatchCopied` | User copies a file or full patch to clipboard | `repo_id`, `change_id`, `scope` (file / full), `file_path` (if file scope), `total_lines`, `client` |
| `DiffHunksToggled` | User expands/collapses all hunks | `repo_id`, `change_id`, `action` (expand_all / collapse_all), `client` |
| `DiffLoadFailed` | Diff fetch returns an error | `repo_id`, `change_id`, `error_status`, `error_message`, `duration_ms`, `client` |
| `DiffLargeFileSkipped` | A file is too large to render inline | `repo_id`, `change_id`, `file_path`, `patch_size_bytes` |

### Funnel Metrics

- **Diff Engagement Rate**: % of change detail page views that result in a `ChangeDiffViewed` event (target: > 80%)
- **View Mode Adoption**: % of diff views where user toggles to split view (indicates feature discovery)
- **File Navigation Rate**: Average number of `DiffFileNavigated` events per `ChangeDiffViewed` (indicates depth of review)
- **Error Rate**: % of `ChangeDiffViewed` attempts that result in `DiffLoadFailed` (target: < 1%)
- **Time to First Render**: P50 and P95 latency from navigation to first meaningful paint of diff content
- **Copy Adoption**: % of diff sessions where at least one `DiffPatchCopied` occurs
- **Multi-file Navigation Rate**: % of diff sessions where user navigates to ≥2 files (indicates rich usage beyond glancing)
- **Whitespace Toggle Usage Rate**: Indicates whether the feature is discoverable and needed
- **Diff-to-Landing-Request Conversion**: % of diff views that lead to a landing request creation within 30 minutes (key collaboration metric)

### Success Indicators

- P95 response time for change diff API ≤ 500ms for repositories with ≤100 changed files
- Error rate ≤ 0.1% for well-formed requests against existing repositories
- Zero data exposure incidents from diff content leaking outside repository access boundaries
- Diff engagement rate > 80% of change detail views
- Time to first meaningful paint < 1s at P50

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| `change_diff.request_received` | INFO | `owner`, `repo`, `change_id_prefix` (first 8 chars only), `whitespace`, `request_id`, `user_id` (if authed) | On every diff request |
| `change_diff.jj_subprocess_started` | DEBUG | `command`, `repo_path`, `request_id` | When jj diff subprocess starts |
| `change_diff.jj_subprocess_completed` | DEBUG | `exit_code`, `stdout_bytes`, `stderr_bytes`, `duration_ms`, `request_id` | When jj subprocess finishes |
| `change_diff.jj_subprocess_failed` | ERROR | `owner`, `repo`, `change_id_prefix`, `exit_code`, `stderr`, `duration_ms`, `request_id` | When jj subprocess exits non-zero |
| `change_diff.jj_subprocess_timeout` | ERROR | `owner`, `repo`, `change_id_prefix`, `timeout_ms`, `request_id` | When jj subprocess exceeds timeout |
| `change_diff.parse_completed` | DEBUG | `owner`, `repo`, `change_id_prefix`, `file_count`, `total_additions`, `total_deletions`, `parse_duration_ms`, `request_id` | After parseGitDiff completes |
| `change_diff.parse_failed` | ERROR | `owner`, `repo`, `change_id_prefix`, `error_message`, `raw_output_preview` (first 500 chars), `request_id` | When diff parsing throws |
| `change_diff.response_sent` | INFO | `owner`, `repo`, `change_id_prefix`, `file_count`, `response_bytes`, `total_duration_ms`, `status_code`, `request_id` | On response |
| `change_diff.rate_limited` | WARN | `user_id` or `ip`, `endpoint`, `window_remaining`, `request_id` | When 429 is returned |
| `change_diff.large_file_detected` | WARN | `owner`, `repo`, `change_id_prefix`, `file_path`, `patch_size_bytes`, `request_id` | When a single file patch exceeds 1 MB |
| `change_diff.client_render_error` | ERROR | `error_type`, `file_path`, `browser`, `viewport_width` | Client-side: when syntax highlighting or diff rendering crashes |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_diff_requests_total` | Counter | `owner`, `repo`, `status_code` | Total diff API requests |
| `codeplane_change_diff_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30) |
| `codeplane_change_diff_jj_subprocess_duration_seconds` | Histogram | `owner`, `repo` | jj subprocess duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_change_diff_file_count` | Histogram | `owner`, `repo` | Files per diff response (buckets: 1, 5, 10, 25, 50, 100, 250, 500, 1000) |
| `codeplane_change_diff_response_bytes` | Histogram | `owner`, `repo` | Response payload size (buckets: 1KB, 10KB, 100KB, 500KB, 1MB, 5MB, 10MB) |
| `codeplane_change_diff_errors_total` | Counter | `owner`, `repo`, `error_type` | Errors by type (jj_not_found, jj_timeout, jj_error, parse_error, auth_error) |
| `codeplane_change_diff_rate_limited_total` | Counter | `endpoint` | Rate-limited requests |
| `codeplane_change_diff_binary_files_total` | Counter | `owner`, `repo` | Binary files encountered |
| `codeplane_change_diff_large_files_total` | Counter | `owner`, `repo` | Files exceeding 1 MB patch size |
| `codeplane_change_diff_ui_render_duration_seconds` | Histogram | `view_mode`, `client` | Client-side time-to-first-meaningful-paint (buckets: 0.1, 0.25, 0.5, 1, 2, 5) |

### Alerts

#### Alert: High Change Diff Error Rate
- **Condition**: `rate(codeplane_change_diff_errors_total[5m]) / rate(codeplane_change_diff_requests_total[5m]) > 0.05`
- **Severity**: Warning (> 5%), Critical (> 20%)
- **Runbook**:
  1. Check `codeplane_change_diff_errors_total` by `error_type` label to identify the dominant failure mode.
  2. If `jj_not_found` dominates: likely user-facing (invalid change IDs). Verify no UI bug is generating bad URLs. No action needed if organic.
  3. If `jj_timeout` dominates: check server load. Check for large repositories causing slow `jj diff` execution. Consider increasing subprocess timeout or adding diff-size guards.
  4. If `jj_error` dominates: check jj binary availability (`which jj`, `jj version`). Check repository health. Check disk space and file permissions.
  5. If `parse_error` dominates: pull recent `change_diff.parse_failed` logs, inspect `raw_output_preview` for unexpected jj output format changes.
  6. If `auth_error` dominates: check auth middleware health.

#### Alert: Slow Change Diff P95 Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_change_diff_duration_seconds_bucket[5m])) > 5`
- **Severity**: Warning (> 5s P95), Critical (> 15s P95)
- **Runbook**:
  1. Check `codeplane_change_diff_jj_subprocess_duration_seconds` to determine if slowness is in jj or in parsing/serialization.
  2. If jj subprocess is slow: identify the repository from labels. Check repository size and history depth. Consider `jj gc` or compaction.
  3. Check system resources: CPU, memory, disk I/O on the server host.
  4. Check for concurrent subprocess contention (multiple diff requests queueing).
  5. If parsing is slow: check `codeplane_change_diff_file_count` for unusually large diffs.
  6. Temporary mitigation: increase timeout, add request queuing or concurrency limits.

#### Alert: Change Diff Response Size Spike
- **Condition**: `histogram_quantile(0.95, rate(codeplane_change_diff_response_bytes_bucket[5m])) > 5242880` (5 MB)
- **Severity**: Warning
- **Runbook**:
  1. Identify repositories generating large responses from labels.
  2. Check whether these are legitimate large changes or potential abuse.
  3. If legitimate: monitor for client-side rendering performance issues.
  4. If abuse: consider per-repo rate limiting.
  5. Long-term: implement pagination for file diffs.

#### Alert: Subprocess Timeout Rate
- **Condition**: `rate(codeplane_change_diff_errors_total{error_type="jj_timeout"}[5m]) > 0.1`
- **Severity**: Critical
- **Runbook**:
  1. Identify affected repositories from structured logs.
  2. Check if specific repositories have unusually large working copies or history.
  3. Verify jj binary is responding: `jj version`.
  4. Check for zombie jj processes: `ps aux | grep jj`. Kill stuck processes.
  5. Check disk health: `df -h`, `iostat`.
  6. Temporary mitigation: restart the server process to clear stuck subprocesses.

### Error Cases and Failure Modes

| Error | HTTP Status | Behavior | Recovery |
|-------|-------------|----------|----------|
| Missing `owner` parameter | 400 | Return error immediately | Client-side validation |
| Missing `repo` parameter | 400 | Return error immediately | Client-side validation |
| Missing `change_id` parameter | 400 | Return error immediately | Client-side validation |
| `change_id` exceeds 128 chars | 400 | Return error immediately | Client-side validation |
| `change_id` contains `..` or `/` | 400 | Return error immediately | Input sanitization |
| Repository not found | 404 | Return 404 | UI shows "Repository not found" |
| Change ID not found | 404 | Return 404 | UI shows "Change not found" |
| Private repo, unauthenticated | 401 | Return 401 | Redirect to login |
| Private repo, no read access | 403/404 | Return 403 or 404 | UI shows "Not found" |
| jj binary not available | 500 | Log ERROR, return 500 | Alert triggers; ops installs jj |
| jj subprocess timeout (>30s) | 500 | Kill process, return 500 | UI shows retry button |
| jj subprocess non-zero exit | 500 | Log ERROR with stderr | Investigate underlying error |
| jj repo locked by concurrent op | 503 | Return 503 with Retry-After | Client retries with backoff |
| Diff output exceeds 10 MB | 200 (truncated) or 413 | Server truncates or rejects | UI shows "too large" guidance |
| Malformed diff output | 500 | Log ERROR with preview | Investigate jj version skew |
| Rate limit exceeded | 429 | Return 429 with Retry-After | Client retries after delay |
| Client-side syntax highlighting crash | N/A | Fallback to plain text | Log client error event |

## Verification

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| `API-DIFF-001` | GET change diff for a modified file returns 200 with `change_type: "modified"`, non-empty `patch`, and accurate `additions`/`deletions` counts |
| `API-DIFF-002` | GET change diff for a newly added file returns `change_type: "added"` with `additions > 0` and `deletions === 0` |
| `API-DIFF-003` | GET change diff for a deleted file returns `change_type: "deleted"` with `additions === 0` and `deletions > 0` |
| `API-DIFF-004` | GET change diff for a renamed file returns `change_type: "renamed"` with `old_path` populated |
| `API-DIFF-005` | GET change diff for a copied file returns `change_type: "copied"` with `old_path` populated |
| `API-DIFF-006` | GET change diff for a binary file returns `is_binary: true` and `patch` is empty or null |
| `API-DIFF-007` | GET change diff with `?whitespace=ignore` excludes whitespace-only changes from `file_diffs` |
| `API-DIFF-008` | GET change diff with `?whitespace=hide` behaves identically to `?whitespace=ignore` |
| `API-DIFF-009` | GET change diff with `?whitespace=invalid_value` ignores the parameter and returns the full diff |
| `API-DIFF-010` | GET change diff with no `whitespace` parameter returns the full diff including whitespace-only changes |
| `API-DIFF-011` | GET change diff for a change with zero modified files returns 200 with `file_diffs: []` |
| `API-DIFF-012` | GET change diff for a change modifying 100+ files returns all file diffs |
| `API-DIFF-013` | GET change diff for a nonexistent change ID returns 404 |
| `API-DIFF-014` | GET change diff with missing `owner` returns 400 |
| `API-DIFF-015` | GET change diff with missing `repo` returns 400 |
| `API-DIFF-016` | GET change diff with missing `change_id` returns 400 |
| `API-DIFF-017` | GET change diff for a private repo without authentication returns 401 |
| `API-DIFF-018` | GET change diff for a private repo with read access returns 200 |
| `API-DIFF-019` | GET change diff for a private repo with no access returns 403 or 404 |
| `API-DIFF-020` | GET change diff returns `language` field populated for `.ts`, `.py`, `.rs`, `.go` files |
| `API-DIFF-021` | GET change diff returns `language` field empty for unrecognized file extension |
| `API-DIFF-022` | GET change diff patch content contains valid unified diff format with `@@` hunk headers |
| `API-DIFF-023` | GET change diff for a file with spaces in the path returns the correct `path` |
| `API-DIFF-024` | GET change diff for a file with unicode characters in the path returns correctly encoded `path` |
| `API-DIFF-025` | GET change diff for a change modifying a file larger than 1 MB returns the diff |
| `API-DIFF-026` | GET change diff response content-type is `application/json` |
| `API-DIFF-027` | GET change diff rate limit headers are present in the response |
| `API-DIFF-028` | Exceeding 300 requests/minute returns 429 with `Retry-After` header |
| `API-DIFF-029` | GET change diff for a permission-only change returns `file_diffs` with empty `patch` and zero additions/deletions |
| `API-DIFF-030` | GET change diff for a renamed file with content changes returns both `old_path` and non-empty `patch` |
| `API-DIFF-031` | GET change diff `additions` + `deletions` match the count of `+` and `-` lines in the `patch` content |
| `API-DIFF-032` | GET change diff with `change_id` of 128 characters returns 200 (maximum valid length) |
| `API-DIFF-033` | GET change diff with `change_id` of 129 characters returns 400 (exceeds maximum) |
| `API-DIFF-034` | GET change diff for a file containing literal `diff --git` inside its content does not corrupt the response |
| `API-DIFF-035` | GET change diff for `@` (working copy shorthand) resolves correctly as `change_id` |
| `API-DIFF-036` | GET change diff with `change_id` containing `..` returns 400 |
| `API-DIFF-037` | GET change diff response includes `Cache-Control: private` header for authenticated requests |
| `API-DIFF-038` | Response time is ≤2 seconds for a change with ≤50 modified files |

### Web UI Playwright Tests

| Test ID | Description |
|---------|-------------|
| `UI-DIFF-001` | Navigate to `/:owner/:repo/changes/:change_id` and verify the diff content area renders with at least one file section |
| `UI-DIFF-002` | Verify the toolbar displays with view mode toggle, whitespace checkbox, expand/collapse buttons, and stats summary |
| `UI-DIFF-003` | Verify the file tree sidebar is visible at 1440px viewport width and hidden at 768px |
| `UI-DIFF-004` | Click a file in the sidebar and verify the diff content scrolls to that file's section |
| `UI-DIFF-005` | Toggle from unified to split view and verify two side-by-side panes appear |
| `UI-DIFF-006` | Toggle whitespace checkbox and verify the URL updates with `?whitespace=ignore` and the diff re-renders |
| `UI-DIFF-007` | Click "Expand all" and verify all hunks are expanded; click "Collapse all" and verify all hunks are collapsed |
| `UI-DIFF-008` | Verify added lines have a green-tinted background |
| `UI-DIFF-009` | Verify removed lines have a red-tinted background |
| `UI-DIFF-010` | Verify context lines have no colored background |
| `UI-DIFF-011` | Verify line numbers are displayed in a two-column gutter for unified view |
| `UI-DIFF-012` | Verify binary files show "Binary file changed" placeholder |
| `UI-DIFF-013` | Verify empty change shows "Empty change — no files were modified" message |
| `UI-DIFF-014` | Verify file headers show change type badge, file path, and `+N −M` stats |
| `UI-DIFF-015` | Verify renamed file headers show `old_path → path` format |
| `UI-DIFF-016` | Verify syntax highlighting is applied (TypeScript file has colored keywords) |
| `UI-DIFF-017` | Navigate to a nonexistent change ID and verify a 404 error message is shown |
| `UI-DIFF-018` | Verify the file tree search input filters files by name |
| `UI-DIFF-019` | Verify the file tree search clears when pressing Escape |
| `UI-DIFF-020` | Verify keyboard shortcut `]` navigates to the next file section |
| `UI-DIFF-021` | Verify keyboard shortcut `[` navigates to the previous file section |
| `UI-DIFF-022` | Verify keyboard shortcut `t` toggles view mode at ≥ 1024px viewport |
| `UI-DIFF-023` | Verify keyboard shortcut `w` toggles whitespace filtering |
| `UI-DIFF-024` | Verify split view is disabled (grayed out with tooltip) at viewport < 1024px |
| `UI-DIFF-025` | Verify the copy patch button copies content to clipboard |
| `UI-DIFF-026` | Verify the loading skeleton appears while the diff is being fetched |
| `UI-DIFF-027` | Verify a diff with a file whose patch exceeds 1 MB shows a "File too large" placeholder |
| `UI-DIFF-028` | Verify the diff renders correctly at 320px viewport width (mobile) |
| `UI-DIFF-029` | Verify the diff renders correctly at 2560px viewport width (ultrawide) |
| `UI-DIFF-030` | Verify the URL `?view=split` parameter causes split view to render on page load |
| `UI-DIFF-031` | Verify the diff content area is accessible (ARIA labels, keyboard-navigable) |
| `UI-DIFF-032` | Verify the diff component works when embedded in a landing request diff tab |
| `UI-DIFF-033` | Verify navigating away and back preserves the user's view mode preference |
| `UI-DIFF-034` | Verify the file tree sidebar shows aggregate stats in the summary header |
| `UI-DIFF-035` | Verify the mobile file selector dropdown appears below 1024px |
| `UI-DIFF-036` | Verify hunk headers display `@@ ... @@` with scope name in muted text |
| `UI-DIFF-037` | Verify a diff with 500+ files shows a performance warning banner |
| `UI-DIFF-038` | Verify a diff with deeply nested directories renders file tree grouping correctly |

### CLI Integration Tests

| Test ID | Description |
|---------|-------------|
| `CLI-DIFF-001` | `codeplane change diff <id>` outputs raw unified diff text to stdout |
| `CLI-DIFF-002` | `codeplane change diff <id> --json` outputs structured JSON with `change_id` and `diff` fields |
| `CLI-DIFF-003` | `codeplane change diff <nonexistent-id>` exits with non-zero status and prints error to stderr |
| `CLI-DIFF-004` | `codeplane change diff` without an ID uses the working-copy change (`@`) |
| `CLI-DIFF-005` | `codeplane change diff <id>` output is pipeable (no ANSI escape codes in non-TTY mode) |
| `CLI-DIFF-006` | `codeplane change diff <id> --json` output is valid JSON parseable by `jq` |
| `CLI-DIFF-007` | `codeplane change diff --repo owner/repo <id>` fetches the diff from a remote repository via API |
| `CLI-DIFF-008` | `codeplane change diff` in a directory without a jj repo exits with a descriptive error |

### TUI Integration Tests

| Test ID | Description |
|---------|-------------|
| `TUI-DIFF-001` | TUI diff screen renders file headers with change type badges |
| `TUI-DIFF-002` | TUI diff screen applies syntax highlighting colors to TypeScript code |
| `TUI-DIFF-003` | TUI diff screen degrades to plain text when syntax highlighting fails |
| `TUI-DIFF-004` | TUI diff screen responds to `]` key by scrolling to next file |
| `TUI-DIFF-005` | TUI diff screen responds to `[` key by scrolling to previous file |
| `TUI-DIFF-006` | TUI diff screen responds to `w` key by toggling whitespace |
| `TUI-DIFF-007` | TUI diff screen responds to `t` key by toggling view mode |
| `TUI-DIFF-008` | TUI diff screen renders correctly at 80×24 terminal size |
| `TUI-DIFF-009` | TUI diff screen renders correctly at 120×40 terminal size |
| `TUI-DIFF-010` | TUI diff screen renders binary files with "Binary file changed" message |
| `TUI-DIFF-011` | TUI diff screen split view is rejected with flash message at width < 120 |
| `TUI-DIFF-012` | TUI `Ctrl+B` hides the sidebar; pressing again restores it |
| `TUI-DIFF-013` | TUI `G` jumps to end; `gg` jumps to top |
| `TUI-DIFF-014` | TUI diff screen shows "No changes" message for empty change |

### End-to-End Integration Tests

| Test ID | Description |
|---------|-------------|
| `E2E-DIFF-001` | Create a jj change that modifies a file, then fetch the diff via API and verify the response contains the correct file diff |
| `E2E-DIFF-002` | Create a jj change that adds a new file, view the diff in the web UI, and verify the file appears with `A` badge and green lines |
| `E2E-DIFF-003` | Create a jj change that deletes a file, view the diff in the web UI, and verify the file appears with `D` badge and red lines |
| `E2E-DIFF-004` | Create a jj change that renames a file, view the diff in the web UI, and verify both old and new paths are displayed |
| `E2E-DIFF-005` | Create a jj change with whitespace-only modifications, toggle whitespace filtering in the web UI, and verify the files disappear |
| `E2E-DIFF-006` | Create a jj change modifying a binary file, view the diff, and verify binary placeholder is shown |
| `E2E-DIFF-007` | Create a landing request containing a change, navigate to the landing request diff tab, and verify the change diff content renders |
| `E2E-DIFF-008` | View a change diff in the web UI, use keyboard shortcut `]` to navigate files, then switch to split view with `t`, and verify the view updates |
| `E2E-DIFF-009` | View a change diff URL with `?view=split&whitespace=ignore`, and verify the page loads with split view and whitespace hidden |
| `E2E-DIFF-010` | Amend a jj change, then re-fetch the diff using the same change ID and verify the diff reflects the amended content |

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

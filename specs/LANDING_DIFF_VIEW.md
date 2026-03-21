# LANDING_DIFF_VIEW

Specification for LANDING_DIFF_VIEW.

## High-Level User POV

When a developer opens a landing request in Codeplane, they need to understand exactly what code is changing before they approve, comment on, or land that request. The Landing Diff View is the primary surface where collaborators inspect the actual modifications proposed by a landing request's jj change stack.

A landing request in Codeplane represents an ordered stack of jj changes targeting a bookmark. Unlike traditional pull requests that show a single branch diff, the Landing Diff View presents the combined work across the entire change stack while preserving the identity of each individual change. Users see which files were added, modified, deleted, renamed, or copied — along with syntax-highlighted, line-by-line diffs — so they can reason about the proposed modifications with full context.

The diff view is accessible from the landing request detail page as a dedicated tab. When a reviewer navigates to the diff, they see a file tree sidebar listing every changed file with visual indicators for the type of change and summary statistics. Clicking a file in the sidebar scrolls the main diff pane to that file's section. The diff itself can be displayed in unified mode (interleaved additions and deletions in a single column) or split mode (old and new content side-by-side), and users can toggle between these layouts freely. A whitespace toggle allows reviewers to hide whitespace-only changes so they can focus on meaningful modifications.

The experience is consistent across Codeplane's surfaces. In the web UI, the diff view is a rich interactive panel with syntax highlighting, hunk collapse/expand, and responsive layout. In the TUI, the same diff data is rendered with terminal-appropriate syntax highlighting and keyboard-driven navigation. In the CLI, users can retrieve the diff as structured JSON or view it as formatted terminal output. All surfaces consume the same API and present the same logical content, ensuring that reviewers see identical information regardless of which client they use.

The Landing Diff View is designed to be jj-native. Each change in the stack is identified by its stable jj change ID, and the diff for each change represents the work done relative to its parent — not a branch comparison. This means reviewers always see logically coherent diffs that correspond to the author's intended atomic units of work, even after rebases or other history rewrites that would change commit hashes in a traditional git workflow.

## Acceptance Criteria

### Definition of Done

- [ ] The landing diff API endpoint returns complete, parseable diff data for every change in the landing request's change stack
- [ ] The web UI renders the diff tab with syntax-highlighted, navigable diffs for all file changes
- [ ] The TUI renders diffs with terminal-appropriate syntax highlighting and keyboard controls
- [ ] The CLI can output landing diffs as structured JSON and formatted terminal text
- [ ] Unified view, split view, and whitespace toggle function correctly across web and TUI
- [ ] The file tree sidebar accurately reflects all changed files with correct change types and statistics
- [ ] Binary files are detected and displayed with an appropriate placeholder instead of raw content
- [ ] Renamed and copied files display both old and new paths
- [ ] The feature is gated behind the `LANDING_DIFF_VIEW` feature flag
- [ ] All acceptance criteria tests pass

### Functional Constraints

- [ ] The diff endpoint must return diffs for **every** change ID in the landing request's ordered change stack, preserving stack order
- [ ] Each change's diff must represent modifications relative to that change's parent, not relative to the target bookmark
- [ ] File change types must be one of: `added`, `deleted`, `modified`, `renamed`, `copied`
- [ ] The `additions` and `deletions` counts per file must accurately reflect the number of added/removed lines in the patch
- [ ] When `ignore_whitespace` is `true`, files with only whitespace modifications must be excluded from the response
- [ ] When `ignore_whitespace` is `true`, hunks within files that contain only whitespace adjustments must be stripped
- [ ] When `ignore_whitespace` is `true`, `additions` and `deletions` counts must reflect only non-whitespace changes
- [ ] Binary files must set `is_binary: true` and must not include a `patch` field
- [ ] Language detection must work for at least the 47 supported extensions (ts, tsx, js, jsx, py, rs, go, rb, java, swift, c, cpp, cs, zig, lua, sh, sql, md, json, yaml, toml, xml, html, css, scss, less, vue, svelte, astro, dockerfile, makefile, etc.)
- [ ] The file tree sidebar must display a maximum of 500 files; landing requests with more than 500 changed files must show a truncation indicator
- [ ] Empty diffs (landing requests with no file changes) must render a "(No files changed)" placeholder
- [ ] The `patch` field must contain valid unified diff format parseable by standard diff libraries

### Edge Cases

- [ ] A landing request with zero changes in its stack returns an empty `changes` array
- [ ] A landing request with a single change returns exactly one entry in `changes`
- [ ] A change that modifies 0 files returns an empty `file_diffs` array for that change
- [ ] A file renamed to the same directory but different name shows both `old_path` and `path`
- [ ] A file renamed and modified simultaneously shows both the rename metadata and the content diff
- [ ] Files with no trailing newline render correctly without spurious diff artifacts
- [ ] Very large files (>100,000 lines) do not crash the diff parser; they may be truncated with an indicator
- [ ] Very large diffs (>1,000 changed files across the stack) return within a reasonable timeout (≤30 seconds)
- [ ] Files with special characters in paths (spaces, unicode, dots) are handled correctly
- [ ] Files at the repository root and deeply nested files are both displayed correctly in the file tree
- [ ] A landing request whose change IDs no longer resolve (orphaned changes) returns an appropriate error per change rather than failing the entire response
- [ ] Conflict state in a change does not prevent the diff from being returned; conflicts are surfaced separately via the conflicts endpoint
- [ ] The diff view gracefully degrades when the `LANDING_DIFF_VIEW` feature flag is disabled (the diff tab is hidden or shows an upgrade prompt)

### Boundary Constraints

- [ ] File paths: maximum 4,096 characters (filesystem limit)
- [ ] Patch content per file: no explicit size cap, but files exceeding 1 MB of patch text should display a "Large diff" collapse with option to expand
- [ ] Change stack size: landing requests with up to 100 changes must be supported
- [ ] `landing_number`: positive integer, must match an existing landing request
- [ ] `ignore_whitespace` parameter: boolean only; non-boolean values return 400

## Design

### API Shape

#### Get Landing Diff

```
GET /api/repos/:owner/:repo/landings/:number/diff
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization slug |
| `repo` | string | Repository name |
| `number` | integer | Landing request number |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ignore_whitespace` | boolean | `false` | When `true`, exclude whitespace-only changes |

**Success Response (200):**
```json
{
  "landing_number": 42,
  "changes": [
    {
      "change_id": "zxkpqrst",
      "file_diffs": [
        {
          "path": "src/components/DiffView.tsx",
          "old_path": null,
          "change_type": "modified",
          "patch": "@@ -10,7 +10,9 @@ ...",
          "is_binary": false,
          "language": "tsx",
          "additions": 15,
          "deletions": 3,
          "old_content": null,
          "new_content": null
        },
        {
          "path": "assets/logo.png",
          "old_path": null,
          "change_type": "added",
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
  ]
}
```

**Error Responses:**
| Status | Condition |
|--------|-----------||
| 400 | Invalid `ignore_whitespace` value or malformed `number` |
| 401 | Unauthenticated request to a private repository |
| 403 | Authenticated user lacks read access to the repository |
| 404 | Repository or landing request not found |
| 500 | Internal error during jj diff generation |

### SDK Shape

The `LandingService.getLandingDiff()` method is the authoritative implementation:

```typescript
getLandingDiff(
  viewer: User | null,
  owner: string,
  repo: string,
  number: number,
  opts: LandingDiffOptions,
): Promise<Result<LandingDiffResponse, APIError>>
```

Where:
```typescript
interface LandingDiffOptions {
  ignore_whitespace: boolean;
}

interface LandingDiffResponse {
  landing_number: number;
  changes: FileDiff[];
}

interface FileDiff {
  change_id: string;
  file_diffs: FileDiffItem[];
}

interface FileDiffItem {
  path: string;
  old_path?: string | null;
  change_type: "added" | "deleted" | "modified" | "renamed" | "copied";
  patch?: string | null;
  is_binary: boolean;
  language?: string | null;
  additions: number;
  deletions: number;
  old_content?: string | null;
  new_content?: string | null;
}
```

The service resolves the landing request, iterates its ordered change IDs, calls `RepoHostService.getChangeDiff()` for each, and assembles the combined response.

### Web UI Design

**Location:** Diff tab within the landing request detail page (`/:owner/:repo/landings/:number`, Diff tab)

**Layout:**
- **File tree sidebar** (left, 25% width, min 200px, max 350px):
  - Summary header: "N files changed" with aggregate `+additions / -deletions`
  - Search/filter input: case-insensitive substring match on file paths
  - Scrollable file list: each entry shows change-type badge (colored A/D/M/R/C), truncated file path (with tooltip for full path), and stat summary (`+N -M`)
  - Currently viewed file is highlighted with an active background
  - Clicking a file scrolls the main pane to that file's diff section
  - Sidebar is collapsible via toggle button; hidden by default below 768px viewport width
  - Files with >500 entries show truncation indicator: "Showing 500 of N files"
- **Diff pane** (right, remaining width):
  - **Per-change grouping**: Changes are grouped under collapsible headers showing the change ID
  - **File headers**: For each file within a change — file path (with old path for renames: `old_path → path`), change-type badge, stat summary, collapse/expand toggle
  - **Hunk rendering**: Standard unified diff hunks with `@@` line range headers
  - **Line numbers**: Two-column gutter (old line number, new line number)
  - **Syntax highlighting**: Applied per language detected from file extension
  - **Binary file placeholder**: "Binary file added/modified/deleted" text instead of patch content
  - **Large diff collapse**: Files with >1 MB of patch text show "Large diff collapsed — click to expand"
  - **Empty state**: "(No files changed)" centered in the diff pane when no diffs exist

**Controls (toolbar above diff pane):**
- **View toggle**: Unified (default) / Split button group
  - Split view only available at ≥768px viewport width; button disabled with tooltip below that threshold
  - Split view renders old content (left pane, red deletions) and new content (right pane, green additions) with synchronized scroll and alignment padding
- **Whitespace toggle**: Checkbox labeled "Hide whitespace changes"
  - Triggers re-fetch with `ignore_whitespace=true`
  - Badge shows count of hidden whitespace-only files when active
- **Line numbers toggle**: Checkbox to show/hide line number gutters
- **Expand all / Collapse all**: Applies to all file sections and hunks

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `t` | Toggle unified/split view |
| `w` | Toggle whitespace filtering |
| `l` | Toggle line numbers |
| `]` | Jump to next file |
| `[` | Jump to previous file |
| `z` | Collapse current hunk |
| `x` | Expand current hunk |

**Loading States:**
- Skeleton loader for the diff pane while API request is in flight
- Per-change spinners if individual change diffs load incrementally
- Error state with retry button if the diff fetch fails

**Responsive Behavior:**
- Below 768px: file tree sidebar hidden by default (toggleable), split view unavailable, full-width unified diff
- Between 768px and 1200px: sidebar collapsible, both view modes available
- Above 1200px: sidebar visible by default, both view modes available

### CLI Command

```
codeplane land diff <number> [--repo <owner/repo>] [--ignore-whitespace] [--json]
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<number>` | Landing request number (required) |

**Flags:**
| Flag | Short | Description |
|------|-------|-------------|
| `--repo` | `-R` | Repository in `owner/repo` format (defaults to current repo context) |
| `--ignore-whitespace` | `-w` | Hide whitespace-only changes |
| `--json` | | Output raw JSON response |

**Default (non-JSON) output:**
```
Landing #42 — 3 changes, 12 files changed (+145 -38)

Change zxkpqrst
  M  src/components/DiffView.tsx  +15 -3
  A  src/components/FileTree.tsx  +82 -0
  D  src/old/LegacyDiff.tsx       +0 -47

Change abcdefgh
  M  src/api/client.ts           +23 -8
  R  src/utils/format.ts → src/lib/format.ts  +5 -2
```

When `--json` is specified, the raw `LandingDiffResponse` JSON is emitted for programmatic consumption.

### TUI UI

**Screen:** Diff screen, reachable from landing request detail by selecting the Diff tab or pressing `d`.

**Layout:**
- File tree sidebar on the left (toggleable with `Ctrl+B`)
- Main diff pane on the right showing unified diff by default
- Status bar at bottom showing: current file name, position in file list (`3/12`), view mode, whitespace toggle state

**Keyboard Controls:**
| Key | Action |
|-----|--------|
| `t` | Toggle unified/split view (split requires ≥120 columns) |
| `w` | Toggle whitespace filtering |
| `l` | Toggle line numbers |
| `]` | Next file |
| `[` | Previous file |
| `z` | Collapse hunk |
| `x` | Expand hunk |
| `Ctrl+B` | Toggle file tree sidebar |
| `j`/`k` or ↑/↓ | Scroll diff |
| `q` | Back to landing detail |

**Syntax Highlighting:**
- Uses the 3-tier color system (truecolor > 256-color > 16-color) based on terminal capabilities
- `SyntaxStyle` instance created via `useDiffSyntaxStyle` hook, memoized per component lifecycle
- Falls back to plain text rendering if syntax highlighting initialization fails

**Split View:**
- Only available when terminal width ≥120 columns
- Synchronized scrolling between left (old) and right (new) panes
- Filler lines inserted to maintain vertical alignment

### VS Code Extension

The VS Code extension should provide:
- A command `Codeplane: View Landing Diff` accessible from the command palette
- Webview panel rendering the landing diff using the same web UI components
- Integration with the existing landing request tree view — selecting a landing request and choosing "View Diff" opens the diff webview

### Neovim Plugin

The Neovim plugin should provide:
- `:CodeplaneLandingDiff <number>` command to fetch and display the landing diff
- Output rendered in a scratch buffer with filetype-aware syntax highlighting
- Telescope picker for file navigation within the diff

### Documentation

End-user documentation should cover:
- **"Reviewing Landing Request Diffs"** guide explaining: how to navigate to the diff tab, how to read the change stack layout, how to use unified vs. split view, how to toggle whitespace, how to use the file tree sidebar
- **CLI reference** for `codeplane land diff` with all flags and example output
- **Keyboard shortcut reference** for web and TUI diff navigation
- **FAQ entry**: "Why does each change show its own diff?" — explaining jj's change-relative diff model vs. branch diffs

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Repository Owner** | Full access to landing diff view |
| **Repository Admin** | Full access to landing diff view |
| **Repository Member (Write)** | Full access to landing diff view |
| **Repository Member (Read)** | Full access to landing diff view |
| **Anonymous (public repo)** | Full access to landing diff view |
| **Anonymous (private repo)** | 401 Unauthorized |
| **Authenticated, non-member (private repo)** | 403 Forbidden |

The landing diff view is a read-only surface. Any user who can view the landing request can view its diff. Authorization is inherited from the repository's read-access check via `resolveReadableLanding()`.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Authenticated user, per repo | 60 requests | 1 minute |
| Anonymous user, per IP | 20 requests | 1 minute |
| Per landing request | 120 requests | 1 minute |

The diff endpoint is computationally expensive (it invokes `jj diff` subprocesses for each change). Rate limits should be tighter than standard read endpoints to prevent abuse.

### Data Privacy

- Diff content may contain sensitive source code. The endpoint must enforce repository access checks before returning any diff data.
- The `old_content` and `new_content` fields (when populated for small files) expose full file contents — the same access controls apply.
- No PII is included in the diff response schema itself. User information (who authored the change) is not part of the diff payload.
- Diff responses must not be cached in shared/public HTTP caches. The `Cache-Control: private, no-store` header should be set for private repositories.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingDiffViewed` | User loads the diff tab or fetches the diff endpoint | `landing_number`, `repo_owner`, `repo_name`, `change_count`, `total_files_changed`, `total_additions`, `total_deletions`, `ignore_whitespace`, `client` (web/cli/tui/vscode/neovim) |
| `LandingDiffViewToggled` | User toggles between unified and split view | `landing_number`, `view_mode` (unified/split), `client` |
| `LandingDiffWhitespaceToggled` | User toggles whitespace filtering | `landing_number`, `ignore_whitespace`, `client` |
| `LandingDiffFileNavigated` | User clicks a file in the sidebar or uses `]`/`[` navigation | `landing_number`, `file_path`, `navigation_method` (sidebar_click/keyboard), `client` |
| `LandingDiffHunkToggled` | User collapses or expands a hunk | `landing_number`, `action` (collapse/expand), `client` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Diff view rate** | % of landing request detail views that navigate to the diff tab | ≥60% |
| **View mode adoption** | % of diff views that toggle to split mode at least once | ≥20% |
| **Whitespace toggle usage** | % of diff views that toggle whitespace filtering | ≥10% |
| **File tree navigation rate** | % of diff views with >1 file that use sidebar navigation | ≥40% |
| **Diff-to-review conversion** | % of diff views followed by a review submission within the same session | ≥15% |
| **Diff load success rate** | % of diff fetches that return 200 | ≥99.5% |

### Success Indicators

- Reviewers who view diffs approve or request changes faster (time from landing request open to first review decreases)
- Diff view is the most-visited tab on landing request detail pages
- Multi-client usage: users view diffs across web, TUI, and CLI

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Diff endpoint request received | `info` | `owner`, `repo`, `landing_number`, `ignore_whitespace`, `viewer_id` | Entry log for every diff request |
| Landing request resolved | `debug` | `landing_number`, `change_count`, `change_ids` | After successful landing lookup |
| jj diff subprocess started | `debug` | `change_id`, `repo_path` | Before invoking `jj diff` for each change |
| jj diff subprocess completed | `info` | `change_id`, `duration_ms`, `file_count`, `exit_code` | After each `jj diff` completes |
| jj diff subprocess failed | `error` | `change_id`, `exit_code`, `stderr`, `duration_ms` | When `jj diff` returns non-zero exit |
| Diff parse completed | `debug` | `change_id`, `file_count`, `total_additions`, `total_deletions`, `binary_file_count` | After parsing diff output |
| Large diff truncated | `warn` | `change_id`, `file_path`, `original_size_bytes`, `truncated_to_bytes` | When a file's patch exceeds 1 MB |
| Diff endpoint response sent | `info` | `landing_number`, `total_changes`, `total_files`, `response_time_ms`, `status_code` | Exit log for the request |
| Diff endpoint error | `error` | `landing_number`, `error_type`, `error_message`, `status_code` | Any 4xx/5xx response |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_diff_requests_total` | Counter | `status`, `owner`, `repo` | Total diff endpoint requests |
| `codeplane_landing_diff_request_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request latency (buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30) |
| `codeplane_landing_diff_jj_subprocess_duration_seconds` | Histogram | `owner`, `repo` | Per-change jj diff subprocess latency |
| `codeplane_landing_diff_jj_subprocess_errors_total` | Counter | `owner`, `repo`, `exit_code` | jj subprocess failures |
| `codeplane_landing_diff_files_per_request` | Histogram | | Total files changed per diff response (buckets: 1, 5, 10, 25, 50, 100, 250, 500, 1000) |
| `codeplane_landing_diff_changes_per_request` | Histogram | | Changes in stack per diff response (buckets: 1, 2, 5, 10, 25, 50, 100) |
| `codeplane_landing_diff_response_size_bytes` | Histogram | | Response body size |
| `codeplane_landing_diff_large_files_truncated_total` | Counter | `owner`, `repo` | Files exceeding 1 MB patch threshold |

### Alerts

#### Alert: Landing Diff High Error Rate
- **Condition:** `rate(codeplane_landing_diff_requests_total{status=~"5.."}[5m]) / rate(codeplane_landing_diff_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check `codeplane_landing_diff_jj_subprocess_errors_total` — if elevated, the jj binary may be unavailable or repos may be corrupted
  2. SSH into the server and verify `jj --version` runs successfully
  3. Check disk space on the repository storage volume (`df -h`)
  4. Inspect recent error logs: `grep "Diff endpoint error" /var/log/codeplane/server.log | tail -50`
  5. Check if a specific repository is causing all errors (filter by `owner`/`repo` labels)
  6. If a single repo is corrupted, attempt `jj debug reindex` on that repo
  7. If jj binary is missing or broken, redeploy the server image

#### Alert: Landing Diff High Latency
- **Condition:** `histogram_quantile(0.95, rate(codeplane_landing_diff_request_duration_seconds_bucket[5m])) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_landing_diff_changes_per_request` — if p95 change count is unusually high, users may be creating very large landing requests
  2. Check `codeplane_landing_diff_jj_subprocess_duration_seconds` — if individual jj calls are slow, the issue is disk I/O or repo size
  3. Check server CPU and memory utilization
  4. Check if concurrent diff requests are overwhelming the jj subprocess pool
  5. Consider adding a concurrency limiter for jj subprocess invocations per repository
  6. If chronic, evaluate caching diff results for recently-computed change IDs

#### Alert: Landing Diff jj Subprocess Failure Spike
- **Condition:** `rate(codeplane_landing_diff_jj_subprocess_errors_total[5m]) > 1`
- **Severity:** Warning
- **Runbook:**
  1. Check the `exit_code` label to determine failure type
  2. Exit code 1: likely the change ID no longer exists (orphaned change) — check if landing requests reference stale changes
  3. Exit code 2: jj command-line usage error — check if the jj CLI version has changed and the command syntax needs updating
  4. Exit code 137: OOM kill — check container memory limits and jj memory usage for large repos
  5. Inspect `stderr` in structured logs for the specific error message
  6. If persistent, check jj repo integrity with `jj debug check-repository`

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Landing request not found | 404 | Return structured error: `{ "error": "landing_not_found", "message": "Landing request #N not found" }` |
| Repository not found | 404 | Return structured error: `{ "error": "repo_not_found" }` |
| User lacks access | 401/403 | Return auth error without leaking repository existence |
| jj subprocess timeout (>30s per change) | 500 | Kill subprocess, return partial results for completed changes with error annotation for timed-out changes |
| jj subprocess crash | 500 | Return error for the specific change, include other changes' diffs if available |
| Change ID no longer resolvable | 200 | Include the change in the response with empty `file_diffs` and an `error` field: `{ "change_id": "abc", "file_diffs": [], "error": "change_not_found" }` |
| Repository storage unavailable | 500 | Return `{ "error": "storage_unavailable" }` with retry-after header |
| Feature flag disabled | 403 | Return `{ "error": "feature_disabled", "message": "Landing diff view is not enabled" }` |
| Invalid `ignore_whitespace` parameter | 400 | Return `{ "error": "invalid_parameter", "field": "ignore_whitespace" }` |

## Verification

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| `api.landing-diff.200-basic` | Fetch diff for a landing request with 1 change and 1 modified file; verify response shape matches `LandingDiffResponse` schema exactly |
| `api.landing-diff.200-multi-change` | Fetch diff for a landing request with 3 changes; verify `changes` array has 3 entries in correct stack order |
| `api.landing-diff.200-change-types` | Create a landing request with added, deleted, modified, renamed, and copied files; verify each `change_type` is correct |
| `api.landing-diff.200-binary-file` | Create a landing request modifying a binary file (e.g., PNG); verify `is_binary: true` and `patch` is `null` |
| `api.landing-diff.200-renamed-file` | Create a landing request renaming a file; verify `old_path` is populated and `change_type` is `"renamed"` |
| `api.landing-diff.200-renamed-and-modified` | Rename and modify a file in one change; verify both `old_path` and `patch` are present |
| `api.landing-diff.200-empty-diff` | Create a landing request with a change that modifies no files; verify `file_diffs` is `[]` |
| `api.landing-diff.200-additions-deletions` | Verify `additions` and `deletions` counts match actual line changes in `patch` |
| `api.landing-diff.200-language-detection` | Modify files with various extensions (.ts, .py, .rs, .go); verify `language` field is correct for each |
| `api.landing-diff.200-whitespace-ignore` | Fetch diff with `ignore_whitespace=true`; verify whitespace-only files are excluded |
| `api.landing-diff.200-whitespace-partial` | File has both whitespace and content changes; with `ignore_whitespace=true`, verify whitespace hunks are stripped but content hunks remain |
| `api.landing-diff.200-whitespace-counts` | With `ignore_whitespace=true`, verify `additions`/`deletions` counts reflect non-whitespace changes only |
| `api.landing-diff.200-no-trailing-newline` | Modify a file lacking a trailing newline; verify patch renders correctly without spurious artifacts |
| `api.landing-diff.200-special-chars-path` | Create a file with spaces and unicode in its path; verify `path` field is correct |
| `api.landing-diff.200-deep-nesting` | Modify a file at `a/b/c/d/e/f/g/h.ts`; verify path is preserved correctly |
| `api.landing-diff.200-large-file` | Modify a file with 10,000+ lines changed; verify response is returned within 30 seconds |
| `api.landing-diff.200-max-changes` | Create a landing request with 100 changes; verify all 100 diffs are returned |
| `api.landing-diff.200-many-files` | Create a change modifying 500+ files; verify all files are included in `file_diffs` |
| `api.landing-diff.200-public-anon` | Fetch diff for a public repository without authentication; verify 200 response |
| `api.landing-diff.401-private-anon` | Fetch diff for a private repository without authentication; verify 401 |
| `api.landing-diff.403-private-non-member` | Fetch diff for a private repository as a non-member; verify 403 |
| `api.landing-diff.404-no-landing` | Fetch diff for a non-existent landing request number; verify 404 |
| `api.landing-diff.404-no-repo` | Fetch diff for a non-existent repository; verify 404 |
| `api.landing-diff.400-invalid-whitespace` | Pass `ignore_whitespace=notabool`; verify 400 |
| `api.landing-diff.400-invalid-number` | Pass `number=abc`; verify 400 |
| `api.landing-diff.200-orphaned-change` | Fetch diff for a landing request where one change ID no longer exists; verify the response includes the change with an error annotation and other changes' diffs are intact |
| `api.landing-diff.feature-flag-disabled` | Disable `LANDING_DIFF_VIEW` feature flag; verify the endpoint returns 403 or appropriate gated response |
| `api.landing-diff.rate-limit` | Issue 61+ requests in 1 minute as the same user; verify 429 on the 61st request |

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| `e2e.web.landing-diff.tab-navigation` | Navigate to a landing request detail page and click the Diff tab; verify the diff content loads |
| `e2e.web.landing-diff.file-tree-visible` | On a landing with 5 changed files, verify the file tree sidebar shows all 5 files with correct badges |
| `e2e.web.landing-diff.file-tree-click` | Click a file in the sidebar; verify the main pane scrolls to that file's diff section |
| `e2e.web.landing-diff.file-tree-search` | Type a filter string in the sidebar search; verify only matching files are shown |
| `e2e.web.landing-diff.unified-view-default` | Verify unified view is the default rendering mode |
| `e2e.web.landing-diff.split-view-toggle` | Click the split view button; verify the layout changes to side-by-side |
| `e2e.web.landing-diff.split-view-min-width` | At viewport <768px, verify split view button is disabled |
| `e2e.web.landing-diff.whitespace-toggle` | Check the "Hide whitespace changes" checkbox; verify whitespace-only files disappear from the diff |
| `e2e.web.landing-diff.line-numbers` | Toggle line numbers off; verify gutter columns are hidden |
| `e2e.web.landing-diff.hunk-collapse` | Click collapse on a hunk; verify the hunk content is hidden |
| `e2e.web.landing-diff.hunk-expand` | Collapse then expand a hunk; verify content reappears |
| `e2e.web.landing-diff.binary-placeholder` | View a diff with a binary file; verify "Binary file" placeholder is shown |
| `e2e.web.landing-diff.rename-display` | View a diff with a renamed file; verify `old → new` path display |
| `e2e.web.landing-diff.empty-diff` | View a landing with no file changes; verify "(No files changed)" placeholder |
| `e2e.web.landing-diff.keyboard-t` | Press `t`; verify view mode toggles |
| `e2e.web.landing-diff.keyboard-w` | Press `w`; verify whitespace toggle activates |
| `e2e.web.landing-diff.keyboard-bracket` | Press `]` and `[`; verify file navigation works |
| `e2e.web.landing-diff.loading-state` | Intercept API call to delay; verify skeleton loader is displayed |
| `e2e.web.landing-diff.error-state` | Intercept API call to return 500; verify error message with retry button |
| `e2e.web.landing-diff.syntax-highlighting` | View a TypeScript file diff; verify syntax tokens are colored (check for syntax-highlight CSS classes) |
| `e2e.web.landing-diff.responsive-sidebar` | At <768px viewport, verify sidebar is hidden by default; toggle it visible |
| `e2e.web.landing-diff.large-diff-collapse` | View a diff with a very large file; verify "Large diff collapsed" indicator |
| `e2e.web.landing-diff.change-grouping` | View a landing with 2+ changes; verify diffs are grouped under change ID headers |
| `e2e.web.landing-diff.truncation-indicator` | View a diff with 500+ files; verify truncation indicator is shown |

### CLI Integration Tests

| Test ID | Description |
|---------|-------------|
| `cli.landing-diff.basic` | Run `codeplane land diff 1`; verify formatted output shows change IDs, file paths, and stat summaries |
| `cli.landing-diff.json` | Run `codeplane land diff 1 --json`; verify output is valid JSON matching `LandingDiffResponse` schema |
| `cli.landing-diff.whitespace` | Run `codeplane land diff 1 -w`; verify whitespace-only files are excluded |
| `cli.landing-diff.repo-flag` | Run `codeplane land diff 1 -R owner/repo`; verify correct repository is queried |
| `cli.landing-diff.not-found` | Run `codeplane land diff 99999`; verify error message for non-existent landing |
| `cli.landing-diff.no-auth` | Run `codeplane land diff 1` against a private repo without auth; verify auth error |

### TUI Integration Tests

| Test ID | Description |
|---------|-------------|
| `tui.landing-diff.render` | Navigate to a landing request diff screen; verify diff content renders |
| `tui.landing-diff.unified-default` | Verify unified view is the default |
| `tui.landing-diff.split-toggle` | Press `t`; verify split view activates (at sufficient terminal width) |
| `tui.landing-diff.whitespace-toggle` | Press `w`; verify whitespace toggle |
| `tui.landing-diff.file-navigation` | Press `]` and `[`; verify file navigation and sidebar highlight update |
| `tui.landing-diff.sidebar-toggle` | Press `Ctrl+B`; verify sidebar visibility toggles |
| `tui.landing-diff.syntax-highlighting` | Verify syntax highlighting is applied (check color output) |
| `tui.landing-diff.narrow-terminal` | At <120 columns, verify split view is unavailable |
| `tui.landing-diff.empty-diff` | View a landing with no changes; verify placeholder text |

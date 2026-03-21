# TUI_REPO_FILE_PREVIEW

Specification for TUI_REPO_FILE_PREVIEW.

## High-Level User POV

The file preview is the content pane that occupies the main (right) panel of the code explorer screen when a user selects a file from the file tree sidebar. It answers the question: "What does this file contain, and what do I need to know about it at a glance?"

When the user navigates to the Code tab (Tab 3) of a repository and selects a file in the file tree sidebar (via `Enter` on a focused file node), the file preview panel renders the file's content in the main content area to the right of the tree. The panel has two regions: a compact file header bar at the top and the file content body below it.

The **file header bar** shows the file's path relative to the repository root (e.g., `src/lib/utils.ts`), the detected language label (e.g., `TypeScript`), the file size in human-readable format (e.g., `2.4 KB`), and the line count. If the file is binary, the header shows `BINARY` in a warning-colored badge. The header occupies exactly one row and is always visible, even while scrolling the content body.

The **file content body** renders differently depending on the file type:

- **Text files** are displayed using the `<code>` component with syntax highlighting and line numbers. The user scrolls through the file content using `j`/`k` for line-by-line movement, `Ctrl+D`/`Ctrl+U` for page scrolling, and `G`/`g g` for jumping to the bottom or top.
- **Markdown files** (`.md`, `.mdx`) are rendered using the `<markdown>` component. The user can toggle between rendered markdown and raw source with the `m` key.
- **Binary files** show a centered message: "Binary file — preview not available." No content is fetched beyond the header.
- **Empty files** show "File is empty." in muted text.
- **Large files** (over 100,000 lines or 5 MB) show a warning and display only the first 10,000 lines with a "— truncated —" footer.

The file preview is keyboard-driven. The user can press `y` to copy the file path, `Y` to copy file content, `n` to toggle line numbers, `w` to toggle word wrap, `m` to toggle markdown rendering, `/` to search within the file with `n`/`N` to cycle matches, and `h`/`Left` to return focus to the file tree sidebar.

File content is fetched at a specific jj change ID inherited from the parent code explorer screen, ensuring the preview always shows the file's state at a specific point in the repository's history.

## Acceptance Criteria

### Definition of Done

- The file preview panel renders when a file node is selected (`Enter`) in the code explorer file tree (TUI_REPO_FILE_TREE)
- File content is fetched via `useFileContent(owner, repo, changeId, filePath)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/file/:change_id/{path}`
- The file header bar occupies exactly 1 row and is pinned above the scrollable content body
- The file header displays: relative file path, detected language, file size (human-readable), and line count
- Binary files show `BINARY` badge in the header and "Binary file — preview not available." in the body
- Text files are rendered via `<code>` with syntax highlighting and line numbers
- Markdown files (`.md`, `.mdx`) default to rendered view via `<markdown>` with raw toggle via `m`
- Empty files show "File is empty." centered in muted text
- Large files (>100,000 lines or >5 MB) are truncated at 10,000 lines with a warning and "— truncated —" footer
- Line numbers are displayed by default in a fixed-width gutter (6 chars at ≥120 cols, 4 chars at <120 cols)
- Line numbers are toggleable with `n`
- Word wrap is off by default and toggleable with `w`
- `y` copies the file path to the clipboard; `Y` copies the file content
- `/` activates inline search with match highlighting; `n`/`N` cycle matches; `Esc` clears
- `h`/`Left` returns focus to the file tree sidebar
- `R` retries a failed content fetch (only active in error state)
- The change ID context is inherited from the parent code explorer screen
- Loading state shows a centered spinner with "Loading…" in the content body
- Error states show inline error message in red with "Press `R` to retry"

### Keyboard Interactions

- `j` / `Down`: Scroll content down by one line
- `k` / `Up`: Scroll content up by one line
- `Ctrl+D`: Page down (half visible height)
- `Ctrl+U`: Page up (half visible height)
- `G`: Scroll to bottom of content
- `g g`: Scroll to top of content
- `y`: Copy file path to clipboard
- `Y`: Copy file content to clipboard (text files only)
- `n`: Toggle line numbers (outside search) / Next match (in search)
- `N`: Previous search match
- `w`: Toggle word wrap
- `m`: Toggle markdown/raw view (`.md`/`.mdx` only)
- `/`: Activate search input
- `Esc` (search): Clear search, return focus to content
- `h` / `Left`: Return focus to file tree sidebar
- `R`: Retry failed fetch (error state only)
- `q`: Pop code explorer screen
- `?`: Show help overlay

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router
- 80×24 – 119×39: File tree hidden. Full-width preview. Gutter 4 chars. Path truncated with `…/`
- 120×40 – 199×59: Sidebar 25%, preview 75%. Gutter 6 chars. Full path
- 200×60+: Wider margins, gutter 6 chars with extra spacing

### Truncation and Boundary Constraints

- File path: truncated from left with `…/` at <120 cols if exceeding available width
- Language label: max 20 characters, truncated with `…`
- File size: max 8 characters (e.g., `999.9 MB`)
- Line count: comma-formatted, max 14 characters
- Line number gutter: 4 chars (<120 cols), 6 chars (≥120 cols)
- Content body: max 10,000 lines displayed
- File content fetch: max 5 MB response
- Search input: max 256 characters
- Search matches: max 10,000 tracked
- Clipboard copy: max 1 MB content
- Horizontal line length: hard-truncated at 10,000 chars in non-wrap mode

### Edge Cases

- Terminal resize while scrolled: scroll position preserved, gutter width may change on breakpoint crossing
- Rapid key presses: processed sequentially, no debouncing
- File deleted between tree load and selection: 404 error with `R` to retry
- File with zero bytes: "File is empty." Header shows `0 B` and `0 lines`
- File with extremely long single line (>10,000 chars): truncated with `…` in non-wrap, wraps in wrap mode
- No detected language: "Plain Text" shown, no syntax highlighting
- Non-UTF-8 content: rendered with U+FFFD replacements, `NON-UTF8` badge
- Search with no matches: "No matches" shown, `n`/`N` are no-ops
- Search wraps around at both ends
- `m` on non-markdown file: no-op
- `Y` on binary file: "Cannot copy binary file content"
- Multiple rapid file selections: previous fetch aborted, only last renders
- SSE disconnect: unaffected (uses REST)

## Design

### Layout Structure

The file preview occupies the main (right) panel within the code explorer's sidebar+main split:

```
┌──────────┬──────────────────────────────────────┐
│ File     │ src/lib/utils.ts   TypeScript  2.4 KB │ ← File header bar (1 row, pinned)
│ Tree     ├──────────────────────────────────────┤
│ (25%)    │   1 │ import { join } from "path";   │ ← Code content with line numbers
│          │   2 │                                 │
│          │   3 │ export function slugify(       │
│          │  ...│                                 │
└──────────┴──────────────────────────────────────┘
```

At 80×24 (sidebar hidden): full-width preview with 4-char gutter and truncated path.

### Component Structure

```jsx
<box flexDirection="column" flexGrow={1}>
  {/* File header bar — pinned, 1 row */}
  <box flexDirection="row" height={1} borderBottom="single" borderColor="border" paddingX={1}>
    <box flexGrow={1}>
      <text bold>{truncatePath(file.path, availableWidth)}</text>
    </box>
    <box flexDirection="row" gap={2}>
      {file.isBinary && <text color="warning" bold>BINARY</text>}
      {file.isNonUtf8 && <text color="warning" bold>NON-UTF8</text>}
      <text color="muted">{file.language ?? "Plain Text"}</text>
      <text color="muted">{formatFileSize(file.size)}</text>
      <text color="muted">{formatLineCount(file.lineCount)} lines</text>
    </box>
  </box>

  {/* Content body — conditional rendering based on file type/state */}
  {isLoading ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text>Loading…</text>
    </box>
  ) : error ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text color="error">{error.message}</text>
      <text color="muted">Press R to retry</text>
    </box>
  ) : file.isBinary ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text color="muted">Binary file — preview not available.</text>
    </box>
  ) : file.lineCount === 0 ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text color="muted">File is empty.</text>
    </box>
  ) : isMarkdown && markdownMode ? (
    <scrollbox flexGrow={1}>
      <box paddingX={1}><markdown>{file.content}</markdown></box>
    </scrollbox>
  ) : (
    <scrollbox flexGrow={1}>
      <code language={file.language} lineNumbers={showLineNumbers}
            wrap={wordWrap} gutterWidth={gutterWidth}
            highlightRanges={searchHighlights}>
        {displayContent}
      </code>
      {isTruncated && (
        <box justifyContent="center" height={1}>
          <text color="muted">— truncated —</text>
        </box>
      )}
    </scrollbox>
  )}

  {/* Search bar — conditional */}
  {searchActive && (
    <box height={1} borderTop="single" borderColor="border" paddingX={1}>
      <text color="muted">/</text>
      <input value={searchQuery} onChange={setSearchQuery} placeholder="Search…" />
      <text color="muted">
        {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : searchQuery.length > 0 ? "No matches" : ""}
      </text>
    </box>
  )}
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Scroll down | Content focused |
| `k` / `Up` | Scroll up | Content focused |
| `Ctrl+D` | Page down | Content focused |
| `Ctrl+U` | Page up | Content focused |
| `G` | Scroll to bottom | Content focused |
| `g g` | Scroll to top | Content focused |
| `y` | Copy file path | Not in error state |
| `Y` | Copy file content | Text file, not error |
| `n` | Toggle line numbers / Next match | Normal mode / Search mode |
| `N` | Previous search match | Search mode |
| `w` | Toggle word wrap | Text file displayed |
| `m` | Toggle markdown/raw | `.md`/`.mdx` only |
| `/` | Activate search | Text file displayed |
| `Esc` (search) | Clear search | Search active |
| `h` / `Left` | Return to tree | Content focused |
| `R` | Retry fetch | Error state |
| `q` | Pop screen | Always |
| `?` | Help overlay | Always |

### Keybinding Mode Transitions

Normal mode → `/` → Search mode (input focused) → `Enter` → Normal mode (highlights kept) or `Esc` → Normal mode (highlights cleared). `n` in normal mode toggles line numbers; `n` in search mode navigates to next match.

### Search Behavior

Incremental search with literal text matching. Matches highlighted with reverse-video `warning` color. Active match in `primary` color. Match count displayed as `current/total`. Wraps at both ends. Debounced by 150ms for files >5,000 lines. Max 10,000 matches tracked.

### Data Hooks

- `useFileContent(owner, repo, changeId, filePath)` from `@codeplane/ui-core` — fetches file content at a jj change. Calls `GET /api/repos/:owner/:repo/file/:change_id/{path}`
- `useClipboard()` — clipboard write with `supported` check
- `useTerminalDimensions()` — responsive breakpoints, gutter width
- `useOnResize()` — synchronous re-layout
- `useKeyboard()` — keybinding registration
- `useNavigation()` — context access (changeId, repo)

File metadata (language, size, line count, binary detection) derived client-side from content and file extension.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (no access) | Read-Only | Member | Admin | Owner |
|--------|-----------|---------------------------|-----------|--------|-------|-------|
| View file in public repo | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View file in private repo | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Copy file path | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Copy file content | ❌ | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Search within file | ❌ | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- Private repositories return 404 to users without read access (does not leak existence)
- File content API endpoint enforces the same repository-level access control as the repository overview
- No write operations are performed by the file preview — it is a read-only view

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to the app-shell auth error screen
- File content is never cached to disk — only held in memory during the session

### Rate Limiting

- Authenticated users: 5,000 requests per hour to the file content endpoint (platform-wide)
- Rapid file selection: previous fetches aborted via AbortController, only final request counts against limits
- 429 responses show "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit; user presses `R` manually

### Input Sanitization

- `owner`, `repo`, `changeId` validated against `^[a-zA-Z0-9_.-]+$`
- `filePath` validated to not contain `..` path traversal; rejected client-side before API request
- Search input treated as literal text — no regex execution, no injection risk
- File content rendered via `<code>` and `<markdown>` components which handle escaping

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.file_preview.view` | File content loads successfully | `repo_full_name`, `file_path`, `language`, `file_size_bytes`, `line_count`, `is_binary`, `is_markdown`, `is_truncated`, `change_id`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `sidebar_visible` |
| `tui.repo.file_preview.scroll` | User scrolls within file content | `repo_full_name`, `file_path`, `scroll_depth_percent`, `method` (j_k/ctrl_d_u/G_gg) |
| `tui.repo.file_preview.copy_path` | User presses `y` | `repo_full_name`, `file_path`, `copy_success` |
| `tui.repo.file_preview.copy_content` | User presses `Y` | `repo_full_name`, `file_path`, `file_size_bytes`, `copy_success`, `failure_reason` |
| `tui.repo.file_preview.toggle_line_numbers` | User presses `n` | `repo_full_name`, `file_path`, `line_numbers_visible` |
| `tui.repo.file_preview.toggle_word_wrap` | User presses `w` | `repo_full_name`, `file_path`, `word_wrap_enabled` |
| `tui.repo.file_preview.toggle_markdown` | User presses `m` on markdown file | `repo_full_name`, `file_path`, `view_mode` (rendered/raw) |
| `tui.repo.file_preview.search` | User submits search query | `repo_full_name`, `file_path`, `query_length`, `match_count`, `search_duration_ms` |
| `tui.repo.file_preview.search_navigate` | User presses `n`/`N` in search | `repo_full_name`, `file_path`, `direction`, `match_index`, `total_matches` |
| `tui.repo.file_preview.error` | File fetch fails | `repo_full_name`, `file_path`, `change_id`, `error_type`, `http_status` |
| `tui.repo.file_preview.retry` | User presses `R` | `repo_full_name`, `file_path`, `error_type`, `retry_success` |
| `tui.repo.file_preview.navigate_back` | User presses `h`/`Left` to tree | `repo_full_name`, `file_path`, `time_on_file_ms` |
| `tui.repo.file_preview.large_file_warning` | Large file truncation triggered | `repo_full_name`, `file_path`, `actual_line_count`, `actual_size_bytes`, `displayed_lines` |

### Success Indicators

- **File preview load completion rate**: >98% of file selections result in successful preview
- **Average time on file**: median >5s indicates engagement (track trend)
- **Search usage rate**: >15% of file preview sessions use search
- **Copy usage rate**: >8% of sessions use path or content copy
- **Markdown toggle rate**: track trend for rendered vs. raw preference
- **Error rate**: <2% of file preview loads fail
- **Retry success rate**: >80% of retries succeed
- **Large file encounter rate**: <5% trigger truncation
- **Files viewed per session**: median >3 files per code explorer session

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | File content loaded | `file_path`, `change_id`, `load_time_ms`, `file_size_bytes`, `language`, `line_count` |
| `info` | File path copied | `file_path`, `copy_success` |
| `info` | File content copied | `file_path`, `copy_success`, `content_size_bytes` |
| `warn` | File content fetch failed | `file_path`, `change_id`, `http_status`, `error_message` (no token) |
| `warn` | Rate limited | `file_path`, `retry_after_seconds` |
| `warn` | Large file truncated | `file_path`, `actual_lines`, `displayed_lines`, `actual_size_bytes` |
| `warn` | Non-UTF-8 content | `file_path`, `byte_offset_first_invalid` |
| `warn` | Clipboard copy failed | `file_path`, `reason` (not_supported/permission_denied/too_large) |
| `warn` | Path traversal blocked | `file_path` (rejected path) |
| `debug` | Scroll position updated | `file_path`, `scroll_percent`, `content_height`, `viewport_height` |
| `debug` | Resize triggered | `old_dimensions`, `new_dimensions`, `gutter_width_change` |
| `debug` | Search query changed | `file_path`, `query`, `match_count`, `search_duration_ms` |
| `debug` | Markdown/line-number/wrap toggled | `file_path`, new state |
| `debug` | Previous fetch aborted | aborted `file_path`, new `file_path` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout (30s) | Data hook timeout | Error + "Press R to retry" |
| File not found (404) | API 404 | "File not found at this change." + "Press h to go back" |
| Change not found (404) | API 404 with change message | "Change not found." + "Press q to go back" |
| Auth expired (401) | API 401 | Propagated to app-shell auth error |
| Rate limited (429) | API 429 + Retry-After | Inline: "Rate limited. Retry in Ns." |
| Server error (500) | API 5xx | Generic error + R to retry |
| Binary file selected | Null bytes or extension match | "Binary file — preview not available." |
| Non-UTF-8 content | Invalid byte sequences | U+FFFD replacements + NON-UTF8 badge |
| Large file | >5 MB or >100K lines | Truncation warning, first 10K lines |
| Clipboard unavailable | `useClipboard().supported` false | "Copy not available" for 2s |
| Content too large to copy | >1 MB | "File too large to copy" for 2s |
| Terminal resize during load | `useOnResize` during fetch | Renders at new size when data arrives |
| Rapid file selection | Multiple Enter presses | AbortController cancels previous; last loads |
| Path traversal | `..` in filePath | Blocked client-side, warning logged |

### Failure Modes

- **Total fetch failure**: Error in content body. Header shows path from tree node. `h` returns to tree. `R` retries
- **Syntax highlighting failure**: Content rendered without highlighting. No user-facing error. Warning logged
- **Search on large file**: Debounced by 150ms. May show brief delay indicator
- **Memory**: Only one file's content held in memory at a time. Previous content released on new selection
- **AbortController race**: Completed-but-stale responses discarded if file path doesn't match current selection

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

### Terminal Snapshot Tests

1. **`file-preview-text-file`** — Select a `.ts` file. Assert: header with path, "TypeScript", size, line count. Code body with syntax highlighting and line numbers
2. **`file-preview-python-file`** — Select a `.py` file. Assert: "Python" in header
3. **`file-preview-json-file`** — Select a `.json` file. Assert: "JSON" in header
4. **`file-preview-markdown-rendered`** — Select `.md` file. Assert: rendered markdown, no line numbers
5. **`file-preview-markdown-raw`** — Select `.md`, press `m`. Assert: raw source with line numbers
6. **`file-preview-binary-file`** — Select `.png`. Assert: BINARY badge, "preview not available"
7. **`file-preview-empty-file`** — Select 0-byte file. Assert: "File is empty.", "0 B", "0 lines"
8. **`file-preview-large-file-warning`** — Select >100K line file. Assert: truncation warning, 10K lines, "— truncated —"
9. **`file-preview-line-numbers-visible`** — Assert: line numbers in muted gutter
10. **`file-preview-line-numbers-hidden`** — Press `n`. Assert: line numbers hidden
11. **`file-preview-word-wrap-off`** — Long lines. Assert: lines extend beyond width
12. **`file-preview-word-wrap-on`** — Press `w`. Assert: lines wrap
13. **`file-preview-no-language-detected`** — Unknown extension. Assert: "Plain Text"
14. **`file-preview-loading-state`** — Slow API. Assert: "Loading…" centered
15. **`file-preview-error-state`** — Failing API. Assert: error in red, "Press R to retry"
16. **`file-preview-404-state`** — 404 response. Assert: "File not found at this change."
17. **`file-preview-non-utf8-badge`** — Non-UTF-8. Assert: NON-UTF8 badge, replacement characters
18. **`file-preview-search-active`** — `/` + "function". Assert: search bar, highlighted matches
19. **`file-preview-search-no-matches`** — Search nonexistent term. Assert: "No matches"
20. **`file-preview-copied-path-confirmation`** — `y`. Assert: "Path copied!"
21. **`file-preview-copied-content-confirmation`** — `Y` on text. Assert: "Content copied!"
22. **`file-preview-copy-binary-rejected`** — `Y` on binary. Assert: "Cannot copy binary file content"
23. **`file-preview-breadcrumb`** — Assert: breadcrumb with file path

### Keyboard Interaction Tests

24. **`file-preview-j-scrolls-down`** — `j` → scrolled down 1 line
25. **`file-preview-k-scrolls-up`** — scroll down, `k` → scrolled up 1 line
26. **`file-preview-k-at-top-no-op`** — at top, `k` → no scroll
27. **`file-preview-ctrl-d-page-down`** — `Ctrl+D` → page down
28. **`file-preview-ctrl-u-page-up`** — `Ctrl+D` then `Ctrl+U` → original position
29. **`file-preview-G-scrolls-to-bottom`** — `G` → bottom
30. **`file-preview-gg-scrolls-to-top`** — `G` then `g g` → top
31. **`file-preview-y-copies-path`** — `y` → clipboard has file path
32. **`file-preview-Y-copies-content`** — `Y` → clipboard has content
33. **`file-preview-Y-on-binary-shows-error`** — binary + `Y` → error in status bar
34. **`file-preview-n-toggles-line-numbers`** — `n` → hidden, `n` → visible
35. **`file-preview-w-toggles-word-wrap`** — `w` → wrap on, `w` → wrap off
36. **`file-preview-m-toggles-markdown`** — `.md` + `m` → raw, `m` → rendered
37. **`file-preview-m-noop-on-non-markdown`** — `.ts` + `m` → no change
38. **`file-preview-slash-activates-search`** — `/` → search bar, input focused
39. **`file-preview-search-highlights-matches`** — `/` + "const" → highlights
40. **`file-preview-search-n-next-match`** — search + `Enter` + `n` → next match
41. **`file-preview-search-N-previous-match`** — `N` → previous match
42. **`file-preview-search-wraps-forward`** — last match + `n` → first match
43. **`file-preview-search-wraps-backward`** — first match + `N` → last match
44. **`file-preview-search-esc-clears`** — `/` + text + `Esc` → cleared
45. **`file-preview-search-enter-keeps-highlights`** — `/` + text + `Enter` → highlights kept
46. **`file-preview-h-returns-to-tree`** — `h` → tree focused, preview stays
47. **`file-preview-left-returns-to-tree`** — `Left` → same as `h`
48. **`file-preview-R-retries-on-error`** — error + `R` → retry
49. **`file-preview-R-noop-when-loaded`** — loaded + `R` → no change
50. **`file-preview-q-pops-screen`** — `q` → screen popped
51. **`file-preview-esc-pops-when-no-search`** — `Esc` → same as `q`
52. **`file-preview-question-mark-help`** — `?` → help overlay
53. **`file-preview-rapid-j-presses`** — 20× `j` → 20 lines down
54. **`file-preview-rapid-file-selection`** — select A then B fast → B displayed, A aborted
55. **`file-preview-n-in-search-mode-navigates`** — search active + `n` → next match (not line toggle)
56. **`file-preview-search-too-many-matches`** — common char → "Too many matches"

### Responsive Tests

57. **`file-preview-80x24-full-width`** — 80×24 → full width, 4-char gutter
58. **`file-preview-80x24-path-truncated`** — long path → `…/` prefix
59. **`file-preview-80x24-header-compact`** — compact header layout
60. **`file-preview-120x40-sidebar-visible`** — 25%/75% split, 6-char gutter
61. **`file-preview-120x40-full-header`** — all metadata on one row
62. **`file-preview-200x60-expanded-layout`** — wider margins
63. **`file-preview-resize-120-to-80`** — sidebar hidden, gutter narrows, scroll preserved
64. **`file-preview-resize-80-to-120`** — sidebar appears, gutter widens
65. **`file-preview-resize-preserves-scroll`** — scroll position preserved
66. **`file-preview-resize-during-search`** — search input resizes, highlights preserved
67. **`file-preview-resize-during-load`** — renders at new size when data arrives
68. **`file-preview-ctrl-b-toggles-sidebar`** — `Ctrl+B` hides/shows sidebar

### Integration Tests

69. **`file-preview-auth-expiry`** — 401 → auth error screen
70. **`file-preview-rate-limit-429`** — 429 → rate limit message
71. **`file-preview-network-error`** — timeout → inline error + retry
72. **`file-preview-server-error-500`** — 500 → inline error + retry
73. **`file-preview-file-then-tree-then-file`** — A → tree → B → B displayed, A released
74. **`file-preview-change-context-inherited`** — change ID from parent used in fetch
75. **`file-preview-path-traversal-blocked`** — `..` path → blocked, warning logged
76. **`file-preview-clipboard-unavailable`** — `y` without clipboard → "Copy not available"
77. **`file-preview-content-too-large-to-copy`** — 2MB + `Y` → "File too large to copy"
78. **`file-preview-goto-during-preview`** — `g i` → issues → `q` back → same file in preview

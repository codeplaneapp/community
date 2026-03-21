# TUI_DIFF_SCREEN

Specification for TUI_DIFF_SCREEN.

## High-Level User POV

The diff screen is the dedicated full-screen diff viewer in the Codeplane TUI. It is pushed onto the navigation stack whenever a developer needs to examine file-level changes — either from a single jj change (pressing `d` on a change in the repository changes view), from a landing request's diff tab (pressing `Enter` on the Diff tab), or via the command palette (`:diff owner/repo change_id`). It is the primary surface for code review in the terminal, providing a rich, keyboard-navigable view of additions, deletions, and context with syntax highlighting, multiple layout modes, and inline commenting.

The screen opens with a sidebar-plus-main split layout. On the left, a file tree sidebar occupying 25% of the terminal width lists all changed files in the diff. Each file entry shows an icon indicating the change type — `A` (added, green), `D` (deleted, red), `M` (modified, yellow), `R` (renamed, cyan), `C` (copied, cyan) — followed by the file path, and a compact stat summary showing additions and deletions (e.g., `+15 -3`). The focused file in the tree is highlighted with reverse-video styling. The user navigates the file tree with `j`/`k` and presses `Enter` to jump the main content area to that file's diff. The tree scrolls independently of the main content area.

The main content area on the right (75% width) renders the actual diff using OpenTUI's `<diff>` component. By default, the diff opens in unified mode — all changes are shown in a single column with green-highlighted additions (green background ANSI 22, green text ANSI 34), red-highlighted deletions (red background ANSI 52, red text ANSI 196), and default-colored context lines. Line numbers are displayed in a gutter on the left in muted color (ANSI 245). Hunk headers (e.g., `@@ -10,5 +10,10 @@ function example()`) are rendered in cyan (ANSI 37) and serve as visual anchors between sections of changes.

Pressing `t` toggles between unified and split (side-by-side) view modes. In split mode, the old file content renders in the left half and the new file content in the right half. Line numbers are shown for both sides. Scrolling is synchronized between the two panes — as the user scrolls down in one pane, the other pane follows. Split mode is only available when the terminal is at least 120 columns wide; at 80-column minimum width, pressing `t` flashes a status bar message: "Split view requires 120+ column terminal" and stays in unified mode.

Pressing `w` toggles whitespace visibility. When whitespace is hidden, whitespace-only changes are filtered out of the diff entirely, and the `ignore_whitespace` query parameter is sent to the API. The current whitespace mode is indicated in the status bar: `[ws: visible]` or `[ws: hidden]`.

Each file's diff is divided into hunks. Hunks are expanded by default. Pressing `z` on a focused hunk collapses it to a single summary line showing the hunk header and a line count (e.g., "⋯ 12 lines hidden"). Pressing `x` expands all collapsed hunks in the current file. Pressing `Z` (shift+z) collapses all hunks in the current file. These controls allow the developer to focus on specific sections of large diffs without scrolling through hundreds of unchanged context lines.

File-to-file navigation is available via `]` (next file) and `[` (previous file). When navigating between files, the main content area scrolls to the beginning of the target file and the file tree focus follows. The status bar shows the current file position: "File 3 of 12".

Inline comments are supported for landing request diffs. When viewing a landing request diff, pressing `c` on a focused line opens a comment creation form overlay. The form is pre-populated with the file path, line number, and side (old/new). The user types a comment body and presses `Ctrl+S` to submit or `Esc` to cancel. Existing inline comments are rendered as indented blocks below the line they reference, showing the author username, timestamp, and comment body. Comments are visually distinct with a left border in `primary` color (ANSI 33).

The header bar breadcrumb shows the navigation context: for a change diff, `Dashboard > owner/repo > Changes > abc12345 > Diff`; for a landing diff, `Dashboard > owner/repo > Landings > #12 > Diff`. The status bar displays context-sensitive keybinding hints: `t:toggle view  w:whitespace  ]/[:file nav  x/z:hunks  ?:help`.

At minimum terminal size (80×24), the file tree sidebar is hidden by default (toggleable with `Ctrl+B`), the diff renders in unified mode only, and the status bar keybindings are abbreviated. At standard size (120×40), the full sidebar + main layout is visible with all features active. At large size (200×60+), the diff renders with additional context lines around hunks, the file tree shows full untruncated paths, and line numbers use wider gutters.

If the diff fetch fails, the content area shows an error message in red with "Press `R` to retry." If the diff contains no file changes, the screen shows "No file changes." centered in muted text. If the diff contains only binary files, those files show "Binary file changed" in muted text instead of attempting to render a diff. The user presses `q` to pop the diff screen and return to the previous screen.

## Acceptance Criteria

### Screen lifecycle
- [ ] The diff screen is pushed onto the navigation stack when the user presses `d` on a change in the repository changes view
- [ ] The diff screen is pushed when the user presses `Enter` on a change in a landing request's changes tab
- [ ] The diff screen is opened via the command palette: `:diff owner/repo change_id`
- [ ] The diff screen is opened via deep link: `codeplane tui --screen diff --repo owner/repo --change change_id`
- [ ] The diff screen is opened for a landing request: `codeplane tui --screen diff --repo owner/repo --landing N`
- [ ] Pressing `q` pops the diff screen and returns to the previous screen
- [ ] The breadcrumb displays the appropriate context path (change diff or landing diff)
- [ ] The screen title in the navigation stack is `Diff: <filename>` (first file in the diff) or `Diff: <N files>` if multiple files

### Data loading
- [ ] Change diff data is fetched via `useChangeDiff(owner, repo, change_id)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/changes/:change_id/diff`
- [ ] Landing diff data is fetched via `useLandingDiff(owner, repo, number, opts)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/landings/:number/diff`
- [ ] The `ignore_whitespace` query parameter is sent when whitespace visibility is toggled off
- [ ] A full-screen loading spinner with "Loading diff…" is shown during the initial fetch
- [ ] Diff data is cached for 30 seconds; navigating back and forward within the cache window does not re-fetch
- [ ] The response is parsed into `FileDiffItem[]` and displayed file-by-file

### File tree sidebar
- [ ] The file tree sidebar renders at 25% of the terminal width on the left side
- [ ] Each file entry shows: change type icon (`A`/`D`/`M`/`R`/`C`), file path, and stat summary (`+N -M`)
- [ ] Change type icons are colored: `A` green (ANSI 34), `D` red (ANSI 196), `M` yellow (ANSI 178), `R` cyan (ANSI 37), `C` cyan (ANSI 37)
- [ ] The focused file entry uses reverse-video highlighting
- [ ] `j`/`k` navigates between file entries in the tree
- [ ] `Enter` on a file entry scrolls the main content area to that file's diff
- [ ] The file tree scrolls independently of the main content area
- [ ] `Ctrl+B` toggles sidebar visibility
- [ ] When the sidebar is hidden, the main content area expands to 100% width
- [ ] The sidebar is hidden by default at 80×24 minimum width
- [ ] File paths that exceed the sidebar width are truncated from the left with `…/` prefix (e.g., `…/components/Button.tsx`)
- [ ] Renamed files show `old_path → new_path` format, truncated if necessary
- [ ] Binary files are marked with `[bin]` suffix in muted text

### Unified view
- [ ] Unified view is the default mode
- [ ] Additions are rendered with green background (ANSI 22) and green text (ANSI 34)
- [ ] Deletions are rendered with red background (ANSI 52) and red text (ANSI 196)
- [ ] Context lines use default terminal colors
- [ ] Hunk headers render in cyan (ANSI 37)
- [ ] Line numbers are displayed in the left gutter in muted color (ANSI 245)
- [ ] Addition lines show a `+` sign in green (ANSI 34); deletion lines show a `-` sign in red (ANSI 196)
- [ ] The `<diff>` component receives `view="unified"` and `showLineNumbers={true}`

### Split view
- [ ] Pressing `t` toggles between unified and split view modes
- [ ] Split view renders old file content on the left half and new file content on the right half
- [ ] Both panes show line numbers in their respective gutters
- [ ] Scrolling is synchronized between the two panes when `syncScroll` is true
- [ ] Split view is only available at terminal widths ≥ 120 columns
- [ ] At < 120 columns, pressing `t` flashes "Split view requires 120+ column terminal" in the status bar and stays in unified mode
- [ ] The `<diff>` component receives `view="split"` and `syncScroll={true}` in split mode

### Syntax highlighting
- [ ] Syntax highlighting is applied based on the `language` field from the API response
- [ ] The `filetype` prop is passed to the `<diff>` component for each file
- [ ] 47+ languages are supported via the language detection map in the SDK
- [ ] Files with unknown or missing language fall back to plain text rendering (no syntax highlighting)
- [ ] Syntax highlighting uses the dark theme color tokens (matching the TUI's dark-theme-only constraint)

### Whitespace toggle
- [ ] Pressing `w` toggles whitespace visibility
- [ ] When whitespace is hidden, the diff is re-fetched with `ignore_whitespace=true`
- [ ] The status bar indicator updates: `[ws: visible]` or `[ws: hidden]`
- [ ] The loading state during re-fetch shows inline "Updating diff…" rather than full-screen spinner
- [ ] Whitespace mode persists across file navigation within the same diff screen session

### Hunk expand/collapse
- [ ] All hunks are expanded by default
- [ ] `z` collapses the currently focused hunk to a single summary line: `⋯ N lines hidden`
- [ ] `x` expands all collapsed hunks in the current file
- [ ] `Z` (Shift+z) collapses all hunks in the current file
- [ ] `X` (Shift+x) expands all hunks across all files
- [ ] Collapsed hunk summary lines are rendered in `muted` color (ANSI 245) with a dashed border
- [ ] Pressing `Enter` on a collapsed hunk expands just that hunk
- [ ] Hunk expand/collapse state is preserved during file navigation within the same session

### File navigation
- [ ] `]` navigates to the next file in the diff
- [ ] `[` navigates to the previous file in the diff
- [ ] File navigation wraps: `]` on the last file goes to the first; `[` on the first goes to the last
- [ ] The main content area scrolls to the beginning of the target file
- [ ] The file tree focus follows file navigation in the main content area
- [ ] The status bar shows "File N of M" indicating the current file position
- [ ] `]`/`[` work correctly regardless of whether the file tree sidebar is visible

### Inline comments (landing diffs only)
- [ ] `c` opens a comment creation form overlay when viewing a landing request diff
- [ ] The form is pre-populated with: file path, line number, side (old/new)
- [ ] The form has a body textarea for the comment content
- [ ] `Ctrl+S` submits the comment; `Esc` cancels
- [ ] Submitted comments appear inline below the referenced line
- [ ] Each inline comment shows: `@username`, relative timestamp, and comment body
- [ ] Comments are styled with a left border in `primary` color (ANSI 33)
- [ ] `c` is disabled (no-op) when viewing a change diff (not a landing diff)
- [ ] Existing comments are fetched via `useLandingComments(owner, repo, number)` and rendered inline

### Scrolling and navigation within content
- [ ] `j`/`Down` scrolls the main content area down one line
- [ ] `k`/`Up` scrolls the main content area up one line
- [ ] `G` jumps to the bottom of the diff (last line of the last file)
- [ ] `g g` jumps to the top of the diff (first line of the first file)
- [ ] `Ctrl+D` pages down by half the visible height
- [ ] `Ctrl+U` pages up by half the visible height
- [ ] Scroll position is relative to the focused line, not pixel offset, for resize stability

### Boundary constraints
- [ ] File paths: truncated from the left with `…/` at sidebar width boundary. Max stored path: 4,096 characters
- [ ] Diff patch content: Max 10MB total per diff response. Files exceeding 1MB individually show "File too large to display" in muted text
- [ ] Number of files: Maximum 500 files rendered. If diff contains more, show "Showing 500 of N files. Use file tree to navigate." Warning at 200+ files: "Large diff: N files"
- [ ] Hunk line count: No upper limit on hunk size. Large hunks (>500 lines) render with virtual scrolling to maintain performance
- [ ] Comment body: Max 50,000 characters. Truncated with "…" and "View full comment" notice at 50,000
- [ ] Username display: Max 39 characters, truncated with `…`
- [ ] Stat numbers: Abbreviated K/M format above 999 (e.g., `+1.2k -340`)
- [ ] Binary files: Show "Binary file changed" — no diff rendering
- [ ] Empty files: Show "Empty file" in muted text
- [ ] File permission changes: Show "File mode changed: 100644 → 100755" in muted text when only permissions changed

### Edge cases
- [ ] Terminal resize while in split mode and terminal shrinks below 120 columns: Automatically switches to unified mode with status bar flash "Switched to unified view (terminal too narrow)"
- [ ] Terminal resize while scrolled: Scroll position preserved relative to current focused line index, not pixel offset. Layout recalculates synchronously
- [ ] Rapid `j`/`k` presses: Processed sequentially with no debouncing. Scrolls one line per keypress
- [ ] Diff with only whitespace changes and whitespace hidden: Shows "No visible changes (whitespace hidden). Press w to show whitespace."
- [ ] Diff with empty patch (e.g., permission-only change): Shows permission change notice, no diff rendering
- [ ] File renamed with no content change: Shows "File renamed from old/path to new/path" with no diff rendering
- [ ] File added with 0 lines: Shows "Empty file added" in muted text
- [ ] File deleted entirely: Shows full file content as deletions
- [ ] Mixed binary and text files: Binary files show "Binary file changed"; text files render normally
- [ ] API returns 404 for change: Error message "Change not found." with "Press `q` to go back."
- [ ] API returns 404 for landing: Error message "Landing request not found." with "Press `q` to go back."
- [ ] Diff fetch timeout (>30s): Shows "Diff loading timed out. Press `R` to retry."
- [ ] SSE disconnect during inline comment submit: Optimistic comment remains visible; status bar shows "Comment may not have been saved. Press `R` to refresh."
- [ ] Malformed diff patch from API: Shows "Unable to parse diff for <filename>" in red, renders remaining files normally

## Design

### Screen layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Changes > abc12345 > Diff   ● 3 notifs    │
├───────────────┬─────────────────────────────────────────────────────┤
│ File Tree     │                                                     │
│               │  app.ts                                             │
│ M app.ts +5-2 │  @@ -10,5 +10,8 @@ function setup()                 │
│ A utils.ts +12│  10│  import { config } from "./config"             │
│ D old.ts   -30│  11│- const val = 1                                 │
│ R foo→bar  +0 │  11│+ const val = computeValue()                    │
│               │  12│+ const extra = validate(val)                   │
│               │  13│  return val                                    │
│               │  14│                                                │
│               │  …                                                  │
│               │                                                     │
│   (25%)       │                     (75%)                           │
├───────────────┴─────────────────────────────────────────────────────┤
│ t:view  w:ws  ]/[:files  x/z:hunks │ File 1/4 │ ws:visible │ ?help │
└─────────────────────────────────────────────────────────────────────┘
```

### Split view layout (120+ columns)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Changes > abc12345 > Diff   ● 3 notifs    │
├───────────────┬────────────────────────┬────────────────────────────┤
│ File Tree     │ Old (before)           │ New (after)                │
│               │                        │                            │
│ M app.ts +5-2 │ 10│ import { config }  │ 10│ import { config }      │
│ A utils.ts +12│ 11│ const val = 1      │ 11│ const val = compute()  │
│ D old.ts   -30│                        │ 12│ const extra = valid()  │
│               │ 12│ return val         │ 13│ return val             │
│               │                        │                            │
│   (25%)       │       (37.5%)          │        (37.5%)             │
├───────────────┴────────────────────────┴────────────────────────────┤
│ t:view  w:ws  ]/[:files  x/z:hunks │ File 1/4 │ ws:visible │ ?help │
└─────────────────────────────────────────────────────────────────────┘
```

### Minimum size layout (80×24)

```
┌──────────────────────────────────────────────────────────────────┐
│ …repo > Diff                                          ● 3       │
├──────────────────────────────────────────────────────────────────┤
│ app.ts                                                          │
│ @@ -10,5 +10,8 @@ function setup()                              │
│ 10│ import { config } from "./config"                           │
│ 11│- const val = 1                                              │
│ 11│+ const val = computeValue()                                 │
│ 12│+ const extra = validate(val)                                │
│ 13│ return val                                                  │
│ …                                                               │
├──────────────────────────────────────────────────────────────────┤
│ t:view w:ws ]/[:files │ File 1/4 │ ?help                        │
└──────────────────────────────────────────────────────────────────┘
```

### Component structure

```tsx
<box flexDirection="column" width="100%" height="100%">
  {/* Content area */}
  <box flexDirection="row" flexGrow={1}>
    {/* File tree sidebar — conditionally rendered */}
    {sidebarVisible && (
      <box width="25%" borderRight="single" flexDirection="column">
        <text bold>Files ({fileCount})</text>
        <scrollbox flexGrow={1}>
          <box flexDirection="column">
            {files.map(file => (
              <box key={file.path}>
                <text color={changeTypeColor(file.change_type)}>
                  {changeTypeIcon(file.change_type)}
                </text>
                <text>{truncatePath(file.path, sidebarWidth)}</text>
                <text color="muted">+{file.additions} -{file.deletions}</text>
              </box>
            ))}
          </box>
        </scrollbox>
      </box>
    )}

    {/* Main diff content */}
    <box flexGrow={1} flexDirection="column">
      <scrollbox flexGrow={1}>
        {files.map(file => (
          <box key={file.path} flexDirection="column">
            <box borderBottom="single">
              <text bold>{file.path}</text>
              <text color="muted">+{file.additions} -{file.deletions}</text>
            </box>
            {file.is_binary ? (
              <text color="muted">Binary file changed</text>
            ) : (
              <diff
                diff={file.patch}
                view={viewMode}
                filetype={file.language}
                showLineNumbers={true}
                syncScroll={viewMode === "split"}
                addedBg="#1a4d1a"
                removedBg="#4d1a1a"
                addedSignColor="#22c55e"
                removedSignColor="#ef4444"
                lineNumberFg="#888888"
              />
            )}
            {isLandingDiff && fileComments[file.path]?.map(comment => (
              <box key={comment.id} borderLeft="single" borderColor="primary" paddingLeft={1}>
                <text color="primary">@{comment.author}</text>
                <text color="muted">{relativeTime(comment.created_at)}</text>
                <markdown>{comment.body}</markdown>
              </box>
            ))}
          </box>
        ))}
      </scrollbox>
    </box>
  </box>
</box>
```

### Keybinding reference

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | Main content | Scroll down one line |
| `k` / `Up` | Main content | Scroll up one line |
| `G` | Main content | Jump to bottom of diff |
| `g g` | Main content | Jump to top of diff |
| `Ctrl+D` | Main content | Page down (half visible height) |
| `Ctrl+U` | Main content | Page up (half visible height) |
| `]` | Any | Navigate to next file |
| `[` | Any | Navigate to previous file |
| `t` | Any | Toggle unified/split view mode |
| `w` | Any | Toggle whitespace visibility |
| `z` | Main content, hunk focused | Collapse focused hunk |
| `Z` | Main content | Collapse all hunks in current file |
| `x` | Main content | Expand all hunks in current file |
| `X` | Main content | Expand all hunks across all files |
| `Enter` | File tree | Jump to focused file's diff |
| `Enter` | Collapsed hunk | Expand focused hunk |
| `Ctrl+B` | Any | Toggle file tree sidebar |
| `c` | Main content (landing diff) | Open inline comment form |
| `Ctrl+S` | Comment form | Submit comment |
| `Esc` | Comment form | Cancel and close form |
| `Esc` | Main screen | Same as `q` (pop screen) |
| `R` | Error state | Retry failed fetch |
| `?` | Any | Toggle help overlay |
| `q` | Any | Pop diff screen (return to previous) |
| `Tab` | Any | Switch focus between file tree and main content |

### Focus model

- The screen has two focus zones: file tree (left) and main content (right)
- `Tab` switches focus between file tree and main content
- When file tree is hidden, only main content receives focus
- `j`/`k` behavior depends on focus zone: file tree navigates entries, main content scrolls lines
- File navigation (`]`/`[`) works in both focus zones and updates both

### Responsive behavior

| Range | Sidebar | View modes | Line numbers | Context lines | File path display |
|-------|---------|------------|--------------|---------------|-------------------|
| 80×24 – 119×39 | Hidden (toggle with `Ctrl+B`) | Unified only | Shown (4-char gutter) | 3 lines | Filename only |
| 120×40 – 199×59 | Visible (25%) | Unified + split | Shown (5-char gutter) | 3 lines | Relative path |
| 200×60+ | Visible (25%) | Unified + split | Shown (6-char gutter) | 5 lines | Full path |

### Data hooks consumed

| Hook | Source | API endpoint | Purpose |
|------|--------|-------------|--------|
| `useChangeDiff(owner, repo, change_id)` | `@codeplane/ui-core` | `GET /api/repos/:owner/:repo/changes/:change_id/diff` | Fetch diff for a single change |
| `useLandingDiff(owner, repo, number, opts)` | `@codeplane/ui-core` | `GET /api/repos/:owner/:repo/landings/:number/diff` | Fetch combined diff for a landing request |
| `useLandingComments(owner, repo, number)` | `@codeplane/ui-core` | `GET /api/repos/:owner/:repo/landings/:number/comments` | Fetch inline comments for a landing diff |
| `useCreateComment(owner, repo, number)` | `@codeplane/ui-core` | `POST /api/repos/:owner/:repo/landings/:number/comments` | Create an inline comment on a landing diff |
| `useTerminalDimensions()` | `@opentui/react` | — | Get current terminal width/height |
| `useOnResize()` | `@opentui/react` | — | Re-layout on terminal resize |
| `useKeyboard()` | `@opentui/react` | — | Register keybindings |

### State management

- `viewMode`: `"unified" | "split"` — persisted in session, defaults to `"unified"`
- `sidebarVisible`: `boolean` — defaults to `true` at ≥ 120 columns, `false` at < 120
- `whitespaceVisible`: `boolean` — defaults to `true`
- `focusedFileIndex`: `number` — index into the file list, 0-based
- `hunkStates`: `Map<string, Set<number>>` — tracks collapsed hunk indices per file path
- `focusZone`: `"tree" | "content"` — which panel has keyboard focus
- `scrollPosition`: `number` — current scroll offset in the main content area

## Permissions & Security

### Authorization

| Action | Required role | Behavior when unauthorized |
|--------|--------------|---------------------------|
| View change diff | Repository read access | 404 "Repository not found" |
| View landing diff | Repository read access | 404 "Repository not found" |
| View inline comments | Repository read access | Comments not loaded |
| Create inline comment | Repository write access | `c` key disabled; status bar: "Write access required to comment" |
| View private repo diff | Repository member or collaborator | 404 "Repository not found" |

### Token-based authentication
- The TUI authenticates via a token stored by the CLI (`codeplane auth login`) or the `CODEPLANE_TOKEN` environment variable
- 401 responses show: "Session expired. Run `codeplane auth login` to re-authenticate." and the diff screen is replaced by the auth error state
- Token is passed as a `Bearer` token in the `Authorization` header on all API requests
- No OAuth browser flow is triggered from the TUI

### Rate limiting
- Diff API endpoints: subject to the standard API rate limit of 5,000 requests per hour per authenticated user
- When rate limited (429 response): status bar shows "Rate limited. Retry in Ns." and a countdown timer. Press `R` to retry after the cooldown
- Comment creation: subject to the write rate limit (1,000 requests per hour)
- Whitespace toggle re-fetch is debounced at 300ms to prevent rapid API calls

### Input sanitization
- Comment body input is limited to 50,000 characters with a character counter displayed during editing
- File paths from the API are displayed as-is but never executed or interpolated into shell commands
- Diff patch content is rendered through the `<diff>` component which handles ANSI escaping internally

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.viewed` | Diff screen opened | `source` (change | landing), `repo`, `file_count`, `total_additions`, `total_deletions`, `view_mode` |
| `tui.diff.view_toggled` | Pressed `t` | `from_mode`, `to_mode`, `terminal_width` |
| `tui.diff.whitespace_toggled` | Pressed `w` | `visible` (boolean), `file_count` |
| `tui.diff.file_navigated` | Pressed `]` or `[` | `direction` (next | prev), `file_index`, `total_files` |
| `tui.diff.file_tree_used` | Pressed `Enter` in file tree | `file_index`, `total_files` |
| `tui.diff.sidebar_toggled` | Pressed `Ctrl+B` | `visible` (boolean), `terminal_width` |
| `tui.diff.hunk_collapsed` | Pressed `z` or `Z` | `scope` (single | all_file), `file_path` |
| `tui.diff.hunk_expanded` | Pressed `x` or `X` | `scope` (single | all_file | all_files), `file_path` |
| `tui.diff.comment_created` | Comment submitted | `repo`, `landing_number`, `file_path`, `line_number`, `body_length` |
| `tui.diff.comment_cancelled` | Comment form cancelled | `repo`, `landing_number`, `had_content` (boolean) |
| `tui.diff.error` | API error or parse error | `error_type`, `status_code`, `repo`, `source` |
| `tui.diff.retry` | Pressed `R` to retry | `error_type`, `attempt_number` |
| `tui.diff.session_duration` | Screen popped or TUI quit | `duration_ms`, `files_viewed`, `comments_created`, `view_toggles`, `whitespace_toggles` |

### Common properties (all events)

| Property | Description |
|----------|-------------|
| `session_id` | Unique TUI session identifier |
| `terminal_width` | Current terminal column count |
| `terminal_height` | Current terminal row count |
| `timestamp` | ISO 8601 event timestamp |
| `user_id` | Authenticated user identifier |

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Diff screen load time (P50) | < 500ms | Time from navigation to first render with data |
| Diff screen load time (P95) | < 2s | Acceptable upper bound for large diffs |
| View toggle adoption | > 20% of sessions | Percentage of diff sessions that toggle unified/split at least once |
| File tree usage | > 40% of sessions | Percentage of diff sessions that interact with the file tree |
| Inline comment creation rate | > 5% of landing diff sessions | Percentage of landing diff views that result in a comment |
| Whitespace toggle usage | > 10% of sessions | Percentage of diff sessions that toggle whitespace |
| Error rate | < 1% of loads | Percentage of diff loads that result in an error |
| Session duration (median) | 30-120s | Healthy engagement range for reviewing diffs |

## Observability

### Logging requirements

| Level | Event | Format | When |
|-------|-------|--------|------|
| `info` | `diff.screen.opened` | `{source, repo, change_id?, landing_number?, file_count}` | Screen mount |
| `info` | `diff.screen.closed` | `{duration_ms, files_viewed, comments_created}` | Screen unmount |
| `info` | `diff.view.toggled` | `{from, to, terminal_width}` | View mode change |
| `info` | `diff.whitespace.toggled` | `{visible}` | Whitespace toggle |
| `warn` | `diff.file.too_large` | `{path, size_bytes}` | File exceeds 1MB rendering limit |
| `warn` | `diff.files.truncated` | `{total_files, rendered_files: 500}` | Diff has > 500 files |
| `warn` | `diff.split.unavailable` | `{terminal_width}` | User tried split view at < 120 cols |
| `warn` | `diff.auto_switch_unified` | `{terminal_width}` | Terminal resized below 120 in split mode |
| `error` | `diff.fetch.failed` | `{status_code, error_message, repo, source}` | API request failure |
| `error` | `diff.parse.failed` | `{file_path, error_message}` | Malformed diff patch |
| `error` | `diff.comment.failed` | `{status_code, error_message, landing_number}` | Comment creation failure |
| `debug` | `diff.cache.hit` | `{cache_key, age_ms}` | Cache hit on back-navigation |
| `debug` | `diff.cache.miss` | `{cache_key}` | Cache miss, fetching from API |

### TUI-specific error cases

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during diff render | Layout recalculates synchronously. Split → unified if terminal shrinks below 120 cols. Scroll position preserved relative to focused line | Automatic |
| Terminal resize during comment form | Form re-layouts within new dimensions. Form content is preserved | Automatic |
| SSE disconnect during comment submit | Optimistic comment rendered. Status bar shows warning. Comment data preserved locally | Press `R` to verify/retry |
| API timeout (>30s) | Loading state replaced with error message | Press `R` to retry |
| 401 during diff fetch | Auth error screen shown | Run `codeplane auth login` in another terminal, then press `R` |
| 403 during comment create | Status bar error: "Permission denied: write access required" | Contact repo owner for access |
| 429 rate limit | Status bar shows countdown timer | Wait for cooldown, press `R` |
| Malformed diff patch (parse error) | Affected file shows parse error message in red. Other files render normally | File-level error is non-recoverable; other files unaffected |
| Network disconnect during fetch | Error message with retry prompt | Press `R` when connection restored |
| Memory pressure from very large diff | Virtual scrolling kicks in for files > 500 lines. Files > 1MB skipped with notice | Automatic degradation |
| Rapid `t` toggles | View mode changes are debounced at 100ms | Automatic |
| Terminal closed during operation | React cleanup runs. No data loss (reads only, except comments) | Reopen TUI |

### Failure modes and degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| Syntax highlighting unavailable | Cosmetic only | Diff renders as plain text with diff coloring still applied |
| File tree data missing `language` field | Cosmetic only | No syntax highlighting for that file |
| `old_path` missing for renamed file | Display only | Shows only new path without rename indication |
| `patch` field is null/empty | File shows no diff | "No diff available for this file" in muted text |
| Terminal does not support 256 colors | Cosmetic degradation | Falls back to 16-color mode; additions/deletions still distinguishable by +/- signs |
| Terminal does not support Unicode | Display degradation | Box-drawing characters fall back to ASCII (`|`, `-`, `+`) |

## Verification

Test file: `e2e/tui/diff.test.ts`

### Snapshot tests — visual states (30 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SNAP-DIFF-001 | `renders unified diff view at 120x40` | Snapshot of full screen with file tree sidebar and unified diff for a multi-file change |
| SNAP-DIFF-002 | `renders unified diff view at 80x24` | Snapshot at minimum size: sidebar hidden, unified only, abbreviated status bar |
| SNAP-DIFF-003 | `renders unified diff view at 200x60` | Snapshot at large size: wider gutters, full paths, extra context lines |
| SNAP-DIFF-004 | `renders split diff view at 120x40` | Snapshot with split mode active, two panes with synced line numbers |
| SNAP-DIFF-005 | `renders split diff view at 200x60` | Snapshot of split mode at large terminal with expanded layout |
| SNAP-DIFF-006 | `renders file tree sidebar with change type icons` | Snapshot focusing on sidebar content: A/D/M/R/C icons, colored indicators, stat summaries |
| SNAP-DIFF-007 | `renders file tree sidebar with truncated paths` | Snapshot with long file paths truncated with `…/` prefix |
| SNAP-DIFF-008 | `renders loading state` | Snapshot of full-screen spinner with "Loading diff…" text |
| SNAP-DIFF-009 | `renders error state` | Snapshot of error message with "Press R to retry" prompt |
| SNAP-DIFF-010 | `renders empty diff state` | Snapshot of "No file changes." centered in muted text |
| SNAP-DIFF-011 | `renders binary file indicator` | Snapshot showing "Binary file changed" for a binary file entry |
| SNAP-DIFF-012 | `renders addition lines with green styling` | Snapshot verifying green background and `+` sign on added lines |
| SNAP-DIFF-013 | `renders deletion lines with red styling` | Snapshot verifying red background and `-` sign on deleted lines |
| SNAP-DIFF-014 | `renders hunk headers in cyan` | Snapshot showing cyan-colored `@@` hunk headers |
| SNAP-DIFF-015 | `renders line numbers in muted color` | Snapshot verifying gutter line numbers in ANSI 245 |
| SNAP-DIFF-016 | `renders collapsed hunk summary` | Snapshot showing "⋯ N lines hidden" for a collapsed hunk |
| SNAP-DIFF-017 | `renders all hunks collapsed in file` | Snapshot after pressing `Z` showing all hunks collapsed |
| SNAP-DIFF-018 | `renders sidebar hidden state` | Snapshot after `Ctrl+B` with main content at 100% width |
| SNAP-DIFF-019 | `renders whitespace hidden indicator in status bar` | Snapshot showing `[ws: hidden]` in status bar |
| SNAP-DIFF-020 | `renders file position in status bar` | Snapshot showing "File 3 of 12" in status bar |
| SNAP-DIFF-021 | `renders inline comment on landing diff` | Snapshot showing a comment block below a diff line with author, timestamp, and body |
| SNAP-DIFF-022 | `renders comment creation form overlay` | Snapshot of the comment form with pre-populated fields |
| SNAP-DIFF-023 | `renders renamed file in file tree` | Snapshot showing `old_path → new_path` format |
| SNAP-DIFF-024 | `renders diff with syntax highlighting` | Snapshot verifying syntax colors are applied to code content |
| SNAP-DIFF-025 | `renders breadcrumb for change diff` | Snapshot of header showing `… > Changes > abc12345 > Diff` |
| SNAP-DIFF-026 | `renders breadcrumb for landing diff` | Snapshot of header showing `… > Landings > #12 > Diff` |
| SNAP-DIFF-027 | `renders file too large notice` | Snapshot showing "File too large to display" for a >1MB file |
| SNAP-DIFF-028 | `renders permission-only change` | Snapshot showing "File mode changed: 100644 → 100755" |
| SNAP-DIFF-029 | `renders help overlay` | Snapshot of `?` help overlay listing all diff keybindings |
| SNAP-DIFF-030 | `renders large diff file count warning` | Snapshot showing "Large diff: 250 files" warning |

### Keyboard interaction tests (38 tests)

| Test ID | Test name | Key sequence | Expected state change |
|---------|-----------|-------------|----------------------|
| KEY-DIFF-001 | `j scrolls down one line` | `j` | Main content scroll position increases by 1 line |
| KEY-DIFF-002 | `k scrolls up one line` | `k` | Main content scroll position decreases by 1 line |
| KEY-DIFF-003 | `G jumps to bottom` | `G` | Scroll position at last line of last file |
| KEY-DIFF-004 | `gg jumps to top` | `g`, `g` | Scroll position at first line of first file |
| KEY-DIFF-005 | `Ctrl+D pages down` | `Ctrl+D` | Scroll advances by half visible height |
| KEY-DIFF-006 | `Ctrl+U pages up` | `Ctrl+U` | Scroll retreats by half visible height |
| KEY-DIFF-007 | `] navigates to next file` | `]` | File tree focus advances; content scrolls to next file header |
| KEY-DIFF-008 | `[ navigates to previous file` | `[` | File tree focus retreats; content scrolls to previous file header |
| KEY-DIFF-009 | `] wraps from last to first file` | Navigate to last file, `]` | Focus on first file |
| KEY-DIFF-010 | `[ wraps from first to last file` | `[` on first file | Focus on last file |
| KEY-DIFF-011 | `t toggles to split view` | `t` (at 120+ cols) | `<diff>` view prop changes to `"split"` |
| KEY-DIFF-012 | `t toggles back to unified view` | `t`, `t` | `<diff>` view prop changes back to `"unified"` |
| KEY-DIFF-013 | `t rejected at 80 columns` | `t` (at 80 cols) | Status bar flashes "Split view requires 120+ column terminal"; stays unified |
| KEY-DIFF-014 | `w toggles whitespace hidden` | `w` | Status bar shows `[ws: hidden]`; re-fetch with ignore_whitespace |
| KEY-DIFF-015 | `w toggles whitespace visible` | `w`, `w` | Status bar shows `[ws: visible]`; re-fetch without ignore_whitespace |
| KEY-DIFF-016 | `z collapses focused hunk` | `z` | Focused hunk replaced with "⋯ N lines hidden" summary |
| KEY-DIFF-017 | `Z collapses all hunks in file` | `Z` | All hunks in current file collapsed |
| KEY-DIFF-018 | `x expands all hunks in file` | `Z`, `x` | All hunks in current file expanded |
| KEY-DIFF-019 | `X expands all hunks across files` | `Z`, navigate to next file, `Z`, `X` | All hunks in all files expanded |
| KEY-DIFF-020 | `Enter on collapsed hunk expands it` | `z`, `Enter` | Single collapsed hunk expands |
| KEY-DIFF-021 | `Ctrl+B toggles sidebar` | `Ctrl+B` | Sidebar visibility toggles; main content width adjusts |
| KEY-DIFF-022 | `Ctrl+B hides sidebar` | `Ctrl+B` (sidebar visible) | Sidebar hidden; main content at 100% |
| KEY-DIFF-023 | `Ctrl+B shows sidebar` | `Ctrl+B` (sidebar hidden) | Sidebar shown at 25% width |
| KEY-DIFF-024 | `Tab switches focus to file tree` | `Tab` (focus on content) | Focus zone moves to file tree |
| KEY-DIFF-025 | `Tab switches focus to content` | `Tab` (focus on tree) | Focus zone moves to main content |
| KEY-DIFF-026 | `j/k in file tree navigates files` | `Tab` (to tree), `j`, `j`, `k` | File tree focus moves down 2 then up 1 |
| KEY-DIFF-027 | `Enter in file tree jumps to file` | `Tab` (to tree), `j`, `Enter` | Main content scrolls to second file; tree focus on second file |
| KEY-DIFF-028 | `c opens comment form on landing diff` | `c` | Comment creation overlay appears with pre-populated fields |
| KEY-DIFF-029 | `c is no-op on change diff` | `c` (change diff context) | No overlay; no state change |
| KEY-DIFF-030 | `Ctrl+S submits comment` | `c`, type body, `Ctrl+S` | Comment submitted; overlay closes; comment appears inline |
| KEY-DIFF-031 | `Esc cancels comment form` | `c`, `Esc` | Comment overlay closes; no comment created |
| KEY-DIFF-032 | `R retries failed fetch` | (on error state) `R` | Diff re-fetched; loading spinner shown |
| KEY-DIFF-033 | `q pops diff screen` | `q` | Diff screen removed from navigation stack; previous screen shown |
| KEY-DIFF-034 | `Esc pops diff screen` | `Esc` (no overlay open) | Diff screen removed from navigation stack |
| KEY-DIFF-035 | `? toggles help overlay` | `?` | Help overlay shown with diff keybinding list |
| KEY-DIFF-036 | `? then Esc closes help` | `?`, `Esc` | Help overlay dismissed |
| KEY-DIFF-037 | `rapid j presses scroll smoothly` | `j` × 20 (rapid) | Scroll advances 20 lines without skipping or stuttering |
| KEY-DIFF-038 | `file navigation updates status bar` | `]` | Status bar "File N of M" updates |

### Responsive behavior tests (15 tests)

| Test ID | Test name | Terminal size | Expected behavior |
|---------|-----------|--------------|-------------------|
| RSP-DIFF-001 | `sidebar hidden at 80x24` | 80×24 | File tree sidebar not rendered; main content full width |
| RSP-DIFF-002 | `sidebar visible at 120x40` | 120×40 | File tree sidebar at 25% width; main content at 75% |
| RSP-DIFF-003 | `sidebar visible at 200x60` | 200×60 | File tree sidebar at 25% width with full paths |
| RSP-DIFF-004 | `split view available at 120x40` | 120×40 | `t` toggle works; split view renders |
| RSP-DIFF-005 | `split view unavailable at 80x24` | 80×24 | `t` shows flash message; stays unified |
| RSP-DIFF-006 | `resize from 120 to 80 during split view` | 120→80 | Auto-switches to unified; flash message shown |
| RSP-DIFF-007 | `resize from 80 to 120 preserves view mode` | 80→120 | View mode stays as-is (does not auto-switch to split) |
| RSP-DIFF-008 | `resize preserves scroll position` | 120→80 | Scroll position preserved relative to focused line |
| RSP-DIFF-009 | `resize preserves sidebar toggle state` | 120→200 | If user manually hid sidebar, it stays hidden |
| RSP-DIFF-010 | `file paths truncate at narrow sidebar` | 80×24 (sidebar toggled on) | File paths truncated with `…/` prefix |
| RSP-DIFF-011 | `line number gutter width at 80x24` | 80×24 | 4-character gutter |
| RSP-DIFF-012 | `line number gutter width at 120x40` | 120×40 | 5-character gutter |
| RSP-DIFF-013 | `line number gutter width at 200x60` | 200×60 | 6-character gutter |
| RSP-DIFF-014 | `context lines at standard size` | 120×40 | 3 context lines around each hunk |
| RSP-DIFF-015 | `context lines at large size` | 200×60 | 5 context lines around each hunk |

### Data loading and integration tests (14 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-DIFF-001 | `loads change diff from API` | Navigating to diff screen fetches `GET /api/repos/:owner/:repo/changes/:change_id/diff` and renders file list |
| INT-DIFF-002 | `loads landing diff from API` | Navigating to landing diff fetches `GET /api/repos/:owner/:repo/landings/:number/diff` and renders combined diff |
| INT-DIFF-003 | `whitespace toggle re-fetches with query param` | Pressing `w` triggers new fetch with `ignore_whitespace=true` |
| INT-DIFF-004 | `whitespace toggle back re-fetches without param` | Pressing `w` twice returns to default fetch without `ignore_whitespace` |
| INT-DIFF-005 | `cached diff serves on back-navigation` | Navigate to diff, press `q`, navigate back within 30s — no new API request |
| INT-DIFF-006 | `expired cache re-fetches` | Navigate to diff, wait > 30s, navigate back — new API request |
| INT-DIFF-007 | `inline comments loaded for landing diff` | Landing diff screen fetches comments and renders them inline |
| INT-DIFF-008 | `comment creation posts to API` | Submitting comment form sends `POST` request and renders new comment |
| INT-DIFF-009 | `401 shows auth error` | API returns 401; diff screen replaced by auth error state with login instructions |
| INT-DIFF-010 | `404 shows not found` | API returns 404; diff screen shows "Change not found." or "Landing request not found." |
| INT-DIFF-011 | `429 shows rate limit` | API returns 429; status bar shows rate limit countdown |
| INT-DIFF-012 | `network error shows retry prompt` | Fetch fails with network error; error message with `R` to retry shown |
| INT-DIFF-013 | `large diff renders with file count warning` | Diff with 200+ files shows "Large diff: N files" warning |
| INT-DIFF-014 | `500+ files truncated to 500` | Diff with > 500 files renders only first 500 with truncation notice |

### Edge case tests (15 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| EDGE-DIFF-001 | `binary file shows binary notice` | File with `is_binary: true` renders "Binary file changed" instead of diff |
| EDGE-DIFF-002 | `empty file shows empty notice` | Added file with 0 lines shows "Empty file added" |
| EDGE-DIFF-003 | `renamed file with no content change` | `change_type: "renamed"` with empty patch shows rename notice only |
| EDGE-DIFF-004 | `permission-only change` | File with mode change but no content diff shows permission change notice |
| EDGE-DIFF-005 | `malformed patch renders error for file` | File with unparseable `patch` shows "Unable to parse diff for <filename>"; other files render normally |
| EDGE-DIFF-006 | `file >1MB shows too large notice` | File exceeding 1MB patch size shows "File too large to display" |
| EDGE-DIFF-007 | `null patch field` | File with `patch: null` shows "No diff available for this file" |
| EDGE-DIFF-008 | `diff with only whitespace changes and ws hidden` | Shows "No visible changes (whitespace hidden). Press w to show whitespace." |
| EDGE-DIFF-009 | `single file diff has no file navigation` | `]`/`[` are no-ops; status bar shows "File 1 of 1" |
| EDGE-DIFF-010 | `comment form preserves content on resize` | Resize during comment editing does not lose typed content |
| EDGE-DIFF-011 | `syntax highlighting fallback for unknown language` | File with `language: null` renders plain text without syntax colors |
| EDGE-DIFF-012 | `very long file path in breadcrumb` | Path > 60 chars is truncated from the left in breadcrumb |
| EDGE-DIFF-013 | `diff screen from command palette` | `:diff owner/repo change_id` pushes diff screen with correct context |
| EDGE-DIFF-014 | `stat numbers abbreviated at 1000+` | File with 1,500 additions shows `+1.5k` in file tree |
| EDGE-DIFF-015 | `concurrent resize and keyboard input` | Layout and key handler remain consistent during simultaneous events |

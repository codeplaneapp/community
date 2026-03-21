# TUI_REPO_CODE_EXPLORER

Specification for TUI_REPO_CODE_EXPLORER.

## High-Level User POV

The code explorer is the primary screen for browsing the files and directories of a repository in the Codeplane TUI. The user reaches it by pressing `3` or `Tab`-cycling to the "Code" tab on the repository screen, by pressing `e` from the repository overview, or by navigating via the command palette or go-to keybinding (`g r` then selecting a repo and pressing `3`). It can also be opened directly via deep link: `codeplane tui --screen repo --repo owner/repo --tab code`.

The screen presents a two-panel layout: a file tree sidebar on the left and a file preview panel on the right. The file tree shows the repository's directory structure at the currently selected bookmark (branch). At the top of the file tree is a bookmark selector — a single-line display showing the current bookmark name (e.g., `main`), which the user can change by pressing `B` to open a bookmark picker. Changing the bookmark reloads the entire tree at the new revision.

The file tree renders directories and files in a familiar hierarchical view. Directories are prefixed with `▸` when collapsed and `▾` when expanded, and rendered in bold. Files are prefixed with a space for alignment and rendered in the default text color. The tree is sorted alphabetically with directories first, then files. The currently focused item is highlighted with reverse-video styling. The user navigates the tree with `j`/`k` (or arrow keys), expands/collapses directories with `Enter` or `l`/`h`, and opens a file for preview by pressing `Enter` on a file entry. Pressing `o` on a file provides an explicit open alternative.

When the user opens a file, the right panel displays the file content using the `<code>` component with syntax highlighting based on the file extension. The file name, size, and line count are shown in a header row above the code content. The code panel is scrollable via `j`/`k` when it has focus, supports `Ctrl+D`/`Ctrl+U` for page scrolling, and `G`/`g g` for jumping to the bottom or top. Line numbers are displayed in muted color to the left of each line.

Focus moves between the file tree and the file preview panel with `Tab` or `Ctrl+W` (window toggle). The currently focused panel is indicated by a brighter border color (using the `primary` semantic color), while the unfocused panel uses the default `border` color.

At the top of the file tree, below the bookmark selector, is a path breadcrumb showing the current directory path. Pressing `/` activates a fuzzy file search filter — the user types a partial filename, and the tree filters to matching entries in real-time.

For binary files, the preview panel shows "Binary file — {size} — preview not available" in muted text. For markdown files, the user can toggle between raw code view and rendered markdown view by pressing `m`.

At minimum terminal size (80×24), the file tree sidebar is hidden by default and the user sees only the file preview panel. The sidebar can be toggled with `Ctrl+B`. At standard size (120×40), the sidebar is visible at 25% width. At large size (200×60+), the sidebar uses 25% width with comfortable padding.

## Acceptance Criteria

### Definition of Done

- [ ] The code explorer renders as the content panel for repository tab index 2 (tab key `3`, label "Code")
- [ ] Repository file tree is fetched via `useRepoTree(owner, repo, bookmark, path)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/contents?ref={bookmark}&path={path}`
- [ ] File content is fetched via `useFileContent(owner, repo, bookmark, filePath)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/file/:change_id/{filePath}`
- [ ] The screen displays a two-panel layout: file tree sidebar (left) and file preview (right)
- [ ] The file tree renders directories and files in hierarchical order (directories first, alphabetical)
- [ ] The bookmark selector at the top of the file tree shows the current bookmark and allows switching via `B`
- [ ] File preview displays syntax-highlighted code using the `<code>` component with line numbers
- [ ] The file preview header shows file name, file size (human-readable), and line count
- [ ] Focus toggles between file tree and preview panel via `Tab` or `Ctrl+W`
- [ ] The focused panel has a `primary`-colored border; the unfocused panel has a `border`-colored border
- [ ] Path breadcrumb shows the current directory path below the bookmark selector
- [ ] Fuzzy file search filter activates with `/` and filters the tree in real-time
- [ ] Binary files show "Binary file — {size} — preview not available" in the preview panel
- [ ] Empty files show "Empty file" in the preview panel
- [ ] Markdown files support toggle between code view and rendered markdown via `m`
- [ ] The `q` key pops the screen (back to repo list or previous screen)
- [ ] Loading states show skeleton tree and "Loading…" spinner in the preview panel
- [ ] Error states show inline error messages with "Press `R` to retry"
- [ ] 401 errors propagate to the app-shell auth error screen
- [ ] Breadcrumb in the header bar updates to `… > owner/repo > Code`

### Keyboard Interactions

**File tree panel (when focused):**
- `j` / `Down`: Move cursor down in tree
- `k` / `Up`: Move cursor up in tree
- `Enter`: Expand/collapse directory, or open file for preview
- `l` / `Right`: Expand directory or step into directory
- `h` / `Left`: Collapse directory or navigate to parent
- `o`: Open file for preview (explicit open)
- `G`: Jump to last item in tree
- `g g`: Jump to first item in tree
- `Ctrl+D` / `Ctrl+U`: Page down / page up in tree
- `/`: Activate fuzzy file search filter
- `Esc`: Clear search filter (if active)
- `Backspace`: Navigate to parent directory
- `B`: Open bookmark picker
- `Tab` / `Ctrl+W`: Move focus to file preview panel
- `Ctrl+B`: Toggle sidebar visibility

**File preview panel (when focused):**
- `j` / `Down`: Scroll file content down by one line
- `k` / `Up`: Scroll file content up by one line
- `Ctrl+D` / `Ctrl+U`: Page down / page up
- `G`: Scroll to end of file
- `g g`: Scroll to beginning of file
- `m`: Toggle markdown rendering (only for `.md` files)
- `y`: Copy file path to clipboard
- `Tab` / `Ctrl+W`: Move focus to file tree panel
- `Ctrl+B`: Toggle sidebar visibility

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router; code explorer not rendered
- 80×24 – 119×39 (minimum): File tree sidebar hidden by default. Full width for file preview. Sidebar toggleable with `Ctrl+B` (overlays content). File header truncated. 4-char line number gutter.
- 120×40 – 199×59 (standard): Sidebar visible at 25% width (30–40 columns). 5-char line number gutter.
- 200×60+ (large): Sidebar at 25% width (40–60 columns). 6-char line number gutter.

### Truncation and Boundary Constraints

- File names in tree: truncated with `…` at sidebar width minus 4 chars
- File path breadcrumb: truncated from the left with `…/` prefix
- File preview line content: horizontally scrollable (no wrapping)
- Line numbers: right-aligned, max displayable 999,999 (6 digits)
- File size display: human-readable format (max "999.9 GB")
- Bookmark name: truncated with `…` at sidebar width minus 6 chars
- Fuzzy search input: maximum 100 characters
- Tree depth: maximum 50 levels (2 chars indent per level)
- Tree item count: maximum 10,000 visible items (paginated for larger directories)
- File content: maximum 100,000 lines rendered
- Binary detection: null bytes in first 8,192 bytes

### Edge Cases

- Terminal resize preserves focused item, scroll position, and sidebar visibility based on new breakpoint
- Rapid `j`/`k` presses processed sequentially without debouncing
- Directory with 1,000+ items paginated with loading indicator
- Files with no/unknown extension: plain text, no syntax highlighting
- Symlinks displayed with `→` suffix and target path in muted color
- Empty directory shows "(empty)" in muted text
- Empty repo shows "No files found." in tree
- Bookmark switch clears preview if file doesn't exist at new revision
- File deleted between tree load and preview: shows "File not found" error
- SSE disconnect: code explorer unaffected (uses REST)
- Concurrent directory expansions: each fetch independent
- Opening file while previous loading: previous request cancelled via AbortController

## Design

### Screen Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Code         ● SYNCED  🔔 3 │
├──────────────────────────────────────────────────────────────┤
│ [1:Bookmarks] [2:Changes] [3:Code] [4:Conflicts] …          │
├──────────────┬───────────────────────────────────────────────┤
│  main ▾      │  src/components/App.tsx        1.2 KB  42 ln  │
│ ─────────── │ ─────────────────────────────────────────────── │
│ src/         │   1│ import React from "react";                │
│ ─────────── │   2│                                            │
│  ▾ src/      │   3│ export function App() {                   │
│    ▸ compo…  │   4│   return (                                │
│    ▸ hooks/  │   5│     <box flexDirection="column">          │
│    ▸ utils/  │   6│       <text>Hello, world!</text>          │
│    index.ts  │   7│     </box>                                │
│  ▸ tests/    │   8│   );                                      │
│  .gitignore  │   9│ }                                         │
│  README.md   │  10│                                           │
│  package.js… │                                                │
│  tsconfig.…  │                                                │
├──────────────┴───────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  /:search  Tab:panel  q:back  ?help │
└──────────────────────────────────────────────────────────────┘
```

### Component Structure

The code explorer uses a `<box flexDirection="row">` split layout:
- Left panel: File tree sidebar with `<scrollbox>` containing TreeRow components. Includes bookmark selector (`<text>` with current bookmark name), path breadcrumb, and optional search `<input>`. Border colored `primary` when focused, `border` when not.
- Right panel: File preview with `<code>` component (syntax highlighted, line numbers) wrapped in `<scrollbox>`. File header row shows name, size, line count. Binary files show placeholder text. Markdown files toggleable between `<code>` and `<markdown>` rendering.

TreeRow component: `<box height={1} paddingLeft={depth * 2}>` with `▸`/`▾`/` ` prefix icon, bold text for directories.

Bookmark picker: Modal overlay at 50% width/height with filter `<input>` and scrollable bookmark list. Current bookmark marked with `●` in primary color.

### Keybinding Reference

**Tree panel:** `j`/`k` navigate, `Enter` expand/collapse/open, `l`/`h` expand/collapse, `o` open file, `G`/`gg` jump to end/start, `Ctrl+D`/`Ctrl+U` page, `/` search, `Esc` clear search, `Backspace` navigate up, `B` bookmark picker.

**Preview panel:** `j`/`k` scroll, `Ctrl+D`/`Ctrl+U` page, `G`/`gg` jump, `m` toggle markdown, `y` copy path.

**Global:** `Tab`/`Ctrl+W` toggle panel focus, `Ctrl+B` toggle sidebar, `R` retry, `1`-`6` switch repo tab, `q` pop, `?` help, `:` command palette.

### Responsive Behavior

| Terminal Size | Sidebar | Preview | Behavior |
|---|---|---|---|
| < 80×24 | Hidden | Hidden | "Terminal too small" |
| 80×24 – 119×39 | Hidden (Ctrl+B overlay) | Full width | 4-char gutter |
| 120×40 – 199×59 | 25% (30–40 cols) | 75% | 5-char gutter |
| 200×60+ | 25% (40–60 cols) | 75% | 6-char gutter |

Sidebar width: `Math.max(30, Math.min(40, floor(width * 0.25)))` at standard; `Math.max(40, Math.min(60, floor(width * 0.25)))` at large.

### Data Hooks

| Hook | Source | Purpose |
|---|---|---|
| `useRepoTree(owner, repo, ref, path)` | `@codeplane/ui-core` | Directory listing at path |
| `useFileContent(owner, repo, ref, filePath)` | `@codeplane/ui-core` | File content at revision |
| `useBookmarks(owner, repo)` | `@codeplane/ui-core` | Bookmark list for picker |
| `useRepo(owner, repo)` | `@codeplane/ui-core` | Repo metadata (default bookmark) |
| `useKeyboard()` | `@opentui/react` | Keybinding registration |
| `useTerminalDimensions()` | `@opentui/react` | Responsive breakpoint |
| `useOnResize()` | `@opentui/react` | Re-layout on resize |
| `useNavigation()` | Local TUI | Push/pop, context |
| `useClipboard()` | Local TUI | Copy file path |

TreeEntry type: `{ name: string, path: string, type: "file" | "dir" | "symlink", size: number, target?: string }`

Internal state preserved across tab switches: `currentBookmark`, `currentPath`, `selectedFile`, `focusedPanel`, `sidebarVisible`, `expandedDirs`, `searchQuery`, `scrollPositions`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (no access) | Read-Only | Member | Admin | Owner |
|---|---|---|---|---|---|---|
| View public repo code explorer | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View private repo code explorer | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Browse file tree | ❌ | ❌ (404 for private) | ✅ | ✅ | ✅ | ✅ |
| View file content | ❌ | ❌ (404 for private) | ✅ | ✅ | ✅ | ✅ |
| Switch bookmark | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Copy file path | ❌ | ✅ (if repo accessible) | ✅ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- Private repositories return 404 to users without read access (does not leak existence)
- The code explorer is a read-only view; no write actions are available
- All file content is served through the API — the TUI never accesses the filesystem directly

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to the app-shell auth error screen
- File content from the API may contain sensitive data (secrets in config files); this is expected behavior for users with read access

### Rate Limiting

- Authenticated users: 5,000 requests per hour (platform-wide)
- Tree listing: each directory expansion or path navigation triggers one API request
- File content fetch: each file selection triggers one API request
- Rapid directory expansion (10 dirs in quick succession): 10 concurrent requests, within normal rate limits
- Bookmark listing: fetched once on picker open, not per keystroke
- 429 response: affected panel displays "Rate limited. Retry in {Retry-After}s." inline
- No client-side rate limiting needed; natural interaction speed stays within limits

### Input Validation

- `owner` and `repo` validated against `^[a-zA-Z0-9_.-]+$`
- `path` validated against `^[a-zA-Z0-9_./-]+$` (no `..` traversal)
- `bookmark` selected from API-provided list, not user-typed
- Fuzzy search filter is client-side only — never sent to the API
- File content rendered via `<code>` and `<markdown>` components — no injection risk

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `tui.code_explorer.view` | Code explorer tab loads | `repo_full_name`, `repo_id`, `bookmark`, `initial_path`, `terminal_width`, `terminal_height`, `breakpoint`, `sidebar_visible`, `load_time_ms`, `navigation_source` |
| `tui.code_explorer.file_opened` | User opens a file | `repo_full_name`, `file_path`, `file_extension`, `file_language`, `file_size_bytes`, `line_count`, `is_binary`, `load_time_ms` |
| `tui.code_explorer.directory_expanded` | User expands a directory | `repo_full_name`, `dir_path`, `depth`, `child_count`, `load_time_ms` |
| `tui.code_explorer.directory_collapsed` | User collapses a directory | `repo_full_name`, `dir_path` |
| `tui.code_explorer.bookmark_switched` | User changes bookmark | `repo_full_name`, `from_bookmark`, `to_bookmark` |
| `tui.code_explorer.search_used` | User uses file search | `repo_full_name`, `query_length`, `result_count`, `selected_result_index` |
| `tui.code_explorer.panel_switch` | User toggles panel focus | `repo_full_name`, `from_panel`, `to_panel`, `method` (tab/ctrl_w) |
| `tui.code_explorer.sidebar_toggle` | User toggles sidebar | `repo_full_name`, `new_state`, `terminal_width` |
| `tui.code_explorer.markdown_toggle` | User toggles markdown | `repo_full_name`, `file_path`, `new_state` |
| `tui.code_explorer.file_path_copied` | User copies file path | `repo_full_name`, `file_path`, `copy_success` |
| `tui.code_explorer.navigate_up` | User goes to parent dir | `repo_full_name`, `from_path`, `to_path`, `method` |
| `tui.code_explorer.scroll` | User scrolls preview (sampled) | `repo_full_name`, `file_path`, `scroll_depth_percent`, `method` |
| `tui.code_explorer.error` | API request fails | `repo_full_name`, `error_type`, `error_target`, `http_status` |
| `tui.code_explorer.retry` | User presses R | `repo_full_name`, `error_target`, `retry_success` |

### Common Event Properties

All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `viewer_id`

### Success Indicators

| Metric | Target | Description |
|---|---|---|
| Code explorer adoption | >30% of repo sessions | % of repo sessions visiting code tab |
| File preview rate | >70% of code explorer sessions | % of sessions where a file is opened |
| Files browsed per session | >3 per session | Average files opened per visit |
| Directory exploration depth | Track distribution | How deep users navigate |
| Bookmark switch rate | >10% of sessions | % using bookmark switcher |
| Search usage rate | >15% of sessions | % using file search filter |
| Sidebar toggle rate at minimum | Track | How often users toggle at 80×24 |
| Markdown render toggle rate | Track | Adoption of markdown preview |
| Tree load latency (p50) | <300ms | Directory listing load time |
| File preview latency (p50) | <200ms | File select to content rendered |
| Error rate | <2% | % of tree/file fetches that fail |
| Panel switch frequency | Track | How often users toggle panels |
| Time to first file open | <5s | Median time to first file opened |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|---|---|---|
| `debug` | Tree loaded | `CodeExplorer: tree loaded [repo={full_name}] [path={path}] [ref={bookmark}] [items={count}] [time_ms={ms}]` |
| `debug` | File content loaded | `CodeExplorer: file loaded [repo={full_name}] [path={filePath}] [ref={bookmark}] [size={bytes}] [lines={count}] [time_ms={ms}]` |
| `debug` | Directory expanded | `CodeExplorer: dir expanded [repo={full_name}] [path={dirPath}] [children={count}]` |
| `debug` | Directory collapsed | `CodeExplorer: dir collapsed [repo={full_name}] [path={dirPath}]` |
| `debug` | Bookmark switched | `CodeExplorer: bookmark switched [repo={full_name}] [from={old}] [to={new}]` |
| `debug` | Panel focus changed | `CodeExplorer: focus [panel={tree|preview}]` |
| `debug` | Sidebar toggled | `CodeExplorer: sidebar [visible={true|false}] [width={cols}]` |
| `debug` | Search activated | `CodeExplorer: search [query={query}] [matches={count}]` |
| `info` | Code explorer opened | `CodeExplorer: opened [repo={full_name}] [ref={bookmark}] [breakpoint={min|standard|large}]` |
| `info` | File path copied | `CodeExplorer: copied [path={filePath}] [success={true|false}]` |
| `warn` | Tree fetch failed | `CodeExplorer: tree error [repo={full_name}] [path={path}] [ref={bookmark}] [status={code}] [error={msg}]` |
| `warn` | File content fetch failed | `CodeExplorer: file error [repo={full_name}] [path={filePath}] [ref={bookmark}] [status={code}] [error={msg}]` |
| `warn` | Bookmark list fetch failed | `CodeExplorer: bookmarks error [repo={full_name}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `CodeExplorer: rate limited [repo={full_name}] [retry_after={seconds}]` |
| `error` | Render error | `CodeExplorer: render error [repo={full_name}] [error={msg}] [stack={trace}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|---|---|---|
| Network timeout on tree fetch | Data hook timeout (30s) | Tree panel: "Failed to load files. Press R to retry." Preview unaffected |
| Network timeout on file fetch | Data hook timeout (30s) | Preview: "Failed to load file. Press R to retry." Tree unaffected |
| Repository not found (404) | API returns 404 | Propagated to parent repo screen error handling |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 | Affected panel: "Rate limited. Retry in Ns." |
| Server error (500) | API returns 5xx | Affected panel: generic error + R to retry |
| File not found at revision | API 404 for file | Preview: "File not found at revision {bookmark}." |
| Bookmark not found | API 404 for ref | Error in tree. Falls back to default bookmark |
| Binary file | Null bytes in first 8KB | Preview shows binary placeholder |
| File too large (>100K lines) | Line count limit | Shows first 100K with warning |
| Terminal resize during load | useOnResize fires | Fetch continues, renders at new size |
| Terminal resize collapses sidebar | Standard → minimum | Sidebar hides, focus moves to preview |
| Concurrent directory expansions | Multiple fetches | All proceed independently |
| File opened while previous loading | New fetch started | Previous cancelled via AbortController |
| Search filter no matches | Zero results | "No matching files" in muted text |
| React error boundary | Component throws | Per-panel boundary. Other panel unaffected |
| SSE disconnect | Status bar indicator | Code explorer unaffected (REST only) |

### Failure Modes

- **Tree panel blank**: Error boundary catches. Shows error with R to retry. Preview functional.
- **Preview panel blank**: Error boundary catches. Tree remains navigable.
- **Both panels fail**: Independent error boundaries. Global keys (q, ?, :) remain functional.
- **Memory pressure from large tree**: 10,000-item scrollbox limit. Pagination for larger directories.
- **Memory pressure from large file**: 100,000-line rendering cap.
- **Stuck focus state**: Simple React state. Re-render restores consistency. Tab always toggles.
- **Stale tree after bookmark switch**: Full reload triggered. Previous tree unmounted.

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests (26)

1. `code-explorer-initial-load` — Navigate to repo, press `3` at 120×40. Assert two-panel layout with file tree and "Select a file to preview."
2. `code-explorer-file-selected` — Open `src/index.ts`. Assert syntax-highlighted content with line numbers and file header.
3. `code-explorer-directory-expanded` — Expand `src/`. Assert `▾ src/` with indented children.
4. `code-explorer-directory-collapsed` — Collapse `src/`. Assert `▸ src/` with children hidden.
5. `code-explorer-nested-directory` — Expand `src/` then `src/components/`. Assert 2-level nesting.
6. `code-explorer-tree-focus-indicator` — Tree focused. Assert primary border on tree, default border on preview.
7. `code-explorer-preview-focus-indicator` — Preview focused. Assert primary border on preview.
8. `code-explorer-bookmark-selector` — Assert bookmark name displayed (e.g., `main ▾`).
9. `code-explorer-path-breadcrumb` — Navigate into `src/components/`. Assert breadcrumb.
10. `code-explorer-binary-file` — Open binary file. Assert "Binary file — {size} — preview not available."
11. `code-explorer-empty-file` — Open empty file. Assert "Empty file."
12. `code-explorer-markdown-raw` — Open README.md. Assert raw code view.
13. `code-explorer-markdown-rendered` — Open README.md, press `m`. Assert rendered markdown.
14. `code-explorer-loading-tree` — Slow API. Assert skeleton tree and loading spinner.
15. `code-explorer-error-tree` — 500 on tree. Assert error message with retry hint.
16. `code-explorer-error-file` — 500 on file. Assert error in preview, tree interactive.
17. `code-explorer-empty-repo` — Empty repo. Assert "No files found." and "Select a file."
18. `code-explorer-bookmark-picker` — Press `B`. Assert modal overlay with bookmarks.
19. `code-explorer-search-filter-active` — Press `/`. Assert search input visible.
20. `code-explorer-search-filter-results` — Type "index". Assert filtered tree.
21. `code-explorer-search-no-results` — Type nonexistent. Assert "No matching files."
22. `code-explorer-line-numbers` — Open 100+ line file. Assert right-aligned muted line numbers.
23. `code-explorer-file-header` — Assert header with name, size, line count.
24. `code-explorer-symlink-display` — Assert symlink with `→ target` suffix.
25. `code-explorer-dotdot-entry` — Navigate into dir. Assert `..` entry at top.
26. `code-explorer-directory-sorting` — Assert directories before files, alphabetical.

#### Keyboard Interaction Tests — Tree (16)

27. `code-explorer-j-moves-cursor-down` — `j` moves cursor down.
28. `code-explorer-k-moves-cursor-up` — `k` moves cursor up.
29. `code-explorer-enter-expands-directory` — `Enter` expands collapsed dir.
30. `code-explorer-enter-collapses-directory` — `Enter` collapses expanded dir.
31. `code-explorer-enter-opens-file` — `Enter` opens file in preview.
32. `code-explorer-l-expands-directory` — `l` expands dir.
33. `code-explorer-h-collapses-directory` — `h` collapses dir.
34. `code-explorer-h-navigates-up` — `h` on collapsed dir navigates to parent.
35. `code-explorer-o-opens-file` — `o` opens file.
36. `code-explorer-o-noop-on-directory` — `o` on directory is no-op.
37. `code-explorer-G-jumps-to-end` — `G` jumps to last item.
38. `code-explorer-gg-jumps-to-start` — `gg` jumps to first item.
39. `code-explorer-ctrl-d-pages-down` — `Ctrl+D` pages down.
40. `code-explorer-ctrl-u-pages-up` — `Ctrl+U` pages up.
41. `code-explorer-backspace-navigates-up` — `Backspace` goes to parent dir.
42. `code-explorer-dotdot-navigates-up` — `Enter` on `..` goes to parent.

#### Keyboard Interaction Tests — Preview (10)

43–52. Preview scrolling (`j`/`k`/`Ctrl+D`/`Ctrl+U`/`G`/`gg`), markdown toggle (`m` on .md and non-.md), copy path (`y` with and without clipboard).

#### Keyboard Interaction Tests — Panel Switching (6)

53–58. `Tab`/`Ctrl+W` toggle focus, `Ctrl+B` show/hide sidebar, focus moves on sidebar hide.

#### Keyboard Interaction Tests — Bookmark Picker (6)

59–64. `B` opens picker, `j`/`k` navigate, `Enter` selects, `Esc` closes, filter works, current bookmark highlighted.

#### Keyboard Interaction Tests — Search Filter (5)

65–69. `/` activates search, typing filters tree, `Esc` clears, `Enter` selects result, `Backspace` updates filter.

#### Keyboard Interaction Tests — Global (5)

70–74. `q` pops, number switches tab, `R` retries on error / no-op when loaded, `?` shows help.

#### Responsive Tests — 80×24 (4)

75–78. Sidebar hidden, `Ctrl+B` overlays, file preview full-width with 4-char gutter, long paths truncated.

#### Responsive Tests — 120×40 (4)

79–82. Full two-panel layout, sidebar 30–40 cols, 5-char gutter, full breadcrumb.

#### Responsive Tests — 200×60 (3)

83–85. Expanded layout, sidebar 40–60 cols, 6-char gutter.

#### Responsive Tests — Resize (6)

86–91. Resize 120→80 hides sidebar, 80→120 shows sidebar, preserves focus/file/scroll, below-minimum recovery.

#### Integration Tests (14)

92–105. Tab persistence, different repo resets state, deep link, help overlay group, status bar hints, breadcrumb update, bookmark switch reloads, file not found after switch, auth expiry, rate limit, concurrent dir expand, file switch cancels previous, large directory pagination.

# TUI_REPO_FILE_TREE

Specification for TUI_REPO_FILE_TREE.

## High-Level User POV

The repository file tree is the navigable hierarchical view of a repository's file and directory structure in the Codeplane TUI. It appears in two contexts: as the sidebar pane of the code explorer tab (Tab 3: Code) within the repository screen, and as the sidebar pane of the diff viewer. In both contexts it serves the same purpose — giving the user a keyboard-driven way to browse, expand, collapse, and select files without leaving the terminal.

When the user activates the code explorer tab (by pressing `3` or `Tab` cycling to "Code"), the file tree appears on the left side of the content area, occupying 25% of the available width at standard terminal size (120×40). The main content area to the right shows a preview of the currently selected file. The file tree renders as a vertical list of entries — directories shown with a `▸` (collapsed) or `▾` (expanded) prefix followed by the directory name, and files shown with a two-space indent followed by the filename. Nesting depth is conveyed through additional indentation: each level adds two spaces. Directory entries are rendered in the `primary` color (blue), file entries in the default text color, and the currently focused entry is highlighted with reverse-video styling.

Navigation within the file tree uses vim-style keys: `j`/`k` (or arrow keys) to move the cursor up and down the visible entries, `Enter` or `l` to expand a directory or open a file for preview, `h` to collapse the current directory (or move to the parent directory if on a file), and `Space` to toggle a directory's expanded/collapsed state without moving focus. The user can jump to the top of the tree with `g g` and to the bottom with `G`. Pressing `/` activates an inline search filter that narrows the visible entries to those matching the typed substring — matching is case-insensitive and searches the full path, not just the filename. Pressing `Esc` while the search input is focused clears the filter and returns focus to the tree list.

The file tree loads lazily: only the root-level entries are fetched initially, and subdirectories are fetched on-demand when expanded. A directory being fetched shows a `⟳` spinner in place of the expand arrow. If a directory fetch fails, the entry shows an error indicator (`✗`) in red, and pressing `Enter` or `R` retries the fetch.

At minimum terminal size (80×24), the sidebar starts hidden and can be toggled with `Ctrl+B`. When visible at minimum size, it takes 30% of the width (24 columns minimum) and the main content area takes the remainder. At standard size, the sidebar is visible by default at 25%. At large size (200×60+), the sidebar gets additional padding and renders longer filenames without truncation.

File and directory names are truncated with a trailing `…` if they exceed the available sidebar width minus the indentation and icon prefix. The tree supports up to 20 levels of nesting depth (deeper paths are displayed but indentation caps at 20 × 2 = 40 characters). The total number of visible entries in the tree is bounded by the scrollbox viewport with cursor-based infinite scroll for extremely large repositories.

The file tree integrates with the rest of the repository screen: selecting a file in the tree updates the file preview pane on the right. The currently selected file path is shown in the header breadcrumb. When the file tree has focus, the status bar shows relevant keybinding hints. The file tree also supports a bookmark/ref selector at the top of the sidebar — pressing `b` opens a dropdown of available bookmarks, and choosing one reloads the tree at that ref.

## Acceptance Criteria

### Definition of Done

- [ ] The file tree renders in the sidebar pane when the Code tab (tab 3) is active within the repository screen
- [ ] The file tree is also rendered in the sidebar of the diff viewer screen (TUI_DIFF_FILE_TREE consumes this component)
- [ ] Root-level entries are fetched via `useRepoTree(owner, repo, ref, path)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/contents` (root) or `GET /api/repos/:owner/:repo/contents/:path` (subdirectory)
- [ ] Directories are displayed with `▸` (collapsed) or `▾` (expanded) prefix in `primary` color
- [ ] Files are displayed with appropriate indentation and default text color
- [ ] The focused entry is highlighted with reverse-video styling
- [ ] Expanding a directory fetches its children lazily on first expand
- [ ] Collapsing a directory hides its children but preserves their expanded/collapsed state for re-expansion
- [ ] Selecting a file (pressing `Enter`) updates the file preview pane with the selected file's content
- [ ] The breadcrumb updates to show the currently selected file's path
- [ ] The sidebar is toggleable with `Ctrl+B`
- [ ] The sidebar width is 25% at standard size, 30% at minimum size (when visible), with a minimum of 24 columns
- [ ] The file tree scrolls within a `<scrollbox>` that supports vim-style navigation
- [ ] Inline search filter (`/`) narrows entries by case-insensitive substring match on full path
- [ ] The bookmark/ref selector shows the current ref and allows switching
- [ ] Loading state shows `⟳` spinner on directories being fetched
- [ ] Error state shows `✗` in red on directories that failed to fetch, with `R` to retry
- [ ] Empty directory shows "(empty)" in muted text when expanded
- [ ] Empty repository shows "(empty repository)" centered in muted text
- [ ] Entry sort order: directories first (alphabetical), then files (alphabetical), case-insensitive

### Keyboard Interactions

- [ ] `j` / `Down`: Move cursor to next visible entry
- [ ] `k` / `Up`: Move cursor to previous visible entry
- [ ] `Enter` / `l`: Expand directory (if collapsed) or open file for preview
- [ ] `h`: Collapse current directory, or move to parent directory if on a file or already-collapsed directory
- [ ] `Space`: Toggle directory expanded/collapsed without moving focus
- [ ] `G`: Jump to last visible entry
- [ ] `g g`: Jump to first visible entry
- [ ] `Ctrl+D`: Page down (half viewport height)
- [ ] `Ctrl+U`: Page up (half viewport height)
- [ ] `/`: Focus inline search input
- [ ] `Esc`: Clear search filter / return focus to tree / move focus to main pane
- [ ] `b`: Open bookmark/ref selector
- [ ] `Ctrl+B`: Toggle sidebar visibility
- [ ] `R`: Retry failed directory fetch (when focused on errored entry)
- [ ] `Tab`: Move focus from file tree to main content pane
- [ ] `Shift+Tab`: Move focus from main content back to file tree
- [ ] `q`: Pop screen (return to previous)
- [ ] `?`: Show help overlay

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by app-shell
- [ ] 80×24 – 119×39: Sidebar starts hidden. When toggled visible via `Ctrl+B`, sidebar takes 30% width (min 24 cols). 1-space indentation per level. Aggressive filename truncation
- [ ] 120×40 – 199×59: Sidebar visible by default at 25% width. 2-space indentation. Filenames truncated at sidebar boundary
- [ ] 200×60+: Sidebar at 25% with padding. 2-space indentation. Filenames rarely truncated

### Truncation and Boundary Constraints

- [ ] Filename max display width: sidebar width - indentation - 4 chars. Truncated with `…`
- [ ] Directory name max display width: sidebar width - indentation - 4 chars. Truncated with `…`
- [ ] Maximum nesting indentation: 20 levels (40 chars at 2/level, 20 chars at 1/level)
- [ ] Search input max characters: 128
- [ ] Maximum path length for search: 512 characters
- [ ] Bookmark name max display width: sidebar width - 4 chars. Truncated with `…`
- [ ] Bookmark selector dropdown max visible items: 10 (scrollable)
- [ ] Entries per directory page: 100 (cursor-based pagination)
- [ ] Active tab index: always 2 (Code tab) when file tree is visible in repo context

### Edge Cases

- [ ] Terminal resize preserves expanded/collapsed state and scroll position
- [ ] Terminal resize from standard to minimum auto-hides sidebar
- [ ] Rapid `j`/`k` processed sequentially without skipping
- [ ] Expanding directory with slow network shows spinner immediately
- [ ] Empty directory shows "(empty)" placeholder
- [ ] Failed directory shows `✗` with retry support
- [ ] Empty repository shows "(empty repository)" message
- [ ] 10,000+ file repos handled via lazy loading and pagination
- [ ] Long filenames (200+ chars) truncated at sidebar boundary
- [ ] Nesting deeper than 20 levels caps indentation at 20
- [ ] Search with no matches shows "No matches"
- [ ] Search treats special characters as literals (no regex)
- [ ] Bookmark switch cancels pending fetches and resets expansion state
- [ ] Sidebar toggle moves focus appropriately
- [ ] Unicode filenames rendered correctly with grapheme-aware truncation
- [ ] Dotfiles displayed and sorted alphabetically
- [ ] Symlinks shown with `→` suffix
- [ ] Submodules shown with `◆` prefix, not expandable
- [ ] Binary files selectable, preview shows "Binary file" message
- [ ] SSE disconnect does not affect file tree (REST-only)

## Design

### Layout Structure

The file tree is part of the code explorer tab content area, rendered as a sidebar + main split:

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Code > src/index.ts        │
├─────────────────────────────────────────────────────────────┤
│ [1:Bookmarks] 2:Changes  [3:Code]  4:Conflicts  5:OpLog  6:Settings │
├──────────────┬──────────────────────────────────────────────┤
│ main ▾       │                                              │
│ ┌ /search    │  File Preview (TUI_REPO_FILE_PREVIEW)        │
│ │            │                                              │
│ ▾ src/       │  ```ts                                       │
│   ▸ components│  import { App } from "./App"                │
│   ▸ hooks/   │  // ...                                      │
│   ▸ screens/ │                                              │
│   index.ts ← │                                              │
│   App.tsx    │                                              │
│ ▸ tests/     │                                              │
│ .gitignore   │                                              │
│ package.json │                                              │
│ README.md    │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  h:collapse  /:search  Ctrl+B:sidebar │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

```jsx
<box flexDirection="row" height="100%">
  {/* Sidebar — file tree */}
  {sidebarVisible && (
    <box width={sidebarWidth} minWidth={24} flexDirection="column" borderRight="single" borderColor="border">
      {/* Bookmark/ref selector */}
      <box height={1} paddingX={1}>
        <text color="primary" bold>{currentRef}</text>
        <text color="muted"> ▾</text>
      </box>

      {/* Search filter input */}
      {searchActive && (
        <box height={1} paddingX={1} borderBottom="single" borderColor="border">
          <text color="muted">/</text>
          <input value={searchQuery} onChange={setSearchQuery} placeholder="filter files…" />
        </box>
      )}

      {/* File tree entries */}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {visibleEntries.map((entry) => (
            <box key={entry.path} height={1} inverse={entry.path === focusedPath}>
              <text color="muted">{"  ".repeat(Math.min(entry.depth, 20))}</text>
              {entry.type === "dir" ? (
                <>
                  {entry.loading ? <text color="warning">⟳ </text>
                   : entry.error ? <text color="error">✗ </text>
                   : <text color="primary">{entry.expanded ? "▾ " : "▸ "}</text>}
                  <text color="primary" bold>{truncate(entry.name, nameWidth)}</text>
                </>
              ) : (
                <>
                  <text>{"  "}</text>
                  <text>{truncate(entry.name, nameWidth)}</text>
                </>
              )}
            </box>
          ))}
        </box>
      </scrollbox>
    </box>
  )}

  {/* Main content — file preview */}
  <box flexGrow={1}>
    {selectedFile
      ? <FilePreview owner={owner} repo={repo} ref={currentRef} path={selectedFile.path} />
      : <box justifyContent="center" alignItems="center" height="100%">
          <text color="muted">Select a file to preview</text>
        </box>}
  </box>
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move cursor to next visible entry | Tree has focus |
| `k` / `Up` | Move cursor to previous visible entry | Tree has focus |
| `Enter` / `l` | Expand directory or open file | Tree has focus |
| `h` | Collapse directory or move to parent | Tree has focus |
| `Space` | Toggle directory expand/collapse | Tree has focus, entry is directory |
| `G` | Jump to last visible entry | Tree has focus |
| `g g` | Jump to first visible entry | Tree has focus |
| `Ctrl+D` | Page down | Tree has focus |
| `Ctrl+U` | Page up | Tree has focus |
| `/` | Focus search filter input | Tree has focus |
| `Esc` | Clear search / unfocus / move to preview | Contextual |
| `b` | Open bookmark/ref selector | Tree has focus, selector closed |
| `Ctrl+B` | Toggle sidebar visibility | Always (global) |
| `R` | Retry failed directory fetch | Focused on errored entry |
| `Tab` | Move focus to file preview pane | Tree has focus |
| `Shift+Tab` | Move focus to file tree | Preview has focus |
| `q` | Pop screen | Always |
| `?` | Show help overlay | Always |

### Responsive Behavior

| Terminal Size | Sidebar Visibility | Sidebar Width | Indentation | Truncation |
|--------------|-------------------|---------------|-------------|------------|
| < 80×24 | N/A (unsupported) | N/A | N/A | N/A |
| 80–119 cols | Hidden by default | 30% (min 24) when visible | 1 space/level | Aggressive |
| 120–199 cols | Visible by default | 25% | 2 spaces/level | At boundary |
| 200+ cols | Visible by default | 25% + padding | 2 spaces/level | Rarely needed |

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useRepoTree(owner, repo, ref, path?)` | `@codeplane/ui-core` | Fetch directory contents. Calls `GET /api/repos/:owner/:repo/contents` or `GET /api/repos/:owner/:repo/contents/:path` with `?ref=` param |
| `useBookmarks(owner, repo)` | `@codeplane/ui-core` | Fetch bookmark list for ref selector. Calls `GET /api/repos/:owner/:repo/git/refs` |
| `useRepo(owner, repo)` | `@codeplane/ui-core` | Repository metadata including `default_bookmark` for initial ref |
| `useKeyboard()` | `@opentui/react` | Keybinding registration |
| `useTerminalDimensions()` | `@opentui/react` | Responsive breakpoints and sidebar width |
| `useOnResize()` | `@opentui/react` | Synchronous re-layout on resize |
| `useNavigation()` | Local TUI | Breadcrumb updates, push/pop |

### Tree Entry Data Shape

```typescript
interface TreeEntry {
  name: string;        // filename or directory name
  path: string;        // full path from repo root
  type: "file" | "dir" | "submodule" | "symlink";
  size?: number;       // bytes (files only)
  linkTarget?: string; // symlink target
}
```

### Status Bar Hints

Tree focused: `j/k:navigate  Enter:open  h:collapse  /:search  b:bookmark  Ctrl+B:sidebar`
Preview focused: `j/k:scroll  S-Tab:tree  Ctrl+B:sidebar  q:back`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Auth (no access) | Read-Only | Member | Admin | Owner |
|--------|-----------|-------------------|-----------|--------|-------|-------|
| View public repo file tree | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View private repo file tree | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Expand directories | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Switch bookmark/ref | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| View file preview | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- Private repositories return 404 to users without read access (does not leak existence)
- The file tree is a read-only view — there are no write operations
- Branch/bookmark listing requires at least read access to the repository

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to the app-shell auth error screen

### Rate Limiting

- Authenticated users: 5,000 requests per hour to contents endpoints (platform-wide)
- Directory expansion triggers one API request per directory; rapid deep expansion bounded by sequential fetch
- 429 responses show "Rate limited" in `warning` color on the affected entry. `R` retries after Retry-After period
- No auto-retry on rate limit
- Bookmark list fetch counted against same rate limit

### Input Sanitization

- File paths come from API responses, not user input — no path traversal risk from client
- Search filter is treated as literal substring — no regex evaluation, no shell expansion
- Bookmark names come from API responses — validated server-side
- `owner`, `repo`, `ref` parameters validated against `^[a-zA-Z0-9_.-]+$` (owner/repo) and `^[a-zA-Z0-9_./-]+$` (ref)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.file_tree.view` | Code explorer tab activated, tree visible | `repo_full_name`, `ref`, `terminal_width`, `terminal_height`, `breakpoint`, `sidebar_visible`, `navigation_source` |
| `tui.repo.file_tree.expand_dir` | User expands a directory | `repo_full_name`, `ref`, `path`, `depth`, `load_time_ms`, `children_count` |
| `tui.repo.file_tree.collapse_dir` | User collapses a directory | `repo_full_name`, `ref`, `path`, `depth` |
| `tui.repo.file_tree.select_file` | User selects a file for preview | `repo_full_name`, `ref`, `file_path`, `file_extension`, `depth`, `method` (enter/l_key) |
| `tui.repo.file_tree.search` | User completes a search filter | `repo_full_name`, `ref`, `query_length`, `match_count`, `selected_result` |
| `tui.repo.file_tree.switch_ref` | User switches bookmark/ref | `repo_full_name`, `from_ref`, `to_ref`, `method` |
| `tui.repo.file_tree.toggle_sidebar` | Sidebar toggled | `repo_full_name`, `new_state` (visible/hidden), `method` (ctrl_b) |
| `tui.repo.file_tree.navigate` | User scrolls/pages through tree | `repo_full_name`, `ref`, `method` (j_k/ctrl_d_u/G_gg), `visible_entries_count` |
| `tui.repo.file_tree.error` | Directory fetch fails | `repo_full_name`, `ref`, `path`, `error_type`, `http_status` |
| `tui.repo.file_tree.retry` | User retries failed fetch | `repo_full_name`, `ref`, `path`, `retry_success` |
| `tui.repo.file_tree.pagination` | Next page triggered | `repo_full_name`, `ref`, `path`, `page_number`, `entries_loaded_total` |

All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `viewer_id`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Code tab activation rate | >20% of repo sessions | % of repo sessions visiting Code tab |
| File selection rate | >60% of Code tab views | % of Code tab views with file selection |
| Directory expansion depth | Track distribution | Average and max depth reached |
| Search filter usage | >15% of Code tab views | % using search filter |
| Bookmark switch rate | >5% of Code tab views | % switching ref |
| File tree load latency (p50) | <300ms | Root tree initial load |
| Directory expand latency (p50) | <200ms | Expand keypress to children visible |
| Error rate | <2% | % of directory fetches that fail |
| Retry success rate | >80% | % of retries that succeed |
| Time to first file selection | <10s | Median time from Code tab to first file |

## Observability

### Logging Requirements

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | File tree root loaded | `repo_full_name`, `ref`, `root_entries_count`, `load_time_ms` |
| `info` | Directory expanded | `repo_full_name`, `ref`, `path`, `children_count`, `load_time_ms` |
| `info` | File selected for preview | `repo_full_name`, `ref`, `file_path` |
| `info` | Bookmark/ref switched | `repo_full_name`, `from_ref`, `to_ref` |
| `warn` | Directory fetch failed | `repo_full_name`, `ref`, `path`, `http_status`, `error_message` (no token) |
| `warn` | Rate limited | `repo_full_name`, `ref`, `path`, `retry_after_seconds` |
| `warn` | Bookmark list fetch failed | `repo_full_name`, `http_status`, `error_message` |
| `debug` | Cursor moved | `focused_path`, `direction`, `visible_entries_count` |
| `debug` | Search filter applied | `query`, `match_count`, `total_entries` |
| `debug` | Search filter cleared | `previous_query` |
| `debug` | Sidebar toggled | `new_state`, `sidebar_width`, `trigger` |
| `debug` | Resize triggered | `old_dimensions`, `new_dimensions`, `sidebar_state_change` |
| `debug` | Pagination triggered | `path`, `cursor`, `page_size` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on root fetch | Hook timeout (30s) | Error message + "Press R to retry" in sidebar |
| Network timeout on dir expand | Hook timeout (10s) | `⟳` → `✗`. `R` or `Enter` retries |
| Repository not found (404) | API 404 | Code explorer shows "Repository not found." + `q` |
| Auth token expired (401) | API 401 | Propagated to app-shell auth error |
| Rate limited (429) | API 429 + Retry-After | "Rate limited" in warning color. `R` retries |
| Server error (500) | API 5xx | `✗` indicator. `R` retries |
| Empty repository | 0 root entries | "(empty repository)" message |
| Empty directory | 0 children | "(empty)" message |
| Bookmark list failure | Hook error | Selector shows error. Current ref persists |
| Resize during fetch | useOnResize fires | Fetch continues. Re-render at new size |
| Resize hides sidebar | Width < threshold | Auto-hide. Focus → main. `Ctrl+B` re-shows |
| Rapid directory expansion | Multiple concurrent fetches | Independent spinners. Results render on arrival |
| Bookmark switch during fetch | User selects new ref | Pending fetches cancelled (AbortController). Tree reloads |
| React error boundary | Component throws | Per-tab boundary. Other tabs unaffected |
| Malformed API response | Validation error | Entry-level error. Other entries unaffected |
| Deep nesting >20 levels | Depth check | Indentation caps at 20. Still navigable |

### Failure Modes

- **Total root fetch failure**: Error in sidebar. Main content shows placeholder. Tab bar/header/status bar stable. `q` works
- **Partial failure (one dir)**: Only failed dir shows error. Others render normally. No cascade
- **Bookmark switch failure**: Current tree preserved. Error in selector. `Esc` dismisses
- **Memory pressure**: Lazy loading prevents full tree fetch. Scrollbox virtualizes. Collapsed dirs release children from render tree
- **Sidebar toggle during fetch**: Fetch continues in background. Results render when sidebar re-shown

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`file-tree-initial-load`** — Navigate to repo, press `3` (Code tab) at 120×40. Snapshot. Assert sidebar visible with file tree. Root entries shown. Directories with `▸`. Files indented. First entry focused. Main content shows "Select a file to preview".
2. **`file-tree-expanded-directory`** — Navigate to Code tab. Focus a directory. Press `Enter`. Snapshot. Assert `▾` shown. Children indented under parent.
3. **`file-tree-deeply-nested`** — Expand 5 levels of directories. Snapshot. Assert progressive indentation (2 spaces/level).
4. **`file-tree-file-selected`** — Select a file with `Enter`. Snapshot. Assert file highlighted in tree. Preview pane shows content. Breadcrumb shows path.
5. **`file-tree-empty-directory`** — Expand an empty directory. Snapshot. Assert "(empty)" in muted text.
6. **`file-tree-empty-repo`** — Code tab for empty repo. Snapshot. Assert "(empty repository)" in muted text.
7. **`file-tree-loading-state`** — Slow API. Snapshot during fetch. Assert `⟳` spinner on expanding directory.
8. **`file-tree-error-state`** — Failing API on expand. Snapshot. Assert `✗` in red. Other entries unaffected.
9. **`file-tree-search-active`** — Press `/`, type "index". Snapshot. Assert search input visible. Tree filtered.
10. **`file-tree-search-no-matches`** — Press `/`, type nonexistent string. Snapshot. Assert "No matches".
11. **`file-tree-bookmark-selector`** — Press `b`. Snapshot. Assert dropdown with bookmarks. Current marked with `●`.
12. **`file-tree-sidebar-hidden`** — 80×24. Code tab. Snapshot. Assert sidebar hidden.
13. **`file-tree-sidebar-toggled-visible`** — 80×24, press `Ctrl+B`. Snapshot. Assert sidebar at 30% width.
14. **`file-tree-directories-first-sort`** — Snapshot root entries. Assert dirs before files, alphabetical.
15. **`file-tree-truncated-filename`** — 80×24 with sidebar. Snapshot. Assert long names truncated with `…`.
16. **`file-tree-symlink-display`** — Repo with symlinks. Snapshot. Assert `→ target` in muted text.
17. **`file-tree-submodule-display`** — Repo with submodules. Snapshot. Assert `◆` prefix in muted text.
18. **`file-tree-breadcrumb-update`** — Select file. Snapshot header. Assert breadcrumb includes file path.
19. **`file-tree-status-bar-hints`** — Tree focused. Snapshot status bar. Assert keybinding hints shown.
20. **`file-tree-bookmark-label`** — Snapshot sidebar header. Assert bookmark name displayed.

#### Keyboard Interaction Tests

21. **`file-tree-j-moves-down`** — Press `j`. Assert focus moves to second entry.
22. **`file-tree-k-moves-up`** — On second entry, press `k`. Assert focus on first.
23. **`file-tree-k-at-top-noop`** — On first entry, press `k`. Assert stays on first.
24. **`file-tree-j-at-bottom-noop`** — On last entry, press `j`. Assert stays on last.
25. **`file-tree-enter-expands-directory`** — On collapsed dir, press `Enter`. Assert expanded with children.
26. **`file-tree-enter-opens-file`** — On file, press `Enter`. Assert preview updates.
27. **`file-tree-l-expands-directory`** — On collapsed dir, press `l`. Assert expanded.
28. **`file-tree-l-opens-file`** — On file, press `l`. Assert preview updates.
29. **`file-tree-h-collapses-directory`** — On expanded dir, press `h`. Assert collapsed.
30. **`file-tree-h-moves-to-parent`** — On file inside dir, press `h`. Assert focus on parent dir.
31. **`file-tree-h-on-collapsed-moves-parent`** — On collapsed nested dir, press `h`. Assert focus on parent.
32. **`file-tree-h-at-root-noop`** — On root entry, press `h`. Assert no change.
33. **`file-tree-space-toggles-expand`** — On dir, press `Space` twice. Assert expand then collapse. Focus unchanged.
34. **`file-tree-space-on-file-noop`** — On file, press `Space`. Assert no change.
35. **`file-tree-G-jumps-to-end`** — Press `G`. Assert focus on last visible entry.
36. **`file-tree-gg-jumps-to-start`** — Press `G` then `g g`. Assert focus on first entry.
37. **`file-tree-ctrl-d-page-down`** — Press `Ctrl+D`. Assert cursor advances half viewport.
38. **`file-tree-ctrl-u-page-up`** — Page down then `Ctrl+U`. Assert returns to original.
39. **`file-tree-slash-focuses-search`** — Press `/`. Assert search input focused.
40. **`file-tree-search-filters-entries`** — Press `/`, type "test". Assert only matching entries visible.
41. **`file-tree-search-case-insensitive`** — Type "README". Assert "readme.md" visible.
42. **`file-tree-esc-clears-search`** — In search, press `Esc`. Assert filter cleared. Focus on tree.
43. **`file-tree-b-opens-bookmark-selector`** — Press `b`. Assert selector visible.
44. **`file-tree-bookmark-select-reloads`** — Select different bookmark, press `Enter`. Assert tree reloads at new ref.
45. **`file-tree-bookmark-esc-cancels`** — Open selector, press `Esc`. Assert closed. Tree unchanged.
46. **`file-tree-ctrl-b-toggles-sidebar`** — 120×40. Press `Ctrl+B` twice. Assert hidden then visible.
47. **`file-tree-tab-focus-to-preview`** — Press `Tab`. Assert focus on preview pane.
48. **`file-tree-shift-tab-focus-to-tree`** — Preview focused, press `Shift+Tab`. Assert focus on tree.
49. **`file-tree-R-retries-error`** — On errored dir, press `R`. Assert fetch retried.
50. **`file-tree-enter-retries-error`** — On errored dir, press `Enter`. Assert fetch retried.
51. **`file-tree-q-pops-screen`** — Press `q`. Assert returns to previous screen.
52. **`file-tree-rapid-j-presses`** — Press `j` 15 times. Assert focus moves 15 entries.
53. **`file-tree-expand-preserves-children`** — Expand A, expand B inside A, collapse A, expand A. Assert B still expanded.
54. **`file-tree-selection-updates-breadcrumb`** — Select file, select another. Assert breadcrumb updates each time.
55. **`file-tree-help-includes-tree`** — Press `?`. Assert "File Tree" group in help overlay.

#### Responsive Tests

56. **`file-tree-80x24-sidebar-hidden`** — 80×24. Assert sidebar hidden by default.
57. **`file-tree-80x24-sidebar-toggle`** — 80×24. `Ctrl+B` toggles sidebar at 30%.
58. **`file-tree-80x24-truncation`** — 80×24 with sidebar. Assert aggressive truncation.
59. **`file-tree-80x24-reduced-indent`** — 80×24 with sidebar. Assert 1-space indentation.
60. **`file-tree-120x40-default-visible`** — 120×40. Assert sidebar at 25%, 2-space indent.
61. **`file-tree-120x40-full-layout`** — 120×40. Expand dirs, select file. Assert correct split layout.
62. **`file-tree-200x60-expanded-layout`** — 200×60. Assert sidebar with padding. Filenames rarely truncated.
63. **`file-tree-resize-standard-to-min`** — 120→80. Assert sidebar auto-hides. Expanded state preserved.
64. **`file-tree-resize-min-to-standard`** — 80→120. Assert sidebar appears with tree.
65. **`file-tree-resize-preserves-focus`** — Focus entry. Resize. Assert same entry focused.
66. **`file-tree-resize-during-fetch`** — Expand dir, resize during fetch. Assert completes at new size.

#### Integration Tests

67. **`file-tree-auth-expiry`** — 401 on fetch → app-shell auth error screen.
68. **`file-tree-rate-limit-429`** — 429 on expand → "Rate limited" in warning color.
69. **`file-tree-network-error-root`** — Timeout on root → error with "Press R to retry".
70. **`file-tree-network-error-expand`** — Timeout on expand → `✗` indicator. Others unaffected.
71. **`file-tree-server-error-500`** — 500 on expand → `✗` with generic error.
72. **`file-tree-bookmark-switch-cancels`** — Expand dir, switch bookmark before complete. Assert cancelled. Tree reloads.
73. **`file-tree-bookmark-switch-resets`** — Expand dirs, switch bookmark. Assert root-only collapsed at new ref.
74. **`file-tree-tab-switch-preserves`** — Expand on Code tab, switch tabs, switch back. Assert expanded state preserved.
75. **`file-tree-deep-link-code-tab`** — Launch with `--screen repo --repo owner/repo --tab code`. Assert Code tab with file tree.
76. **`file-tree-concurrent-expands`** — Expand two sibling dirs rapidly. Assert both expand correctly.
77. **`file-tree-select-then-back`** — Select file, `q`, re-enter. Assert state preserved.
78. **`file-tree-empty-repo-code-tab`** — Empty repo Code tab. Assert "(empty repository)" in sidebar.

# TUI_REPO_CODE_EXPLORER

## Implementation Plan

### 1. View Scaffold & State Management (`apps/tui/src/screens/repository/CodeExplorerTab.tsx`)
- Create `CodeExplorerTab` component designed to be rendered within the `RepoOverviewScreen` when tab index 2 ("Code") is active.
- Initialize React state to manage the explorer's context:
  - `currentBookmark` (string) - Sourced from `useRepo` default branch initially, updated via bookmark picker.
  - `currentPath` (string) - Tracks the current root directory being viewed in the tree.
  - `selectedFile` (string | null) - The path of the file loaded in the preview panel.
  - `focusedPanel` ("tree" | "preview") - Tracks keyboard focus between the two panels.
  - `sidebarVisible` (boolean) - Tracks if the sidebar is expanded. Default derived from `useLayout` breakpoints.
  - `isBookmarkPickerOpen` (boolean) - Toggles the bookmark selection modal.
- Integrate data hooks from `@codeplane/ui-core`:
  - `useRepoTree(owner, repo, currentBookmark, currentPath)` to load directory contents.
  - `useFileContent(owner, repo, currentBookmark, selectedFile)` to fetch the file blob and stats for the active file.
  - `useBookmarks(owner, repo)` to populate the bookmark picker overlay.

### 2. View Composition (Split Layout)
- Utilize the `<SplitLayout>` dependency component (from `tui-repo-sidebar-split-layout`).
- Pass `sidebarVisible` and a dynamically calculated `sidebarWidth` (25% clamped to 30-40 columns on standard, 40-60 on large) to the layout.
- **Left Panel (Sidebar):** 
  - Mount the `FileTree` component (from `tui-repo-file-tree`).
  - Pass `treeData`, `currentBookmark`, `currentPath`, and `focused={focusedPanel === "tree"}`.
  - Pass callbacks: `onSelectFile` (updates `selectedFile`), `onBookmarkClick` (opens picker), and `onNavigatePath` (updates `currentPath`).
- **Right Panel (Main):**
  - Mount the `FilePreview` component (from `tui-repo-file-preview`).
  - Pass the results of `useFileContent` (content string, size, line count, binary status) and `focused={focusedPanel === "preview"}`.

### 3. Keyboard Input & Focus Coordination
- Register screen-level keybindings using the `useScreenKeybindings` pattern:
  - `Tab` / `Ctrl+W`: Toggle `focusedPanel` between `"tree"` and `"preview"`. If `sidebarVisible` is false, force focus to `"preview"`.
  - `Ctrl+B`: Toggle `sidebarVisible`. If the sidebar hides while focused, shift focus to `"preview"`.
  - `B`: Open the bookmark picker modal by setting `isBookmarkPickerOpen(true)`.
  - `q`: Pop the current screen view or close open overlays/search filters if active.
  - `R`: Trigger refetch on data hooks in case of network errors.
- The child components (`FileTree` and `FilePreview`) are responsible for binding their own contextual keys (`j`, `k`, `Enter`, `/`, `m`, `y`) natively only when their passed `focused` prop is true.

### 4. Responsive Adaptation
- Consume `useLayout()` to access `breakpoint` and terminal dimensions.
- Handle minimum limits:
  - If `breakpoint === "minimum"` (80x24 to 119x39), `sidebarVisible` initializes to `false`. 
  - `Ctrl+B` toggles the sidebar as an overlay rather than a permanent split on small screens.
- Calculate dynamic line number gutters for the file preview based on screen size (4-char minimum, 5-char standard, 6-char large).

### 5. Error & Loading States
- Mount `ErrorBoundary` instances over both `FileTree` and `FilePreview` to isolate render failures.
- Manage loading states by passing `isLoading` booleans to children. `FileTree` should render skeleton items; `FilePreview` should render a spinner.
- If API calls return errors (e.g. 404 or 500), display inline OpenTUI `<text color="error">` boundaries in the respective panel with the instruction: "Press R to retry."
- Delegate 401 Unauthorized errors to the `AppShell` boundary.

### 6. Bookmark Picker Modal
- Create a `<Modal>` (or use `ModalSystem`) overlay for the bookmark picker.
- Include an `<input>` for fuzzy filtering and a `<scrollbox>` of bookmarks.
- On select: update `currentBookmark`, clear `selectedFile`, and reset `currentPath` to root. Close modal.

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests utilize `@microsoft/tui-test` to validate keyboard paths and buffer outputs.

**1. Snapshot Tests**
- `code-explorer-initial-load`: Load at 120x40 breakpoint. Assert `<SplitLayout>` rendering with `FileTree` on the left and an empty state message in `FilePreview`.
- `code-explorer-file-selected`: Mock `useFileContent` payload for `src/index.ts`. Assert `FilePreview` renders `<code>` with highlighted output and correct file headers.
- `code-explorer-tree-focus-indicator`: Ensure `FileTree` renders with `primary` border color on load.
- `code-explorer-preview-focus-indicator`: Send `Tab`. Assert `FilePreview` panel renders with `primary` border and tree reverts to `border` color.
- `code-explorer-bookmark-selector`: Assert bookmark name displays correctly at the top of the file tree.
- `code-explorer-path-breadcrumb`: Mock navigation into `src/`. Assert breadcrumb shows the current path structure.
- `code-explorer-binary-file`: Mock binary file payload. Assert `Binary file — {size} — preview not available` displays in the preview panel.
- `code-explorer-markdown-rendered`: Mock `.md` file payload. Send `m`. Assert OpenTUI `<markdown>` parsing is rendered.
- `code-explorer-empty-repo`: Mock empty repository. Assert "No files found." tree state.
- `code-explorer-loading-tree`: Delay API mock. Assert skeleton view + loading spinner presence.

**2. Keyboard Interaction Tests**
- `code-explorer-ctrl-w-toggles-focus`: Send `Ctrl+W`. Assert active panel border swap.
- `code-explorer-ctrl-b-toggles-sidebar`: Send `Ctrl+B`. Assert sidebar width transitions to 0, and focus transfers to preview panel.
- `code-explorer-b-opens-bookmark-picker`: Send `B`. Assert bookmark modal renders over content. Navigate with `j`/`k`, hit `Enter`. Verify `currentBookmark` state updates and tree resets.
- `code-explorer-q-behavior`: Focus tree, send `q`. Verify application pops from navigation stack.

**3. Responsive & Layout Tests**
- `code-explorer-80x24-sidebar-hidden`: Resize to 80x24. Assert sidebar is hidden by default and preview claims 100% viewport width.
- `code-explorer-120x40-sidebar-visible`: Resize to 120x40. Assert sidebar resumes 25% width.
- `code-explorer-resize-preserves-state`: Expand directory in tree, select file, scroll preview. Resize terminal from 120x40 to 80x24. Assert selected file, expanded dir state, and scroll offset are preserved.
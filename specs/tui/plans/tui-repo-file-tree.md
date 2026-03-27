# Implementation Plan: TUI Repository File Tree (`tui-repo-file-tree`)

This plan details the step-by-step implementation for the Codeplane TUI Repository File Tree component. It incorporates OpenTUI primitives, internal shared hooks, and comprehensive testing.

## Step 1: Define Types and Constants
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/types.ts`

1. Import `@codeplane/ui-core` types (e.g., API-level `TreeEntry`).
2. Define internal state interfaces `TreeNode` (recursive structure) and `VisibleEntry` (flattened structure for rendering).
3. Define sort functions that prioritize directories over files, then alphanumeric ordering.
4. Define strict constants: `MAX_INDENT_DEPTH = 20`, `DIR_PAGE_SIZE = 100`, `MAX_SEARCH_LENGTH = 128`.

## Step 2: Implement Tree State Hook
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/useTreeState.ts`

1. Construct the `useTreeState` hook to manage the hierarchical state, lazy-loading of directories, and tracking of `focusedIndex`.
2. Expose navigation utilities: `moveFocusDown`, `moveFocusUp`, `expandOrSelect`, `collapseOrParent`, `toggleExpand`, `switchRef`.
3. Integrate the `@codeplane/ui-core` API client for fetching `fetchDirectory(path, ref)`.
4. Apply depth-first traversal wrapped in `useMemo` to construct the flattened array of `VisibleEntry[]` based on expanded directory state.
5. Guarantee cleanup via `AbortController` mapping for fetching directories (especially crucial during rapid bookmark switches).

## Step 3: Implement Search Filter Hook
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/useTreeSearch.ts`

1. Define `TreeSearchState` to hold filter inputs and toggle states.
2. Execute case-insensitive literal substring matches against `entry.path`.
3. Ensure search does not utilize complex regex to prevent arbitrary shell injection/hangs.

## Step 4: Develop the Bookmark Selector
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/BookmarkSelector.tsx`

1. Implement the dropdown using OpenTUI `<box>` and `<text>`.
2. Handle open/closed states. When closed, display the current ref (e.g., `main ▾`). When open, loop a max of 10 bookmarks in a scrollable block.
3. Capture `Esc` to dismiss and `Enter` to select.
4. Integrate `truncateText` from `apps/tui/src/util/truncate.ts` for excessively long branch names based on terminal layout context.

## Step 5: Construct the Single Row Entry Component
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/FileTreeEntry.tsx`

1. Create the `FileTreeEntry` functional component, taking `VisibleEntry` and `focused` properties.
2. Leverage `useResponsiveValue` from `apps/tui/src/hooks/useResponsiveValue.ts` to calculate indentation based on breakpoint (`minimum: 1, standard: 2, large: 2`).
3. Use `useSpinner` for real-time loading feedback on nodes actively fetching children.
4. Style directories, files, symlinks, and submodules using appropriate `theme` colors (`primary` for dirs, `muted` for submodules, etc.).
5. Implement text truncation bounded by `availableWidth` (calculated recursively accounting for `depth * indent`).

## Step 6: Assemble the Main File Tree Sidebar
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/FileTree.tsx`

1. Layout structure: Compose the `BookmarkSelector`, search input, and `<scrollbox>` using `<box flexDirection="column">`.
2. Map `visibleEntries` (or filtered results) to `FileTreeEntry` components.
3. Implement `useScreenKeybindings`: map vim-style bindings (`j/k/h/l`, `Space`, `Enter`, `R` for retry) dynamically hooked to the `useTreeState` context.
4. Incorporate `telemetry.ts`: `emit('tui.repo.file_tree.view')`, `.expand_dir`, `.collapse_dir`, etc., ensuring we track usage accurately.
5. Capture internal loading and empty repository states.

## Step 7: Create the Code Explorer Tab Wrapper
**Target File:** `apps/tui/src/screens/Repository/CodeExplorer/CodeExplorerTab.tsx`

1. Integrate `SplitLayout` from `tui-repo-sidebar-split-layout`.
2. Mount `FileTree` in the `sidebar` prop.
3. Use the `main` prop to render either a generic placeholder ("Select a file to preview" or "pending TUI_REPO_FILE_PREVIEW") or coordinate the selected `filePath`.
4. Use `useLayout` to compute `sidebarWidth` responsively.

## Step 8: Screen Integration & Exports
**Target Files:**
- `apps/tui/src/screens/Repository/CodeExplorer/index.ts`
- `apps/tui/src/screens/Repository/RepoOverviewScreen.tsx`

1. Set up barrel exports in `index.ts` to export all newly created components cleanly.
2. In `RepoOverviewScreen.tsx`, locate Tab index 2 (`Code`) and replace `PlaceholderTab` with the newly implemented `CodeExplorerTab`.

## Step 9: Testing Strategy
**Target File:** `e2e/tui/repository.test.ts`

1. Use `@microsoft/tui-test` and `launchTUI` to script integration environments.
2. **Snapshot tests**: Verify terminal buffer rendering (loading, error, nested structure, empty directory, search states) at configurations 80x24, 120x40, and 200x60.
3. **Keyboard tests**: Programmatically trigger `sendKeys` simulating `j`, `k`, `Enter`, `l`, `/`, and `Esc` to validate internal navigation state and focus mutations.
4. **Responsive tests**: Invoke `tui.resize` to assert the file tree smoothly transitions, collapsing sidebars when minimum dimensions are breached without crashing.
5. Ensure failing endpoints default to robust error screens with clear retry mechanisms (do not mock internal state; test against real/stub API behaviors).
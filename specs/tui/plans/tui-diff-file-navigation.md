# Implementation Plan: TUI_DIFF_FILE_NAVIGATION

This document outlines the step-by-step implementation plan for adding sequential and targeted file jumping (`]/[`) to the Codeplane TUI diff viewer, based on the provided engineering specification.

## Phase 1: Core Utilities and State Types

### Step 1.1: Create Navigation Utilities
**Target File:** `apps/tui/src/screens/DiffScreen/file-nav-utils.ts` (New File)
1.  Implement pure, dependency-free utility functions:
    *   `abbreviateStat(count: number): string` - For formatting addition/deletion counts (e.g., `1500` -> `1.5K`).
    *   `truncateFilePath(path: string, maxWidth: number): string` - For clipping paths in narrow sidebars, prioritizing the filename and using `…/` prefixes.
    *   `formatFileIndicator(index: number, total: number): string` - For the status bar (e.g., `"File 1 of 5"`), ensuring padding aligns for rapid navigation.
2.  Add JSDoc examples for each utility.

### Step 1.2: Define State and Event Types
**Target File:** `apps/tui/src/screens/DiffScreen/types.ts` (Modified File)
1.  Define the `FileNavigationState` interface to represent the `focusedFileIndex`, `treeCursorIndex`, and `collapseState`.
2.  Add a `FileNavEvent` discriminated union to formalize telemetry payloads for `tui.diff.file_navigated`, `tui.diff.file_tree_selected`, and `tui.diff.file_nav_noop`.

## Phase 2: The Navigation Engine

### Step 2.1: Implement `useFileNavigation` Hook
**Target File:** `apps/tui/src/screens/DiffScreen/useFileNavigation.ts` (New File)
1.  Define the `FileNavigationOptions` and `FileNavigationResult` interfaces.
2.  Create the `useFileNavigation` hook.
3.  Implement main content scrolling logic using `mainScrollRef.current?.scrollTo(y)` by looking up `file-header-${index}` using OpenTUI's `findDescendantById`.
4.  Implement sidebar auto-scrolling using `sidebarScrollRef.current?.scrollChildIntoView("file-tree-entry-${index}")`.
5.  Build the core `navigateToIndex` logic:
    *   Updates both `focusedFileIndex` and `treeCursorIndex`.
    *   Clears `collapseState` (resets all hunks to expanded).
    *   Uses `queueMicrotask` to trigger scroll functions after React commits the state.
    *   Emits telemetry (`emit()`) and logs (`logger.debug()`).
6.  Create public methods `navigateNext` and `navigatePrev` using wrap-around modular arithmetic.
7.  Add a `useEffect` bounds checker to clamp the index if the `total` file count shrinks (e.g., after ignoring whitespace).

### Step 2.2: Export from Screen Module
**Target File:** `apps/tui/src/screens/DiffScreen/index.ts` (Modified File)
1.  Export the `useFileNavigation` hook and the utility functions to make them available across the `DiffScreen` module.

## Phase 3: Component Integration

### Step 3.1: Update DiffFileTree (Sidebar)
**Target File:** `apps/tui/src/components/diff/DiffFileTree.tsx`
1.  Update the prop interface to accept `focusedFileIndex`, `treeCursorIndex`, `onTreeCursorChange`, `onFileSelect`, and `focused`.
2.  Wrap the component in `forwardRef<ScrollBoxRenderable, DiffFileTreeProps>` to expose the underlying `<scrollbox>`.
3.  Calculate available sidebar width using `useTerminalDimensions()`.
4.  Map over files and render each entry with `id={\`file-tree-entry-${index}\`}`.
5.  Apply visual treatments:
    *   Use `truncateFilePath` and `abbreviateStat` for text display.
    *   Apply `inverse={true}` style to the `focusedFileIndex` entry.
    *   Prefix `▸ ` to the `treeCursorIndex` entry when the tree is focused.

### Step 3.2: Update DiffViewer (Main Content)
**Target File:** `apps/tui/src/components/diff/DiffViewer.tsx`
1.  Wrap the component in `forwardRef<ScrollBoxRenderable, DiffViewerProps>`.
2.  Ensure every file section header in the render loop receives `id={\`file-header-${index}\`}`.
3.  Update the mode indicator row to display `[{focusedFileIndex + 1}/{files.length}]` alongside the current file path.

## Phase 4: Screen Coordination

### Step 4.1: Wire Keybindings
**Target File:** `apps/tui/src/screens/DiffScreen/keybindings.ts`
1.  Extend `DiffKeybindingContext` with `navigateNext`, `navigatePrev`, `navigateToFile`, `treeCursorIndex`, `isLoading`, and `hasError`.
2.  Implement the `]` (Next file) and `[` (Previous file) handlers. **Do not restrict them with a `when` predicate**, so they work globally within the screen.
3.  Implement the `return` (Enter) handler to trigger `navigateToFile(treeCursorIndex)` and set focus back to `"content"`, restricted with `when: () => ctx.focusZone === "tree"`.
4.  Add a `StatusBarHint` for the dynamic file indicator with `order: 100`.

### Step 4.2: Update DiffScreen Shell
**Target File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`
1.  Instantiate local state: `focusedFileIndex`, `treeCursorIndex`, and `collapseState`.
2.  Create `useRef<ScrollBoxRenderable>(null)` for `mainScrollRef` and `sidebarScrollRef`.
3.  Call `useFileNavigation` passing the refs, state, and `files` array.
4.  Update the `useScreenKeybindings` call to include navigation functions and append the dynamic `{ keys: fileNav.fileIndicator, label: "", order: 100 }` to the hints array.
5.  Pass down state, callbacks, and refs to `<DiffFileTree />` and `<DiffViewer />`.

## Phase 5: Verification and Testing

### Step 5.1: Write End-to-End Tests
**Target File:** `e2e/tui/diff.test.ts`
1.  Append all 52 specified tests across the 7 functional suites:
    *   **Snapshot Tests (SNAP-FNAV-001 - 010):** Verify rendering of status bar, inverse highlights, truncations, and scroll targeting.
    *   **Keyboard Interaction (KEY-FNAV-001 - 022):** Verify `]`, `[`, `Enter`, `Tab`, and edge-case behaviors (wrapping, rapid presses, collapse reset).
    *   **Responsive Tests (RSP-FNAV-001 - 008):** Validate terminal resizing, sidebar hiding (80x24), and stat abbreviations.
    *   **Integration Tests (INT-FNAV-001 - 005):** Test interactions alongside whitespace toggling and deep linking.
    *   **Edge Case Tests (EDGE-FNAV-001 - 007):** Ensure stability with empty diffs, massive diffs (500 files), single-file diffs, and renamed files.
2.  Run `bun test e2e/tui/diff.test.ts` to capture golden snapshots.

### Step 5.2: Productionization Checklist
1.  Run `bun run typecheck` in `apps/tui/` to ensure no `any` leaks and ref propagation is typed correctly.
2.  Verify no rogue `console.log` statements exist; everything must route via `logger.debug` or `logger.warn`.
3.  Ensure `viewportCulling={true}` is set on the `DiffFileTree` `<scrollbox>` for O(1) rendering performance on massive diffs.
4.  Verify that failing tests caused by unimplemented API routes are left as-is (failing), as per the repository testing philosophy.
# Implementation Plan: tui-repo-code-explorer

This document outlines the step-by-step implementation plan for the Repository Code Explorer feature in the Codeplane TUI.

## Pre-requisites Note
As identified during the codebase research, some prerequisite directories (e.g., `apps/tui/src/screens/Repository/`) and shared components (e.g., `SplitLayout`, data hooks from `@codeplane/ui-core`) are currently missing from the workspace. This implementation plan assumes these dependencies will be created prior to or alongside this ticket as specified in their respective dependency tickets (`tui-repo-sidebar-split-layout`, `tui-repo-tree-hooks`, `tui-repo-screen-scaffold`).

## Step 1: Types, Utilities, and Telemetry

1. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/types.ts`**
   - Define TypeScript interfaces `CodeExplorerPanel`, `MarkdownMode`, and `FlatTreeNode`.
   - Define component prop interfaces: `FileTreeProps`, `FilePreviewProps`, and `BookmarkPickerProps`.

2. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/utils.ts`**
   - Implement pure functions for tree sorting (`sortTreeEntries`) and tree flattening (`flattenTree`).
   - Implement string and formatting utilities (`formatFileSize`, `formatPathBreadcrumb`, `getFileExtension`, `extensionToFiletype`).
   - Implement content detection tools (`isBinaryContent`, `isMarkdownFile`, `countLines`).
   - Implement fuzzy search utilities (`fuzzyMatch`, `filterTreeNodes`).
   - Define constants for limits: `MAX_VISIBLE_TREE_ITEMS`, `MAX_FILE_LINES`, `MAX_TREE_DEPTH`, `MAX_SEARCH_LENGTH`.

3. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/telemetry.ts`**
   - Create a helper `emitCodeExplorerEvent` wrapping the shared `emit` method from `lib/telemetry.js` to dispatch standardized events (e.g., `view`, `file_opened`).

4. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/index.ts`**
   - Provide a barrel export for the module, exporting `CodeExplorerTab` and core types (`CodeExplorerPanel`, `FlatTreeNode`, `MarkdownMode`).

## Step 2: Presentational Components

1. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/TreeRow.tsx`**
   - Build a stateless component using OpenTUI `<box>` and `<text>`.
   - Construct visual hierarchies using indentation rules (`depth * 2`), and directional prefixes (`▸`, `▾`, `·`).
   - Apply visual semantics: bold text for directories (`attributes={1}`), and reverse video (primary background) for the currently focused row.
   - Apply truncation logic (`…`) to fit names within the available console width.

2. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/FileHeader.tsx`**
   - Build a single-row `<box>` layout with `justifyContent="space-between"`.
   - Render the file name (bold, primary) on the left.
   - Render the file size and line count (muted) on the right.

## Step 3: Complex Views and Overlays

1. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/BookmarkPicker.tsx`**
   - Build a modal component leveraging `<box position="absolute">` to overlay the screen.
   - Integrate an OpenTUI `<input>` at the top for fuzzy filtering.
   - Embed a `<scrollbox>` listing matching bookmarks.
   - Handle its localized keyboard bindings mapping `j`/`k` to navigation, `Enter` to selection, and `Esc` to close.

2. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/FilePreview.tsx`**
   - Structure the right-pane component wrapped within a passed-through `<scrollbox>`.
   - Render conditional states: No File, Loading, Binary (`"preview not available"`), Empty, API Error, and Content.
   - For content, seamlessly toggle between OpenTUI's `<code>` block (with auto-mapped `filetype` for syntax highlighting) and `<markdown>` block.

3. **Create `apps/tui/src/screens/Repository/tabs/code-explorer/FileTree.tsx`**
   - Structure the left-pane component displaying repository structure.
   - Group layout items: bookmark selector header, path breadcrumb, separator, conditional search input `<input>`, parent directory `..` fallback, and a `<scrollbox>` housing `TreeRow` elements.

## Step 4: Component Orchestrator

1. **Create `apps/tui/src/screens/Repository/tabs/CodeExplorerTab.tsx`**
   - Construct the central orchestrator maintaining primary state: `currentBookmark`, `selectedFile`, `currentPath`, `expandedDirs`, `searchQuery`, and `markdownMode`.
   - Utilize core data hooks (`useRepoTree`, `useFileContent`, `useBookmarks`).
   - Manage lazy loading optimizations and caching (`childrenMapRef`) to minimize API requests when toggling directories.
   - Assemble the view using `SplitLayout` (`sidebarTitle="Files"`, `mainTitle="Preview"`), mapping the `sidebar` prop to `FileTree` and `main` prop to `FilePreview`.
   - Manage complex keyboard event orchestration by piping interactions to `additionalKeybindings` based on focus state and active modal overlays.

## Step 5: Tab Registration

1. **Modify `apps/tui/src/screens/Repository/tabs/index.ts`**
   - Update the `TAB_CONTENT` definitions array.
   - Locate index 2 (the "Code" tab) and replace the existing `PlaceholderTab` fallback with the implemented `CodeExplorerTab` component.

## Step 6: Testing Implementation

1. **Update `e2e/tui/repository.test.ts`**
   - **Unit Tests:** Append an isolated `describe("code-explorer-utils")` block executing assertions against pure utilities using `bun:test`.
   - **Snapshot Tests:** Inject `@microsoft/tui-test` flows to launch the TUI, navigate specifically to the Code tab, trigger component actions, and assert the terminal output string against snapshots.
   - **Keyboard Interaction Tests:** Dispatch sequential key inputs (e.g., `j`, `k`, `Enter`, `l`, `h`) verifying focus indicator state, directory expansion visibility, and clipboard integrations.
   - **Responsiveness Tests:** Dispatch mock resize events (`80x24` collapsing sidebar logic vs. `120x40` restoring standard split layouts).
   - **API Error Integrations:** Validate 5xx/429 network response resilience asserting appropriate retry triggers and "Rate limited" visual feedbacks.
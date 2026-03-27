# Implementation Plan: TUI_DIFF_SPLIT_VIEW

This document outlines the step-by-step implementation plan for the `tui-diff-split-view` feature in the Codeplane TUI. The implementation leverages existing OpenTUI primitives, the current parsing utilities, and adheres to the required layout constraints.

## Phase 1: Foundation & Data Layer

### Step 1.1: Relocate Diff Parsing Utilities
Move the diff parsing utilities from the specs directory to the active source tree to make them available for the UI components.

*   **Action**: Copy `specs/tui/apps/tui/src/lib/diff-types.ts` to `apps/tui/src/lib/diff-types.ts`.
*   **Action**: Copy `specs/tui/apps/tui/src/lib/diff-parse.ts` to `apps/tui/src/lib/diff-parse.ts`.
*   **Action**: Update `apps/tui/src/lib/index.ts` to export these new files.
*   **Verification**: Run `bun typecheck` to ensure the types and parsing logic compile correctly within the main project context and dependencies like `diff` resolve properly.

### Step 1.2: Implement Layout Computation Utilities
Create pure functions to handle responsive pane width calculations based on terminal dimensions and sidebar state.

*   **File**: `apps/tui/src/components/diff/diff-layout.ts`
*   **Implementation**:
    *   Define `SPLIT_VIEW_MIN_CONTENT_COLS = 100`.
    *   Implement `isSplitViewAvailable(terminalCols, sidebarVisible, sidebarWidthPercent)`.
    *   Implement `computePaneLayout(contentCols, breakpoint)` returning `{ paneWidth, gutterWidth, contentWidth }`.
    *   Implement `getContentAreaCols(terminalCols, sidebarVisible, sidebarWidthPercent)`.
    *   Export `VERTICAL_SEPARATOR = "│"`.

### Step 1.3: Implement Scroll Synchronization Controller
Create a React Context provider to manage synchronized scrolling between the left and right diff panes.

*   **File**: `apps/tui/src/components/diff/DiffSyncController.tsx`
*   **Implementation**:
    *   Define `ScrollSyncState` interface.
    *   Create `ScrollSyncContext` and export `useScrollSync` hook.
    *   Implement `DiffSyncController` component using `useState` for `offset`.
    *   Provide methods: `scrollBy`, `scrollTo`, `scrollToTop`, `scrollToBottom`, `pageDown`, `pageUp` ensuring the offset is safely clamped between `0` and `totalLines - 1`.

## Phase 2: Pane & Line Components

### Step 2.1: Implement Diff Hunk Header Row
Create a component to render hunk headers that span the full width of both panes.

*   **File**: `apps/tui/src/components/diff/DiffHunkHeaderRow.tsx`
*   **Implementation**:
    *   Accept props: `hunk`, `isCollapsed`, `hunkHeaderColor`, `mutedColor`, `totalWidth`.
    *   If `isCollapsed`, render the summary text bordered by dashes using `getCollapsedSummaryText()`.
    *   If expanded, render the header text (and `scopeName`) in cyan.

### Step 2.2: Implement Single Diff Line Component
Create the lowest-level component representing a single line in a diff pane, handling syntax highlighting and filler lines.

*   **File**: `apps/tui/src/components/diff/DiffSplitLine.tsx`
*   **Implementation**:
    *   Render an OpenTUI `<box flexDirection="row">`.
    *   Handle `type === "filler"` by rendering an empty row with a muted background.
    *   Render the line number gutter (or spaces if `lineNumber` is null).
    *   Conditionally render OpenTUI `<code>` for syntax highlighting (if `syntaxStyle` and `filetype` are provided) or fallback to `<text>`.
    *   Apply background and foreground colors from the `theme` based on `line.type` (`"add"` vs `"remove"`).
    *   Implement whitespace visualization toggle logic (replacing spaces with `·` and tabs with `→   `).

### Step 2.3: Implement Single Diff Pane Component
Create the component that renders an entire column (old or new side) using a viewport slicing strategy for performance.

*   **File**: `apps/tui/src/components/diff/DiffPane.tsx`
*   **Implementation**:
    *   Consume `offset` from `useScrollSync()`.
    *   Memoize a flattened array of visible `DiffLine` objects from the parsed hunks and collapse state.
    *   Slice the flattened array using `[offset, offset + viewportHeight]` to render only visible lines.
    *   Render an OpenTUI `<box flexDirection="column">` containing mapped `DiffSplitLine` components.

## Phase 3: Orchestration & Integration

### Step 3.1: Implement Top-Level Split View Component
Assemble the panes, scroll controller, and keybindings into the primary split view component.

*   **File**: `apps/tui/src/components/diff/DiffSplitView.tsx`
*   **Implementation**:
    *   Use `useLayout()` to calculate dimensions and pane layout via `diff-layout.ts` utilities.
    *   Wrap inner content in `DiffSyncController`.
    *   Create `DiffSplitViewInner` to access the `useScrollSync` context.
    *   Register screen keybindings (`j`, `k`, `ctrl+d`, `ctrl+u`, `G`, `x`, `z`) using `useScreenKeybindings` mapped to `scrollSync` actions and expand/collapse callbacks.
    *   Render an OpenTUI `<scrollbox scrollY viewportCulling>`.
    *   Map over `parsedDiff.hunks`. For each hunk, render `<DiffHunkHeaderRow>`.
    *   If the hunk is not collapsed, render `<box flexDirection="row">` containing the left `<DiffPane>`, the `VERTICAL_SEPARATOR`, and the right `<DiffPane>`.

### Step 3.2: Update the DiffViewer to Support Mode Toggling
Modify the parent orchestrator to manage state between `unified` and `split` views and enforce terminal width constraints.

*   **File**: `apps/tui/src/components/diff/DiffViewer.tsx`
*   **Implementation**:
    *   Add `mode` state (`"unified" | "split"`).
    *   Implement width gate: block split view if `isSplitViewAvailable` is false, showing a temporary warning toast.
    *   Add `useEffect` to auto-downgrade to `"unified"` if terminal resizes below the threshold while in split mode.
    *   Update keybindings to include `t` (toggle mode), `w` (toggle whitespace), `]`, `[`, `x`, and `z`.
    *   Conditionally render `<DiffSplitView>` or `<DiffUnifiedView>` based on mode state.

### Step 3.3: Update Barrel Export
Export all new components and types.

*   **File**: `apps/tui/src/components/diff/index.ts`
*   **Implementation**: Add exports for `DiffSplitView`, `DiffPane`, `DiffSplitLine`, `DiffHunkHeaderRow`, `DiffSyncController`, and layout utilities.

## Phase 4: Testing & Verification

### Step 4.1: Implement E2E Tests
Append comprehensive UI and interaction tests to the existing E2E test suite.

*   **File**: `e2e/tui/diff.test.ts`
*   **Implementation**: Append the test blocks specified in the engineering doc, including:
    *   Mode toggle (`t`) behavior.
    *   Rendering verifications (snapshot matching for colors, line numbers, alignment, headers).
    *   Scroll synchronization (`j`/`k`).
    *   File navigation (`]`/`[`).
    *   Expand/collapse logic (`x`/`z`).
    *   Whitespace toggle (`w`).
    *   Minimum width gate checks (resizing to 80x24).
    *   Sidebar toggle interactions (`ctrl+b`).
    *   Responsive snapshots (`120x40`, `200x60`, `160x40`).

### Step 4.2: Final Verification
*   Run `bun run test:e2e` to verify all snapshots and interactions.
*   Run TUI manually (`codeplane tui`) to perform experiential performance checking (ensure < 50ms render lag during scrolling).
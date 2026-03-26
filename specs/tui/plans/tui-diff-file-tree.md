# Implementation Plan: TUI_DIFF_FILE_TREE

## Overview

This document outlines the step-by-step implementation for the Diff File Tree sidebar in the Codeplane TUI. The feature replaces the `DiffFileTreePlaceholder` with an interactive, searchable, and navigable file inventory for diffs, built with React 19 and OpenTUI primitives.

All source code targets `apps/tui/src/` and tests target `e2e/tui/`.

---

## Step 1: Type Definitions and Pure Utilities

**Goal:** Establish the data model and pure processing functions without React dependencies.

**Files to Create:**
- `apps/tui/src/screens/DiffScreen/file-tree-types.ts`
- `apps/tui/src/screens/DiffScreen/file-tree-utils.ts`

**Actions:**
1. Define `ChangeTypeDisplay`, `FileTreeEntry`, `FileTreeSummary`, and `FileTreeState` interfaces in `file-tree-types.ts`.
2. Export constants `FILE_CAP = 500` and `SEARCH_MAX_LENGTH = 128`.
3. Implement pure utilities in `file-tree-utils.ts`:
   - `resolveChangeTypeDisplay` (maps `change_type` to ANSI colors/icons).
   - `truncatePathLeft` and `formatRenamePath`.
   - `formatStat`, `formatStatCompact`, and `isPermissionOnlyChange`.
   - `processFileEntries` (processes `FileDiffItem[]` from `@codeplane/ui-core` into `FileTreeEntry[]` with cap limits).
   - `filterEntries` (case-insensitive substring search).
   - `computeSummary`, `formatSummaryLine`, and `formatFilePosition`.
4. Ensure no side effects in these utilities to facilitate easy unit testing.

---

## Step 2: Modify Shared Layout Hooks

**Goal:** Update global layout hooks to support explicit sidebar toggling at the minimum breakpoint (80x24) while preserving defaults.

**Files to Modify:**
- `apps/tui/src/hooks/useSidebarState.ts`
- `apps/tui/src/hooks/useLayout.ts`

**Actions:**
1. **`useSidebarState.ts`**: Update `resolveSidebarVisibility` to allow `userPreference === true` to override visibility at the `minimum` breakpoint instead of always force-hiding. Adjust the `toggle` callback to not block toggles at minimum.
2. **`useLayout.ts`**: Update `getSidebarWidth` to return `"30%"` when `breakpoint === "minimum"` and the sidebar is explicitly toggled to visible (falling back to `"0%"` if hidden).
3. Ensure existing screens degrade gracefully, showing empty sidebars if toggled at minimum.

---

## Step 3: State Management Hook

**Goal:** Encapsulate file tree state (cursor, search, scrolling) into a unified hook to be hoisted to `DiffScreen`.

**Files to Create:**
- `apps/tui/src/screens/DiffScreen/useFileTreeState.ts`

**Actions:**
1. Create the `useFileTreeState` hook to manage `focusedIndex`, `searchActive`, `searchQuery`, and `scrollOffset`.
2. Wire up `processFileEntries`, `filterEntries`, and `computeSummary` via `useMemo`.
3. Implement navigational functional state updaters: `moveDown`, `moveUp`, `jumpToEnd`, `jumpToStart`, `pageDown`, `pageUp`.
4. Implement search actions: `activateSearch`, `clearSearch`, `setSearchQuery` (with `SEARCH_MAX_LENGTH` clamp).
5. Implement synchronization functions: `selectCurrent` and `syncToOriginalIndex`.
6. Add `logger.warn` via `apps/tui/src/lib/logger.ts` for truncated file lists and unknown change types.

---

## Step 4: UI Components (Entry, Summary, Search)

**Goal:** Build the individual visual components using OpenTUI primitives (`<box>`, `<text>`, `<input>`).

**Files to Create:**
- `apps/tui/src/screens/DiffScreen/DiffFileTreeEntry.tsx`
- `apps/tui/src/screens/DiffScreen/DiffFileTreeSummary.tsx`
- `apps/tui/src/screens/DiffScreen/DiffFileTreeSearch.tsx`

**Actions:**
1. **`DiffFileTreeEntry.tsx`**: Render a single row `<box>` with flex segments for the icon, display path, optional `[bin]`/`[mode]` suffix, and `+N -M` stat. Support reverse-video (`theme.primary`) styling when focused.
2. **`DiffFileTreeSummary.tsx`**: Render a single line `<box>` with `<text>` utilizing `formatSummaryLine`.
3. **`DiffFileTreeSearch.tsx`**: Render an inline OpenTUI `<input>` for the `/` search command, displaying the match count on the right.

---

## Step 5: Main DiffFileTree Component

**Goal:** Compose the entry, summary, and search components into the scrollable sidebar.

**Files to Create:**
- `apps/tui/src/screens/DiffScreen/DiffFileTree.tsx`

**Actions:**
1. Create the main `<box flexDirection="column">` tree component.
2. Leverage OpenTUI's `<scrollbox>` for the file entries.
3. Implement viewport windowing by slicing `treeState.filteredEntries` using `scrollOffset` and the computed `viewportHeight` from `useLayout`.
4. Render the `DiffFileTreeSummary`, optional `DiffFileTreeSearch`, and the list of `DiffFileTreeEntry` components.
5. Render fallback states: `(No files changed)` for empty diffs, `No matches` for empty searches, and a truncation indicator if `treeState.isTruncated` is true.
6. Hook up `useEffect` to watch `syncedOriginalIndex` and call `treeState.syncToOriginalIndex`.

---

## Step 6: Keybinding Registration and Integration

**Goal:** Wire the tree to the `DiffScreen` scaffold and register contextual keybindings.

**Files to Create:**
- `apps/tui/src/screens/DiffScreen/useFileTreeKeybindings.ts`

**Files to Modify:**
- `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`

**Actions:**
1. **Keybindings**: Implement `buildFileTreeKeybindings` yielding handlers for `j`, `k`, `G`, `ctrl+d`, `ctrl+u`, `return`, `/`, and `escape` mapped to `treeState` actions. Use the predicate `when: () => focusZone === "tree" && !searchActive`.
2. **Integration (`DiffScreen.tsx`)**:
   - Replace `DiffFileTreePlaceholder` with `<ErrorBoundary><DiffFileTree /></ErrorBoundary>`.
   - Hoist `useFileTreeState` into the screen component.
   - Modify scaffold `]` and `[` keybindings to update a `syncedOriginalIndex` state variable to drive tree sync.
   - Merge scaffold and tree keybindings into `useScreenKeybindings`.
   - Update status bar hints depending on `focusZone === "tree"` or `"content"`.
   - Compute minimum 24-col visibility thresholds for the sidebar to force-hide on exceptionally narrow resizes.
   - Incorporate `emit` calls to `apps/tui/src/lib/telemetry.ts` for navigation and toggle events.

---

## Step 7: E2E Tests

**Goal:** Validate tree behavior using `@microsoft/tui-test` snapshots and input simulation.

**Files to Modify:**
- `e2e/tui/diff.test.ts`

**Actions:**
1. Append the new 74 test cases specified in the engineering document directly into `e2e/tui/diff.test.ts` after the `TUI_DIFF_SYNTAX_HIGHLIGHT` suites.
2. **Snapshot Tests (`SNAP-FTREE-001` - `018`)**: Verify visual rendering of sidebars across standard (120x40), large (200x60), and minimum (80x24) breakpoints. Verify truncated paths, search UI, focus reverse-video, and truncation indicators.
3. **Keyboard Interaction (`KEY-FTREE-001` - `032`)**: Use `await terminal.sendKeys(...)` to assert `j/k` bounds, `Enter` selection behavior, search `/` activation and escape routines, and `]/[` content syncs.
4. **Responsive Layout (`RSP-FTREE-001` - `012`)**: Validate `terminal.resize(w, h)` auto-hide and auto-show semantics, as well as state persistence across resize boundaries.
5. **Integration (`INT-FTREE-001` - `012`)**: Validate realistic data scenarios against existing `/api/...` diff fixtures, ensuring failures (like 401s or 500s) gracefully display existing UI error boundaries.
6. Do not skip or comment out failing API tests; they serve as implementation tracking.

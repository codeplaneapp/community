# Implementation Plan: TUI_DIFF_UNIFIED_VIEW

## 1. Overview
This implementation plan outlines the steps to build the `UnifiedDiffViewer` for the Codeplane TUI. This component provides the default single-column interleaved diff rendering in the `DiffScreen`. The implementation strictly targets `apps/tui/src/` and utilizes OpenTUI components (`<diff>`, `<scrollbox>`, `<box>`, `<text>`) and `@codeplane/ui-core` hooks.

## 2. Prerequisites
The following dependencies from earlier tickets must be present:
- **`tui-diff-parse-utils`**: `apps/tui/src/lib/diff-parse.ts`, `apps/tui/src/lib/diff-types.ts`
- **`tui-diff-screen-scaffold`**: `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`
- **`tui-diff-syntax-style`**: `apps/tui/src/hooks/useDiffSyntaxStyle.ts`, `apps/tui/src/lib/diff-syntax.ts`
- `@codeplane/ui-core` types: `packages/ui-core/src/types/diff.ts`

## 3. Implementation Steps

### Step 1: Define Constants and Types
- **Create `apps/tui/src/screens/DiffScreen/diff-constants.ts`**:
  Define `GUTTER_WIDTH`, `DIFF_COLORS` (using hex codes expected by OpenTUI), `CHANGE_TYPE_DISPLAY`, `TRUNCATION`, `HALF_PAGE_FRACTION`, and `CONTEXT_LINES`.
- **Update `apps/tui/src/screens/DiffScreen/types.ts`**:
  Export interfaces: `ScrollHandle`, `UnifiedDiffViewerProps`, `FileHeaderProps`, and `HunkHeaderProps`.

### Step 2: Implement State and Navigation Hooks
- **Create `apps/tui/src/screens/DiffScreen/useFileNavigation.ts`**:
  Implement `useFileNavigation` to manage the file index (`]`/`[` wrap-around navigation).
- **Create `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts`**:
  Implement `useHunkCollapse` using a `Map` to track per-file hunk collapse state. Provide actions `toggleHunk`, `collapseAll`, `expandAll`, and `reset` (called on file navigation).
- **Create `apps/tui/src/screens/DiffScreen/useDiffScroll.ts`**:
  Implement `useDiffScroll` to manage scroll state. Wrap OpenTUI's `ScrollBoxRenderable` via `ScrollHandle` to provide imperative scrolling (`scrollDown`, `scrollUp`, `pageDown`, `pageUp`, `jumpToTop`, `jumpToBottom`).

### Step 3: Implement Diff Sub-Components
- **Create `apps/tui/src/screens/DiffScreen/DiffEmptyState.tsx`**:
  Render centered `<text color={theme.muted}>` for `empty`, `binary`, and `no-whitespace` states.
- **Create `apps/tui/src/screens/DiffScreen/DiffFileHeader.tsx`**:
  Implement file header with change type icon (colored via `useTheme()`), left-truncated file path (`…/`), and `+N -M` summary.
- **Create `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx`**:
  Implement hunk header with cyan `@@` markers, `▼`/`▶` expand indicators, and responsive scope name truncation.

### Step 4: Implement UnifiedDiffViewer Component
- **Create `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx`**:
  - Render `DiffFileHeader`.
  - Handle edge cases: binary files and empty diffs using `DiffEmptyState`.
  - Wrap content in an OpenTUI `<scrollbox flexGrow={1} scrollY={true} viewportCulling={true}>`.
  - Iterate over `parsedDiff.hunks`. For collapsed hunks, render a summary `<text>`. For expanded hunks, render the OpenTUI `<diff view="unified">` component.
  - Dynamically set `wrapMode` to `"word"` at minimum breakpoint, and `"none"` otherwise. Apply `filetype` and `syntaxStyle` for highlighting.

### Step 5: Integrate into DiffScreen Scaffold
- **Modify `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`**:
  - Replace `<DiffContentPlaceholder>` with `<UnifiedDiffViewer>`.
  - Initialize the new hooks (`useFileNavigation`, `useHunkCollapse`, `useDiffScroll`).
  - Resolve filetypes and manage `SyntaxStyle` lifecycle using `useDiffSyntaxStyle`.
  - Set up `useEffect` blocks to reset scroll/collapse state on file change.
  - Add telemetry/logging: Replace `import { log }` with `import { logger as log }` from `../../lib/logger.js`, and `import { trackEvent }` with `import { emit as trackEvent }` from `../../lib/telemetry.js`.

### Step 6: Wire Keybindings and Status Bar
- **Update Keybindings in `DiffScreen.tsx`**:
  Extend `buildDiffKeybindings` to include all 20+ diff-related keys (`j`, `k`, `]`, `[`, `t`, `w`, `l`, `z`, `x`, `return`, `ctrl+d`, `ctrl+u`, `G`). Provide specific `g g` handling by coordinating with the `goToBindings` scope.
- **Update Status Bar Hints**:
  Bind status bar hints based on state (`ws:on/off`, `ln:on/off`, `File N/M`) and responsive breakpoint layout logic.

### Step 7: E2E Tests
- **Create/Update `e2e/tui/diff.test.ts`**:
  - Implement tests using `@microsoft/tui-test`.
  - **Snapshot Tests:** Cover layouts at 80x24, 120x40, and 200x60. Test empty states, binary placeholders, hunk collapse states, and line number visibility.
  - **Interaction Tests:** Simulate `sendKeys("j")`, `sendKeys("]")`, etc. Assert UI changes using `tui.waitForText()` and snapshots.
  - **Responsive Tests:** Ensure scroll position and state are maintained across `tui.resize(cols, rows)`.
  - *Constraint Checklist:* Leave any failing tests (due to unimplemented backend APIs) as failing. Do not skip or comment them out.

## 4. Productionizing POC Code
If any POC code from `poc/tui-diff-*` is utilized:
- Replace `console.log` with `log.debug`/`log.warn` using the standard `logger` module.
- Swap hardcoded ANSI colors with `useTheme()` tokens and `DIFF_COLORS`.
- Manage `SyntaxStyle` cleanup tightly on unmount to avoid memory leaks.
- Ensure all key handling flows through the `useScreenKeybindings` provider stack rather than local OpenTUI hooks.
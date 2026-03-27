# Implementation Plan: TUI_DIFF_EXPAND_COLLAPSE

This implementation plan details the steps required to implement the hunk expand/collapse feature in the Codeplane TUI, as defined in the `tui-diff-expand-collapse` engineering specification.

## Prerequisites
Ensure that the parent ticket `tui-diff-unified-view` and `tui-diff-parse-utils` are implemented or use this plan to create the necessary files and stubs.

## Step 1: Constants and Types Updates

**1.1 Update `apps/tui/src/screens/DiffScreen/diff-constants.ts`**
Append the following constants:
```typescript
/** Height of a collapsed hunk summary: dashed border (1) + summary text (1) + dashed border (1) */
export const COLLAPSED_SUMMARY_HEIGHT = 3;

/** Unicode dashed border character for collapsed hunk boundaries */
export const DASHED_BORDER_CHAR = "╌";

/** ASCII fallback for terminals that don't support box-drawing characters */
export const DASHED_BORDER_FALLBACK = "-";

/** Column width threshold for abbreviated vs full summary format */
export const SUMMARY_WIDTH_THRESHOLD = 120;

/** Throttle interval for focused hunk index logging (ms) */
export const FOCUSED_HUNK_LOG_THROTTLE_MS = 1000;

/** Line count threshold for "large hunk" warning log */
export const LARGE_HUNK_LINE_THRESHOLD = 500;
```

**1.2 Update `apps/tui/src/screens/DiffScreen/types.ts`**
Add the new types for the global collapse state, focused hunk info, and component props:
```typescript
import type { ParsedHunk } from "../../lib/diff-types.js";
import type { Breakpoint } from "../../types/breakpoint.js";

export interface HunkCollapseGlobalState {
  collapsed: Map<string, Map<number, boolean>>;
  toggleHunk: (filePath: string, hunkIndex: number) => void;
  collapseHunk: (filePath: string, hunkIndex: number) => void;
  expandHunk: (filePath: string, hunkIndex: number) => void;
  collapseAllInFile: (filePath: string, hunkCount: number) => void;
  expandAllInFile: (filePath: string) => void;
  expandAll: () => void;
  isCollapsed: (filePath: string, hunkIndex: number) => boolean;
  getFileCollapseMap: (filePath: string) => Map<number, boolean>;
  collapsedCountInFile: (filePath: string) => number;
  totalCollapsedCount: () => number;
  reset: () => void;
}

export interface CollapsedHunkSummaryProps {
  hunk: ParsedHunk;
  terminalWidth: number;
  breakpoint: Breakpoint | null;
  contentWidth: number;
  onExpand: () => void;
}

export interface FocusedHunkInfo {
  hunkIndex: number;
  filePath: string;
  onCollapsedSummary: boolean;
}
```

## Step 2: Telemetry Integration

**Create `apps/tui/src/screens/DiffScreen/collapse-telemetry.ts`**
Create the telemetry stubs/emitters for collapse actions:
```typescript
import { emit } from "../../lib/telemetry.js";

interface CollapseEventContext {
  repo: string;
  changeId?: string;
  landingNumber?: number;
  source: "change" | "landing";
  viewMode: "unified" | "split";
  sessionId: string;
  terminalWidth: number;
  terminalHeight: number;
}

export function emitCollapseSingle(ctx: CollapseEventContext, file: string, hunkIndex: number, hunkLineCount: number, totalHunksInFile: number, collapsedHunksAfter: number): void {
  emit("tui.diff.hunk.collapse_single", { ...ctx, file, hunkIndex, hunkLineCount, totalHunksInFile, collapsedHunksAfter });
}

export function emitExpandSingle(ctx: CollapseEventContext, file: string, hunkIndex: number, hunkLineCount: number, method: "z" | "enter", collapsedHunksAfter: number): void {
  emit("tui.diff.hunk.expand_single", { ...ctx, file, hunkIndex, hunkLineCount, method, collapsedHunksAfter });
}

export function emitCollapseAllFile(ctx: CollapseEventContext, file: string, hunkCount: number): void {
  emit("tui.diff.hunk.collapse_all_file", { ...ctx, file, hunkCount });
}

export function emitExpandAllFile(ctx: CollapseEventContext, file: string, hunkCount: number, previouslyCollapsedCount: number): void {
  emit("tui.diff.hunk.expand_all_file", { ...ctx, file, hunkCount, previouslyCollapsedCount });
}

export function emitExpandAllGlobal(ctx: CollapseEventContext, fileCount: number, totalHunkCount: number, previouslyCollapsedCount: number): void {
  emit("tui.diff.hunk.expand_all_global", { ...ctx, fileCount, totalHunkCount, previouslyCollapsedCount });
}

export function emitCollapseStateReset(ctx: CollapseEventContext, previouslyCollapsedCount: number, trigger: "whitespace_toggle"): void {
  emit("tui.diff.hunk.collapse_state_reset", { ...ctx, previouslyCollapsedCount, trigger });
}
```

## Step 3: Implement Core Hooks

**3.1 Create `apps/tui/src/screens/DiffScreen/useHunkCollapseGlobal.ts`**
Implement the nested `Map` state hook based on the engineering spec. Ensure it uses `useRef` for synchronous reads in handlers and `useState` for re-renders with immutable updates.

**3.2 Create `apps/tui/src/screens/DiffScreen/useFocusedHunk.ts`**
Implement the derivation hook. It should use `getHunkVisualOffsets` and `getFocusedHunkIndex` from `diff-parse.ts`, memoizing outputs appropriately. Include the throttled debug logging logic.

**3.3 Create `apps/tui/src/screens/DiffScreen/useCollapseKeybindings.ts`**
Implement the keybinding hook providing `z`, `Z`, `x`, `X`, and `Enter` key handlers. Gated all handlers with the `canAct()` function which checks focus zone, loading state, and overlay state.

## Step 4: Component Implementation

**4.1 Modify `apps/tui/src/lib/diff-parse.ts`**
Update `getCollapsedSummaryText` to handle singular lines properly, use `newStart`, and use en-dashes:
```typescript
export function getCollapsedSummaryText(hunk: ParsedHunk, terminalWidth: number): string {
  const count = hunk.totalLineCount;
  if (terminalWidth < 120) return `${count} hidden`;
  if (count === 1) return `1 line hidden (line ${hunk.newStart})`;
  const endLine = hunk.newStart + count - 1;
  return `${count} lines hidden (lines ${hunk.newStart}\u2013${endLine})`;
}
```

**4.2 Create `apps/tui/src/screens/DiffScreen/CollapsedHunkSummary.tsx`**
Implement the summary component that determines the terminal capabilities (via `process.env.TERM` and `process.env.LANG`) and renders the dashed border, the primary colored `▶` indicator, and the summary text.

**4.3 Modify `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx`**
Update the component to accept a `collapsed: boolean` prop. Render `▼` if expanded, and `▶` if collapsed using `theme.primary` and `bold` styling.

**4.4 Modify `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx`**
Update the hunk mapping loop. If a hunk is collapsed (checked against `hunkCollapseState`), render `<CollapsedHunkSummary>`. Otherwise, render the `DiffHunkHeader` and `<diff>` component.

## Step 5: Screen and Scroll Integration

**5.1 Modify `apps/tui/src/screens/DiffScreen/useDiffScroll.ts`**
Add `adjustAfterCollapse` and `adjustAfterExpand` inside the hook:
```typescript
const adjustAfterCollapse = useCallback((removedLines: number) => {
  setScrollOffset((prev) => Math.max(0, prev - removedLines));
  handleRef.current?.scrollBy(-removedLines);
}, []);

const adjustAfterExpand = useCallback((addedLines: number) => {
  // Inline expansion handled natively by scrollbox
}, []);
```
Return these new methods from the hook.

**5.2 Modify `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`**
- Replace `useHunkCollapse` with `useHunkCollapseGlobal`.
- Derive the current focused hunk using `useFocusedHunk`.
- Register collapse bindings via `useCollapseKeybindings`.
- Pass bindings to `useScreenKeybindings`, including the conditional status bar hints (`z/x:hunks` vs `z/x`).
- Hook up the whitespace toggle to reset collapse state.
- Pass the file-specific map and `onToggleHunk` actions into `UnifiedDiffViewer`.

## Step 6: End-to-End Tests

**Update `e2e/tui/diff.test.ts`**
Append the 65 tests outlined in the engineering specification under `describe("TUI_DIFF_EXPAND_COLLAPSE ...", ...)` blocks:
1.  **Snapshot Tests (13 tests)**: Covering initial states, collapsed states, responsive sizes, split view, and single-line/large hunks.
2.  **Keyboard Interaction Tests (26 tests)**: Verifying `z`, `Z`, `x`, `X`, `Enter` actions in content mode, edge cases with overlays/loading, state persistence across file/view navigation, and scroll interaction.
3.  **Responsive Behavior Tests (8 tests)**: Verifying text abbreviations and dashed border logic upon terminal resizing.
4.  **Integration Tests (6 tests)**: Ensuring proper boundary detection, state reset on whitespace toggle, and persistence across remount/file switching.
5.  **Edge Case Tests (12 tests)**: Validating 0-hunk files, binary files, jump-to-bottom interactions, and `dumb` terminal fallback.

Run the tests with `bun test e2e/tui/diff.test.ts` to generate initial snapshots and ensure there are no compilation errors.
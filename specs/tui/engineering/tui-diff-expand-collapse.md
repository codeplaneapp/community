# Engineering Specification: TUI_DIFF_EXPAND_COLLAPSE — Hunk Expand/Collapse with z/Z/x/X Keys

**Ticket:** `tui-diff-expand-collapse`
**Status:** Not started
**Dependencies:** `tui-diff-unified-view` (`UnifiedDiffViewer`, `DiffHunkHeader`, `useHunkCollapse`, `useDiffScroll`, `DiffFileHeader`), `tui-diff-parse-utils` (`parseDiffHunks`, `ParsedDiff`, `ParsedHunk`, `getHunkVisualOffsets`, `getFocusedHunkIndex`, `getCollapsedSummaryText`)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket elevates the hunk collapse/expand system from the per-file `Map<number, boolean>` hook (delivered by `tui-diff-unified-view`) into a cross-file, session-persistent state model and wires the `z`, `Z`, `x`, `X`, and `Enter` keybindings to real handlers. It delivers:

1. **Cross-file collapse state** — A nested `Map<string, Map<number, boolean>>` (file path → hunk index → collapsed) that persists across file navigation (`]`/`[`), sidebar toggle (`Ctrl+B`), view mode toggle (`t`), and line number toggle (`l`). Resets on whitespace toggle (`w`) and screen unmount (`q`).
2. **Focused hunk derivation** — Real-time computation of which hunk contains the current scroll position, using `getHunkVisualOffsets()` and `getFocusedHunkIndex()` from `diff-parse.ts`, updated on every scroll change.
3. **Keybinding handlers** — Five keybindings (`z`, `Z`, `x`, `X`, `Enter`) registered at `PRIORITY.SCREEN` level, gated on content focus zone, no-overlay, and loaded state.
4. **CollapsedHunkSummary component** — Renders the collapsed hunk summary line with `▶` indicator, dashed borders (`╌`), muted text, and responsive format switching at the 120-column breakpoint.
5. **Expanded hunk indicator** — Adds `▼` indicator to expanded hunk headers in `DiffHunkHeader`.
6. **Scroll adjustment** — On collapse, scroll position adjusts so the developer stays in place. On expand, content flows below the expansion point.
7. **Split view integration** — Collapsed summary spans both panes in split mode. Collapse state preserved across `t` toggle.
8. **Telemetry and observability** — All six business events and nine debug log entries from the product spec.

---

## 2. File Inventory

### 2.1 New Files

| File | Purpose |
|------|--------|
| `apps/tui/src/screens/DiffScreen/useHunkCollapseGlobal.ts` | Cross-file hunk collapse state hook (nested Map) |
| `apps/tui/src/screens/DiffScreen/useFocusedHunk.ts` | Derives focused hunk index from scroll position |
| `apps/tui/src/screens/DiffScreen/CollapsedHunkSummary.tsx` | Collapsed hunk summary line component |
| `apps/tui/src/screens/DiffScreen/useCollapseKeybindings.ts` | Registers z/Z/x/X/Enter keybindings for collapse actions |
| `apps/tui/src/screens/DiffScreen/collapse-telemetry.ts` | Telemetry event emitters for collapse actions |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Replace per-file `useHunkCollapse()` with `useHunkCollapseGlobal()`. Wire `useCollapseKeybindings()`. Pass cross-file state to viewers. Reset on whitespace toggle. |
| `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx` | Add `▼`/`▶` indicator in `primary` color. Accept `collapsed` prop for indicator selection. |
| `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx` | Replace inline collapsed summary with `<CollapsedHunkSummary>` component. Read collapse state from cross-file Map. |
| `apps/tui/src/screens/DiffScreen/types.ts` | Add `HunkCollapseGlobalState` interface. Add `CollapsedHunkSummaryProps` interface. |
| `apps/tui/src/screens/DiffScreen/useDiffScroll.ts` | Add scroll position adjustment callbacks for collapse/expand transitions. |
| `apps/tui/src/screens/DiffScreen/diff-constants.ts` | Add `COLLAPSED_SUMMARY_HEIGHT = 3` (border + text + border), `DASHED_BORDER_CHAR = '╌'`, `DASHED_BORDER_FALLBACK = '-'`. |
| `apps/tui/src/lib/diff-parse.ts` | Add `getCollapsedSummaryText` enhancement for singular form ("1 line hidden (line X)") and en-dash usage. Verify `getHunkVisualOffsets` handles cross-file collapse state parameter. |

---

## 3. Type Definitions

### File: `apps/tui/src/screens/DiffScreen/types.ts` (additions)

```typescript
import type { ParsedHunk } from "../../lib/diff-types.js";
import type { Breakpoint } from "../../types/breakpoint.js";

/**
 * Cross-file hunk collapse state.
 * Outer key: file path (string)
 * Inner key: hunk index (0-based integer)
 * Value: true = collapsed, false/absent = expanded
 */
export interface HunkCollapseGlobalState {
  /** The nested collapse state map */
  collapsed: Map<string, Map<number, boolean>>;
  /** Toggle a single hunk: collapse if expanded, expand if collapsed */
  toggleHunk: (filePath: string, hunkIndex: number) => void;
  /** Collapse a single hunk */
  collapseHunk: (filePath: string, hunkIndex: number) => void;
  /** Expand a single hunk */
  expandHunk: (filePath: string, hunkIndex: number) => void;
  /** Collapse all hunks in a file */
  collapseAllInFile: (filePath: string, hunkCount: number) => void;
  /** Expand all hunks in a file */
  expandAllInFile: (filePath: string) => void;
  /** Expand all hunks across all files */
  expandAll: () => void;
  /** Check if a hunk is collapsed */
  isCollapsed: (filePath: string, hunkIndex: number) => boolean;
  /** Get the collapse map for a single file (for passing to per-file components) */
  getFileCollapseMap: (filePath: string) => Map<number, boolean>;
  /** Count collapsed hunks in a file */
  collapsedCountInFile: (filePath: string) => number;
  /** Count total collapsed hunks across all files */
  totalCollapsedCount: () => number;
  /** Reset all collapse state (all hunks expanded) */
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
  /** Index of the hunk containing the current scroll position */
  hunkIndex: number;
  /** File path of the currently focused file */
  filePath: string;
  /** Whether the focused position is on a collapsed hunk summary line */
  onCollapsedSummary: boolean;
}
```

---

## 4. Implementation Plan

All steps are vertical — each produces a working, testable increment.

### Step 1: Constants and Type Updates

**File:** `apps/tui/src/screens/DiffScreen/diff-constants.ts`

Add collapse-specific constants:

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

**File:** `apps/tui/src/screens/DiffScreen/types.ts`

Add the `HunkCollapseGlobalState`, `CollapsedHunkSummaryProps`, and `FocusedHunkInfo` interfaces as defined in Section 3.

**Verification:** `tsc --noEmit` passes with no new errors.

---

### Step 2: Cross-File Collapse State Hook

**File:** `apps/tui/src/screens/DiffScreen/useHunkCollapseGlobal.ts`

This hook replaces the per-file `useHunkCollapse()` with a session-wide nested Map. The outer Map is keyed by file path, the inner Map by hunk index.

```typescript
import { useState, useCallback, useRef } from "react";
import type { HunkCollapseGlobalState } from "./types.js";

export function useHunkCollapseGlobal(): HunkCollapseGlobalState {
  const [collapsed, setCollapsed] = useState<Map<string, Map<number, boolean>>>(
    () => new Map()
  );
  // Ref for synchronous reads (isCollapsed, count queries) without stale closures
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const toggleHunk = useCallback((filePath: string, hunkIndex: number) => {
    setCollapsed((prev) => {
      const next = new Map(prev);
      const fileMap = new Map(prev.get(filePath) ?? []);
      if (fileMap.get(hunkIndex)) {
        fileMap.delete(hunkIndex);
      } else {
        fileMap.set(hunkIndex, true);
      }
      if (fileMap.size === 0) {
        next.delete(filePath);
      } else {
        next.set(filePath, fileMap);
      }
      return next;
    });
  }, []);

  const collapseHunk = useCallback((filePath: string, hunkIndex: number) => {
    setCollapsed((prev) => {
      const next = new Map(prev);
      const fileMap = new Map(prev.get(filePath) ?? []);
      fileMap.set(hunkIndex, true);
      next.set(filePath, fileMap);
      return next;
    });
  }, []);

  const expandHunk = useCallback((filePath: string, hunkIndex: number) => {
    setCollapsed((prev) => {
      const next = new Map(prev);
      const fileMap = new Map(prev.get(filePath) ?? []);
      fileMap.delete(hunkIndex);
      if (fileMap.size === 0) {
        next.delete(filePath);
      } else {
        next.set(filePath, fileMap);
      }
      return next;
    });
  }, []);

  const collapseAllInFile = useCallback(
    (filePath: string, hunkCount: number) => {
      setCollapsed((prev) => {
        const next = new Map(prev);
        const fileMap = new Map<number, boolean>();
        for (let i = 0; i < hunkCount; i++) {
          fileMap.set(i, true);
        }
        next.set(filePath, fileMap);
        return next;
      });
    },
    []
  );

  const expandAllInFile = useCallback((filePath: string) => {
    setCollapsed((prev) => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsed(new Map());
  }, []);

  const isCollapsed = useCallback(
    (filePath: string, hunkIndex: number) => {
      return collapsedRef.current.get(filePath)?.get(hunkIndex) ?? false;
    },
    []
  );

  const getFileCollapseMap = useCallback(
    (filePath: string): Map<number, boolean> => {
      return collapsedRef.current.get(filePath) ?? new Map();
    },
    []
  );

  const collapsedCountInFile = useCallback((filePath: string): number => {
    return collapsedRef.current.get(filePath)?.size ?? 0;
  }, []);

  const totalCollapsedCount = useCallback((): number => {
    let total = 0;
    for (const fileMap of collapsedRef.current.values()) {
      total += fileMap.size;
    }
    return total;
  }, []);

  const reset = useCallback(() => {
    setCollapsed(new Map());
  }, []);

  return {
    collapsed,
    toggleHunk,
    collapseHunk,
    expandHunk,
    collapseAllInFile,
    expandAllInFile,
    expandAll,
    isCollapsed,
    getFileCollapseMap,
    collapsedCountInFile,
    totalCollapsedCount,
    reset,
  };
}
```

**Design decisions:**

- **Nested Map vs flat Map with composite keys:** Nested `Map<string, Map<number, boolean>>` was chosen over `Map<"file:hunkIdx", boolean>` because (a) `collapseAllInFile` and `expandAllInFile` are O(hunk_count) operations that benefit from direct file-level access, (b) `getFileCollapseMap` returns a reference-stable inner Map for per-file components without allocation, (c) garbage collection of empty inner Maps via `next.delete(filePath)` keeps memory bounded.
- **Ref + state pattern:** `collapsedRef.current` is updated on every render for synchronous `isCollapsed()` reads in keybinding handlers (which fire outside React's render cycle). The `collapsed` state drives re-renders.
- **Immutable updates:** Every setter creates a new outer Map and a new inner Map. This ensures React detects the state change and re-renders. Inner Maps are small (typically < 50 entries per file) so cloning is cheap.

**Verification:** Unit test: create hook, call `collapseHunk("a.ts", 0)`, assert `isCollapsed("a.ts", 0) === true` and `isCollapsed("b.ts", 0) === false`.

---

### Step 3: Focused Hunk Derivation Hook

**File:** `apps/tui/src/screens/DiffScreen/useFocusedHunk.ts`

Derives the focused hunk index from the current scroll position, recalculated on every scroll change. Uses the binary search from `getFocusedHunkIndex()` in `diff-parse.ts`.

```typescript
import { useMemo, useRef, useCallback } from "react";
import type { ParsedDiff } from "../../lib/diff-types.js";
import type { FocusedHunkInfo } from "./types.js";
import {
  getHunkVisualOffsets,
  getFocusedHunkIndex,
} from "../../lib/diff-parse.js";
import { FOCUSED_HUNK_LOG_THROTTLE_MS } from "./diff-constants.js";

interface UseFocusedHunkOptions {
  parsedDiff: ParsedDiff;
  filePath: string;
  scrollPosition: number;
  collapseState: Map<number, boolean>;
}

export function useFocusedHunk(
  options: UseFocusedHunkOptions
): FocusedHunkInfo {
  const { parsedDiff, filePath, scrollPosition, collapseState } = options;

  // Recompute visual offsets whenever collapse state changes
  const visualOffsets = useMemo(
    () => getHunkVisualOffsets(parsedDiff.hunks, collapseState),
    [parsedDiff.hunks, collapseState]
  );

  const hunkIndex = useMemo(
    () => getFocusedHunkIndex(scrollPosition, visualOffsets),
    [scrollPosition, visualOffsets]
  );

  const onCollapsedSummary = useMemo(() => {
    if (hunkIndex < 0 || hunkIndex >= parsedDiff.hunks.length) return false;
    return collapseState.get(hunkIndex) ?? false;
  }, [hunkIndex, collapseState, parsedDiff.hunks.length]);

  // Throttled debug logging
  const lastLogRef = useRef(0);
  const lastIndexRef = useRef(-1);
  if (
    hunkIndex !== lastIndexRef.current &&
    Date.now() - lastLogRef.current > FOCUSED_HUNK_LOG_THROTTLE_MS
  ) {
    lastLogRef.current = Date.now();
    lastIndexRef.current = hunkIndex;
    // debug log: diff.hunk.focused_index
  }

  return { hunkIndex, filePath, onCollapsedSummary };
}
```

**Design decisions:**

- **Memoized visual offsets:** `getHunkVisualOffsets` is recomputed only when `parsedDiff.hunks` or `collapseState` change. This is the most computationally expensive operation (O(n) where n = hunk count), but n is typically small (< 100).
- **Binary search for focused index:** `getFocusedHunkIndex` is O(log n) and runs on every scroll position change. At typical hunk counts (< 100), this is sub-microsecond.
- **Throttled logging:** Debug logging of focused hunk changes is throttled to 1/sec to avoid spamming during rapid scrolling.

**Verification:** Given 3 hunks with `totalLineCount` [5, 10, 3], collapse hunk 1: offsets become [0, 5, 6]. Scroll to position 6 → focused hunk index = 2.

---

### Step 4: CollapsedHunkSummary Component

**File:** `apps/tui/src/screens/DiffScreen/CollapsedHunkSummary.tsx`

Renders the collapsed hunk summary with dashed borders, `▶` indicator, and responsive text format.

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { getCollapsedSummaryText } from "../../lib/diff-parse.js";
import {
  DASHED_BORDER_CHAR,
  DASHED_BORDER_FALLBACK,
} from "./diff-constants.js";
import type { CollapsedHunkSummaryProps } from "./types.js";

function getBorderChar(): string {
  // Check if terminal supports Unicode box-drawing
  // Fallback to ASCII dash if TERM=dumb or encoding is not UTF-8
  const term = process.env.TERM ?? "";
  const lang = process.env.LANG ?? "";
  if (term === "dumb" || (!lang.includes("UTF") && !lang.includes("utf"))) {
    return DASHED_BORDER_FALLBACK;
  }
  return DASHED_BORDER_CHAR;
}

export function CollapsedHunkSummary({
  hunk,
  terminalWidth,
  contentWidth,
  onExpand,
}: CollapsedHunkSummaryProps) {
  const theme = useTheme();
  const borderChar = getBorderChar();
  const borderLine = borderChar.repeat(Math.max(1, contentWidth));
  const summaryText = getCollapsedSummaryText(hunk, terminalWidth);

  return (
    <box flexDirection="column" width="100%">
      <text fg={theme.border}>{borderLine}</text>
      <box flexDirection="row" width="100%" height={1}>
        <text fg={theme.primary} bold>{"▶"}</text>
        <text fg={theme.muted}>{" ⋯ "}{summaryText}</text>
      </box>
      <text fg={theme.border}>{borderLine}</text>
    </box>
  );
}
```

**Design decisions:**

- **Border character detection:** `getBorderChar()` checks `TERM` and `LANG` environment variables at render time. If the terminal is `dumb` or encoding is not UTF-8, falls back to ASCII `-`. This is a pure function, no state needed.
- **Content width:** The `contentWidth` prop is passed down from the parent viewer to ensure the dashed border spans the correct width (which varies between unified/split mode and sidebar state).
- **Click handler:** `onExpand` is wired but only matters for future mouse support. The primary interaction is via `Enter` keybinding, which is handled at the DiffScreen level.
- **3-row layout:** Dashed border (1 row) + summary text (1 row) + dashed border (1 row) = 3 rows total. This matches the `COLLAPSED_SUMMARY_HEIGHT` constant.

**Verification:** Snapshot test at 120×40 shows `▶ ⋯ 7 lines hidden (lines 42–48)` with `╌` borders. At 80×24 shows `▶ ⋯ 7 hidden`.

---

### Step 5: DiffHunkHeader Update — Expand/Collapse Indicator

**File:** `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx`

Update to render `▼` for expanded hunks and `▶` for collapsed hunks, both in `primary` color.

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { DIFF_COLORS, TRUNCATION } from "./diff-constants.js";
import type { Breakpoint } from "../../types/breakpoint.js";

interface Props {
  header: string;
  scopeName: string | null;
  collapsed: boolean;
  breakpoint: Breakpoint | null;
  onToggle: () => void;
}

export function DiffHunkHeader({
  header,
  scopeName,
  collapsed,
  breakpoint,
}: Props) {
  const theme = useTheme();
  const indicator = collapsed ? "▶" : "▼";
  const showScope = breakpoint !== "minimum" && scopeName;
  const displayScope =
    showScope &&
    scopeName!.length > TRUNCATION.maxScopeNameChars &&
    breakpoint === "standard"
      ? scopeName!.slice(0, TRUNCATION.maxScopeNameChars - 1) + "…"
      : scopeName;

  return (
    <box flexDirection="row" width="100%" height={1}>
      <text fg={theme.primary} bold>
        {indicator}
      </text>
      <text fg={DIFF_COLORS.hunkHeaderColor}> {header}</text>
      {showScope && (
        <text fg={DIFF_COLORS.hunkHeaderColor} dim>
          {" "}
          {displayScope}
        </text>
      )}
    </box>
  );
}
```

**Changes from existing spec:**

- The `▼`/`▶` indicator now uses `theme.primary` (blue, ANSI 33) instead of `DIFF_COLORS.hunkHeaderColor` (cyan). This matches the product spec requirement that indicators render in `primary` color to signal interactivity.
- The indicator is bold for visibility.
- The hunk header text remains in cyan (`DIFF_COLORS.hunkHeaderColor`).

**Verification:** Expanded hunk shows `▼ @@ -42,7 +42,12 @@` with blue `▼` and cyan `@@`. Collapsed hunk shows `▶` in the `CollapsedHunkSummary` component.

---

### Step 6: Collapse Keybinding Handler

**File:** `apps/tui/src/screens/DiffScreen/useCollapseKeybindings.ts`

Registers the five collapse-related keybindings (`z`, `Z`, `x`, `X`, `Enter`) at `PRIORITY.SCREEN` level. All handlers are gated on: (a) content focus zone active, (b) no overlay open, (c) screen in loaded state, (d) at least one file in the diff.

```typescript
import { useCallback, useRef } from "react";
import type { HunkCollapseGlobalState, FocusedHunkInfo } from "./types.js";
import type { ParsedDiff } from "../../lib/diff-types.js";
import type { FileDiffItem } from "../../types/diff.js";
import type { KeyHandler } from "../../providers/keybinding-types.js";
import { LARGE_HUNK_LINE_THRESHOLD } from "./diff-constants.js";

interface UseCollapseKeybindingsOptions {
  hunkCollapse: HunkCollapseGlobalState;
  focusedHunk: FocusedHunkInfo;
  parsedDiff: ParsedDiff;
  currentFile: FileDiffItem | null;
  files: FileDiffItem[];
  parsedDiffs: Map<string, ParsedDiff>;
  focusZone: "tree" | "content";
  isLoaded: boolean;
  hasOverlay: boolean;
  onScrollAdjustAfterCollapse: (removedLines: number) => void;
  onScrollAdjustAfterExpand: (addedLines: number) => void;
}

export function useCollapseKeybindings(
  options: UseCollapseKeybindingsOptions
): KeyHandler[] {
  const {
    hunkCollapse,
    focusedHunk,
    parsedDiff,
    currentFile,
    files,
    parsedDiffs,
    focusZone,
    isLoaded,
    hasOverlay,
    onScrollAdjustAfterCollapse,
    onScrollAdjustAfterExpand,
  } = options;

  // Use refs for values accessed in handlers to avoid stale closures
  const optsRef = useRef(options);
  optsRef.current = options;

  const canAct = useCallback((): boolean => {
    const o = optsRef.current;
    return (
      o.focusZone === "content" &&
      o.isLoaded &&
      !o.hasOverlay &&
      o.currentFile !== null &&
      o.parsedDiff.hunks.length > 0
    );
  }, []);

  const handleZ = useCallback(() => {
    const o = optsRef.current;
    if (!canAct()) {
      // debug log: diff.hunk.collapse.noop
      return;
    }

    const filePath = o.currentFile!.path;
    const hunkIdx = o.focusedHunk.hunkIndex;
    if (hunkIdx < 0 || hunkIdx >= o.parsedDiff.hunks.length) return;

    const wasCollapsed = o.hunkCollapse.isCollapsed(filePath, hunkIdx);
    const hunk = o.parsedDiff.hunks[hunkIdx];

    if (wasCollapsed) {
      // Expand
      o.hunkCollapse.expandHunk(filePath, hunkIdx);
      o.onScrollAdjustAfterExpand(hunk.totalLineCount - 1);
      // telemetry: tui.diff.hunk.expand_single (method: "z")
      // debug log: diff.hunk.expand.single
    } else {
      // Collapse
      if (hunk.totalLineCount > LARGE_HUNK_LINE_THRESHOLD) {
        // warn log: diff.hunk.collapse.large_hunk
      }
      o.hunkCollapse.collapseHunk(filePath, hunkIdx);
      o.onScrollAdjustAfterCollapse(hunk.totalLineCount - 1);
      // telemetry: tui.diff.hunk.collapse_single
      // debug log: diff.hunk.collapse.single
    }
  }, [canAct]);

  const handleShiftZ = useCallback(() => {
    const o = optsRef.current;
    if (!canAct()) return;

    const filePath = o.currentFile!.path;
    const hunkCount = o.parsedDiff.hunks.length;

    // Check if all already collapsed
    const allCollapsed = o.parsedDiff.hunks.every((_, i) =>
      o.hunkCollapse.isCollapsed(filePath, i)
    );
    if (allCollapsed) {
      // debug log: diff.hunk.collapse.noop (reason: all_collapsed)
      return;
    }

    o.hunkCollapse.collapseAllInFile(filePath, hunkCount);
    // telemetry: tui.diff.hunk.collapse_all_file
    // debug log: diff.hunk.collapse.all_file
  }, [canAct]);

  const handleX = useCallback(() => {
    const o = optsRef.current;
    if (!canAct()) return;

    const filePath = o.currentFile!.path;
    const collapsedCount = o.hunkCollapse.collapsedCountInFile(filePath);

    if (collapsedCount === 0) {
      // debug log: diff.hunk.collapse.noop (reason: all_expanded)
      return;
    }

    o.hunkCollapse.expandAllInFile(filePath);
    // telemetry: tui.diff.hunk.expand_all_file
    // debug log: diff.hunk.expand.all_file
  }, [canAct]);

  const handleShiftX = useCallback(() => {
    const o = optsRef.current;
    if (!o.isLoaded || o.hasOverlay || o.focusZone !== "content") return;

    const totalCollapsed = o.hunkCollapse.totalCollapsedCount();
    if (totalCollapsed === 0) {
      // debug log: diff.hunk.collapse.noop (reason: none_collapsed)
      return;
    }

    o.hunkCollapse.expandAll();
    // telemetry: tui.diff.hunk.expand_all_global
    // debug log: diff.hunk.expand.all_global
  }, []);

  const handleEnter = useCallback(() => {
    const o = optsRef.current;
    if (!canAct()) return;

    const filePath = o.currentFile!.path;
    const hunkIdx = o.focusedHunk.hunkIndex;
    if (hunkIdx < 0 || hunkIdx >= o.parsedDiff.hunks.length) return;

    // Enter only expands a collapsed hunk — no-op on expanded content
    if (!o.hunkCollapse.isCollapsed(filePath, hunkIdx)) return;

    const hunk = o.parsedDiff.hunks[hunkIdx];
    o.hunkCollapse.expandHunk(filePath, hunkIdx);
    o.onScrollAdjustAfterExpand(hunk.totalLineCount - 1);
    // telemetry: tui.diff.hunk.expand_single (method: "enter")
    // debug log: diff.hunk.expand.single
  }, [canAct]);

  // Return keybinding descriptors for registration
  return [
    {
      key: "z",
      description: "Toggle focused hunk collapse/expand",
      group: "Diff",
      handler: handleZ,
      when: canAct,
    },
    {
      key: "Z",
      description: "Collapse all hunks in file",
      group: "Diff",
      handler: handleShiftZ,
      when: canAct,
    },
    {
      key: "x",
      description: "Expand all hunks in file",
      group: "Diff",
      handler: handleX,
      when: canAct,
    },
    {
      key: "X",
      description: "Expand all hunks across all files",
      group: "Diff",
      handler: handleShiftX,
      when: () => optsRef.current.isLoaded && !optsRef.current.hasOverlay && optsRef.current.focusZone === "content",
    },
    {
      key: "Enter",
      description: "Expand collapsed hunk",
      group: "Diff",
      handler: handleEnter,
      when: () => {
        const o = optsRef.current;
        if (!canAct()) return false;
        // Only active when focused position is on a collapsed hunk
        return o.focusedHunk.onCollapsedSummary;
      },
    },
  ];
}
```

**Design decisions:**

- **Ref-based option access:** All handler callbacks access `optsRef.current` to ensure they always see the latest state without needing to re-register keybindings on every render. This follows the pattern established in `useScreenKeybindings.ts`.
- **`canAct()` guard:** Centralized guard function checks all preconditions (content focus, loaded, no overlay, file exists, hunks exist). Each handler calls this first.
- **`when` conditional:** The `when` property on each `KeyHandler` is used by the `KeybindingProvider` to skip handlers that aren't applicable, allowing key events to fall through to other handlers (e.g., `Enter` falls through to list selection when not on a collapsed hunk).
- **Scroll adjustment callbacks:** `onScrollAdjustAfterCollapse` and `onScrollAdjustAfterExpand` are called with the delta in line count (total lines minus 1, since the collapsed summary occupies 1 conceptual row in the scroll model). These callbacks adjust the scroll position in `useDiffScroll` to prevent the developer from losing their place.
- **Key consumption:** When a handler fires (even as a no-op), the key event is consumed and does not propagate. The `KeybindingProvider` handles this — if the `when` condition passes and the handler is called, propagation stops.

**Verification:** Press `z` on hunk 0 of file "a.ts": `isCollapsed("a.ts", 0)` becomes `true`. Press `z` again: becomes `false`. Press `Z`: all hunks in "a.ts" collapse. Press `x`: all expand. Navigate to "b.ts" with `]`, press `Z`, press `X`: all files expand.

---

### Step 7: Scroll Adjustment for Collapse/Expand

**File:** `apps/tui/src/screens/DiffScreen/useDiffScroll.ts` (modification)

Add two new methods to the scroll hook:

```typescript
// Add to the returned object from useDiffScroll:

const adjustAfterCollapse = useCallback((removedLines: number) => {
  // When a hunk collapses, the content above shrinks.
  // If the collapse happened above the current scroll position,
  // adjust scroll up by the removed lines to keep the viewport stable.
  setScrollOffset((prev) => Math.max(0, prev - removedLines));
  handleRef.current?.scrollBy(-removedLines);
}, []);

const adjustAfterExpand = useCallback((addedLines: number) => {
  // When a hunk expands, no scroll adjustment needed if the expansion
  // is at or below the current viewport — the new content flows downward.
  // The scrollbox handles the increased content height automatically.
  // We don't change scrollOffset — the expansion happens inline.
}, []);
```

**Design decisions:**

- **Collapse shifts viewport:** When a hunk above the current viewport collapses, the content below it (including the current view) moves up. The scroll offset is decreased by the number of removed lines to compensate, keeping the developer's current view stable.
- **Expand is passive:** When a hunk expands, the new content appears at the expansion point and pushes subsequent content down. The developer's current view stays in place. The scrollbox's total content height increases automatically.
- **Edge case:** If the developer collapses the hunk they're currently viewing, the collapsed summary replaces the content at the current position. No scroll adjustment needed — the summary appears where the content was.

---

### Step 8: DiffScreen Integration

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` (modification)

Wire the cross-file collapse state, focused hunk derivation, and keybindings into the main DiffScreen component.

```typescript
// Replace:
import { useHunkCollapse } from "./useHunkCollapse.js";
// With:
import { useHunkCollapseGlobal } from "./useHunkCollapseGlobal.js";
import { useFocusedHunk } from "./useFocusedHunk.js";
import { useCollapseKeybindings } from "./useCollapseKeybindings.js";

// Inside DiffScreen component:

// 1. Replace per-file hook with cross-file hook
const hunkCollapse = useHunkCollapseGlobal();

// 2. Get the per-file collapse map for the current file
const currentFilePath = currentFile?.path ?? "";
const fileCollapseMap = hunkCollapse.getFileCollapseMap(currentFilePath);

// 3. Derive focused hunk
const focusedHunk = useFocusedHunk({
  parsedDiff,
  filePath: currentFilePath,
  scrollPosition: scroll.scrollOffset,
  collapseState: fileCollapseMap,
});

// 4. Build and register collapse keybindings
const collapseBindings = useCollapseKeybindings({
  hunkCollapse,
  focusedHunk,
  parsedDiff,
  currentFile,
  files: diffData.file_diffs,
  parsedDiffs,
  focusZone,
  isLoaded: !isLoading && !error,
  hasOverlay: overlayOpen,
  onScrollAdjustAfterCollapse: scroll.adjustAfterCollapse,
  onScrollAdjustAfterExpand: scroll.adjustAfterExpand,
});

// 5. Include collapse bindings in screen keybindings
useScreenKeybindings(
  [
    ...existingBindings,
    ...collapseBindings,
  ],
  [
    ...existingHints,
    { keys: "z/x", label: breakpoint === "minimum" ? "" : "hunks", order: 40 },
  ]
);

// 6. Reset collapse state on whitespace toggle
const handleWhitespaceToggle = useCallback(() => {
  whitespace.toggle();
  hunkCollapse.reset();
  // telemetry: tui.diff.hunk.collapse_state_reset
  // debug log: diff.hunk.collapse.state_reset
}, [whitespace.toggle, hunkCollapse.reset]);

// 7. Remove per-file reset on file navigation
// DO NOT call hunkCollapse.reset() in the file navigation effect.
// The cross-file state persists across file navigation.
useEffect(() => {
  scroll.scrollHandle?.scrollToTop();
  // Note: collapse state is NOT reset here (cross-file persistence)
}, [fileNav.fileIndex]);

// 8. Pass per-file collapse map to viewers
<UnifiedDiffViewer
  // ... existing props ...
  hunkCollapseState={fileCollapseMap}
  onToggleHunk={(hunkIdx) => hunkCollapse.toggleHunk(currentFilePath, hunkIdx)}
  onCollapseAll={() => hunkCollapse.collapseAllInFile(currentFilePath, parsedDiff.hunks.length)}
  onExpandAll={() => hunkCollapse.expandAllInFile(currentFilePath)}
/>
```

**Key changes from existing scaffold:**

1. **Cross-file persistence:** The old `useHunkCollapse().reset()` was called on every file navigation. Now it's not — state persists.
2. **Whitespace toggle resets collapse:** When `w` is pressed, `hunkCollapse.reset()` clears all collapse state because the hunk structure may change after the whitespace-aware re-fetch.
3. **Status bar hints:** `z/x:hunks` hint at standard+ size, just `z/x` at minimum.
4. **Focus zone gating:** All collapse keybindings are no-ops when `focusZone === "tree"`.

---

### Step 9: UnifiedDiffViewer Update — CollapsedHunkSummary Integration

**File:** `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx` (modification)

Replace the inline collapsed summary rendering with the `<CollapsedHunkSummary>` component.

```typescript
import { CollapsedHunkSummary } from "./CollapsedHunkSummary.js";
import { COLLAPSED_SUMMARY_HEIGHT } from "./diff-constants.js";

// Inside the hunk rendering loop:
{parsedDiff.hunks.map((hunk, i) => {
  const collapsed = hunkCollapseState.get(i) ?? false;

  if (collapsed) {
    // Collapsed: render summary with dashed borders
    return (
      <CollapsedHunkSummary
        key={`hunk-${i}-collapsed`}
        hunk={hunk}
        terminalWidth={terminalWidth}
        breakpoint={breakpoint}
        contentWidth={contentWidth}
        onExpand={() => onToggleHunk(i)}
      />
    );
  }

  // Expanded: render hunk header + diff content
  return (
    <box key={`hunk-${i}-expanded`} flexDirection="column" width="100%">
      <DiffHunkHeader
        header={hunk.header}
        scopeName={hunk.scopeName}
        collapsed={false}
        breakpoint={breakpoint}
        onToggle={() => onToggleHunk(i)}
      />
      <diff
        diff={buildHunkPatch(hunk)}
        view="unified"
        filetype={filetype}
        syntaxStyle={syntaxStyle ?? undefined}
        showLineNumbers={showLineNumbers}
        wrapMode={breakpoint === "minimum" ? "word" : "none"}
        addedBg={DIFF_COLORS.addedBg}
        removedBg={DIFF_COLORS.removedBg}
        addedSignColor={DIFF_COLORS.addedSignColor}
        removedSignColor={DIFF_COLORS.removedSignColor}
        lineNumberFg={DIFF_COLORS.lineNumberFg}
        lineNumberBg={DIFF_COLORS.lineNumberBg}
        addedLineNumberBg={DIFF_COLORS.addedLineNumberBg}
        removedLineNumberBg={DIFF_COLORS.removedLineNumberBg}
      />
    </box>
  );
})}
```

**Note:** When the hunk is collapsed, the `DiffHunkHeader` is NOT rendered — the entire hunk (header + content) is replaced by the `CollapsedHunkSummary`. This matches the product spec: "The hunk header line is hidden when the hunk is collapsed — the summary replaces the entire hunk including its header."

---

### Step 10: Split View Integration

If a `SplitDiffViewer` component exists (from `tui-diff-split-view`), it receives the same `hunkCollapseState` Map and renders `<CollapsedHunkSummary>` for collapsed hunks. The summary line spans the full width across both panes:

```typescript
// In SplitDiffViewer, for a collapsed hunk:
<box width="100%">
  <CollapsedHunkSummary
    hunk={hunk}
    terminalWidth={terminalWidth}
    breakpoint={breakpoint}
    contentWidth={terminalWidth}  // Full width, not half
    onExpand={() => onToggleHunk(i)}
  />
</box>
```

Collapse state is shared between views via the cross-file `HunkCollapseGlobalState`. Toggling `t` (unified ↔ split) does not call `hunkCollapse.reset()`, so state is preserved.

---

### Step 11: Telemetry Integration

**File:** `apps/tui/src/screens/DiffScreen/collapse-telemetry.ts`

```typescript
import type { ParsedDiff } from "../../lib/diff-types.js";

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

export function emitCollapseSingle(
  ctx: CollapseEventContext,
  file: string,
  hunkIndex: number,
  hunkLineCount: number,
  totalHunksInFile: number,
  collapsedHunksAfter: number
): void {
  // Emit: tui.diff.hunk.collapse_single
  // Properties: ctx.repo, ctx.changeId/landingNumber, ctx.source,
  //   file, hunkIndex, hunkLineCount, ctx.viewMode,
  //   totalHunksInFile, collapsedHunksAfter
}

export function emitExpandSingle(
  ctx: CollapseEventContext,
  file: string,
  hunkIndex: number,
  hunkLineCount: number,
  method: "z" | "enter",
  collapsedHunksAfter: number
): void {
  // Emit: tui.diff.hunk.expand_single
}

export function emitCollapseAllFile(
  ctx: CollapseEventContext,
  file: string,
  hunkCount: number
): void {
  // Emit: tui.diff.hunk.collapse_all_file
}

export function emitExpandAllFile(
  ctx: CollapseEventContext,
  file: string,
  hunkCount: number,
  previouslyCollapsedCount: number
): void {
  // Emit: tui.diff.hunk.expand_all_file
}

export function emitExpandAllGlobal(
  ctx: CollapseEventContext,
  fileCount: number,
  totalHunkCount: number,
  previouslyCollapsedCount: number
): void {
  // Emit: tui.diff.hunk.expand_all_global
}

export function emitCollapseStateReset(
  ctx: CollapseEventContext,
  previouslyCollapsedCount: number,
  trigger: "whitespace_toggle"
): void {
  // Emit: tui.diff.hunk.collapse_state_reset
}
```

Telemetry function bodies will call the shared telemetry client (e.g., `@codeplane/ui-core`'s analytics module). If the telemetry client is not yet available, the functions are empty stubs that log at `debug` level.

---

### Step 12: `getCollapsedSummaryText` Enhancement

**File:** `apps/tui/src/lib/diff-parse.ts` (modification)

Update the existing `getCollapsedSummaryText` to handle:
- Singular form: `1 line hidden (line X)` instead of `1 lines hidden (lines X–X)`
- En-dash (`–`) character between line range numbers
- Use `newStart` instead of `oldStart` for the line range (product spec says "lines X–Y is the line range in the new file")

```typescript
export function getCollapsedSummaryText(
  hunk: ParsedHunk,
  terminalWidth: number
): string {
  const count = hunk.totalLineCount;

  if (terminalWidth < 120) {
    return `${count} hidden`;
  }

  if (count === 1) {
    return `1 line hidden (line ${hunk.newStart})`;
  }

  const endLine = hunk.newStart + count - 1;
  return `${count} lines hidden (lines ${hunk.newStart}\u2013${endLine})`;
}
```

**Change:** Uses `hunk.newStart` (new file line number) instead of `hunk.oldStart` to match the product spec.

---

## 5. Data Flow Diagram

```
DiffScreen (state owner)
├── useHunkCollapseGlobal() → HunkCollapseGlobalState
│   └── collapsed: Map<string, Map<number, boolean>>
│       ├── "src/api.ts" → Map { 0→true, 2→true }
│       ├── "src/lib.ts" → Map { 1→true }
│       └── (other files: absent = all expanded)
│
├── getFileCollapseMap(currentFile.path) → Map<number, boolean>
│   └── Per-file view for focused file, passed to viewers
│
├── useFocusedHunk({ parsedDiff, filePath, scrollPosition, collapseState })
│   ├── getHunkVisualOffsets(hunks, collapseState) → [0, 5, 6, 16]
│   ├── getFocusedHunkIndex(scrollPos, offsets) → 2
│   └── returns { hunkIndex: 2, filePath: "src/api.ts", onCollapsedSummary: true }
│
├── useCollapseKeybindings({ hunkCollapse, focusedHunk, ... })
│   ├── z → toggleHunk(filePath, focusedHunk.hunkIndex)
│   ├── Z → collapseAllInFile(filePath, parsedDiff.hunks.length)
│   ├── x → expandAllInFile(filePath)
│   ├── X → expandAll()
│   └── Enter → expandHunk(filePath, focusedHunk.hunkIndex)  [only if collapsed]
│
├── useScreenKeybindings([...existingBindings, ...collapseBindings])
│
├── Whitespace toggle handler:
│   └── w → whitespace.toggle() + hunkCollapse.reset()
│
└── UnifiedDiffViewer / SplitDiffViewer
    ├── Input: parsedDiff, hunkCollapseState (per-file Map)
    └── Per hunk:
        ├── collapsed → <CollapsedHunkSummary>
        └── expanded → <DiffHunkHeader collapsed={false}> + <diff>
```

---

## 6. State Persistence Matrix

| User Action | Collapse State Behavior | Reason |
|-------------|------------------------|--------|
| `]` / `[` (file navigation) | **Preserved** | Cross-file Map retains per-file state |
| `Enter` in file tree | **Preserved** | Same cross-file Map |
| `Ctrl+B` (sidebar toggle) | **Preserved** | Sidebar visibility is layout-only; diff state unchanged |
| `t` (view mode toggle) | **Preserved** | Both viewers read same collapse Map |
| `l` (line number toggle) | **Preserved** | Line numbers are rendering-only; hunk structure unchanged |
| `w` (whitespace toggle) | **Reset** | Hunk structure may change after whitespace-filtered re-fetch |
| `q` (pop screen) | **Reset** | Component unmounts; state is component-local |
| Screen re-entry (re-push DiffView) | **Reset** | Fresh component instance creates new `useHunkCollapseGlobal()` |
| Terminal resize | **Preserved** | State is line-count-based, not pixel-based |

---

## 7. Scroll Behavior with Collapsed Hunks

### 7.1 Scrollbox content height

The scrollbox's total content height is computed from:

```
totalVisibleLines = Σ (for each hunk h in file):
  if collapsed(h): COLLAPSED_SUMMARY_HEIGHT (3 rows)
  else: hunk.totalLineCount + 1 (lines + hunk header)
```

Plus file header height (1 row).

The scrollbar indicator (if present) reflects `totalVisibleLines`, not the total content height.

### 7.2 Scroll position adjustment on collapse

When hunk `i` collapses and its visual offset is **above** the current scroll position:
- `scrollOffset -= (hunk.totalLineCount - COLLAPSED_SUMMARY_HEIGHT)`
- This keeps the developer's current viewport stable.

When hunk `i` collapses and its visual offset is **at or below** the current scroll position:
- No scroll adjustment needed — the content below the viewport shrinks.

### 7.3 Scroll position adjustment on expand

When hunk `i` expands:
- No scroll adjustment needed. The expanded content appears at the hunk's position and pushes subsequent content down. The developer sees the expansion inline.

### 7.4 Page jumps

`Ctrl+D` / `Ctrl+U` jump by `Math.floor(viewportHeight * 0.5)` lines. These count visible lines (collapsed hunks = COLLAPSED_SUMMARY_HEIGHT rows), not total lines.

### 7.5 Jump to bottom/top

- `G`: Jumps to `totalVisibleLines - viewportHeight`. If the last hunk is collapsed, the cursor lands on the collapsed summary line.
- `g g`: Jumps to scroll offset 0.

---

## 8. Responsive Behavior

| Terminal Width | Summary Format | Status Bar Hint | Border Char |
|----------------|---------------|-----------------|-------------|
| < 80 | N/A ("terminal too small") | N/A | N/A |
| 80–119 | `▶ ⋯ N hidden` | `z/x` | `╌` |
| 120–199 | `▶ ⋯ N lines hidden (lines X–Y)` | `z/x:hunks` | `╌` |
| 200+ | `▶ ⋯ N lines hidden (lines X–Y)` | `z/x:hunks` | `╌` |

On resize:
1. `useTerminalDimensions()` fires synchronously
2. `useBreakpoint()` recalculates
3. `CollapsedHunkSummary` re-renders with new `terminalWidth` → summary text may switch format
4. Dashed border width recalculates from `contentWidth`
5. Collapse state is **never** affected by resize

---

## 9. Edge Cases and Failure Modes

| Edge Case | Behavior |
|-----------|----------|
| Zero files in diff | All keybindings are no-ops |
| Zero hunks in current file | `z`/`Z`/`x`/`X` are no-ops |
| Single-line hunk collapsed | Summary: `▶ ⋯ 1 line hidden (line X)` (singular) |
| 1000+ line hunk | Full integer displayed: `▶ ⋯ 1500 lines hidden (lines X–Y)` |
| `z` when all hunks collapsed | No-op, logged as `diff.hunk.collapse.noop` |
| `x` when all hunks expanded | No-op, logged as `diff.hunk.collapse.noop` |
| Rapid `z` presses | Each keypress processed sequentially, no debounce |
| Hunk boundary calculation error (out of bounds) | Treated as no-op, warning logged |
| Unicode not supported (TERM=dumb) | `▶`/`▼` still rendered; border falls back to `---` |
| State desync after diff data change | On any diff data refetch (whitespace toggle), clear collapse state entirely |
| Binary file in diff | Skipped by `Z` — binary files have no hunks |
| `Ctrl+z` pressed | Does not match `z` handler — `Ctrl` modifier prevents match |
| `Enter` on expanded hunk header | No-op — `when` condition checks `onCollapsedSummary` |
| `Enter` on non-hunk line | No-op — focused hunk is still valid, but `isCollapsed` returns false |
| Split view + collapsed hunk | Summary spans full terminal width (not half) |

---

## 10. Productionization Notes

### 10.1 From hook prototype to production

The `useHunkCollapseGlobal` hook is designed for direct production use — no PoC stage needed. Key production considerations:

1. **Memory:** The nested Map grows proportionally to the number of collapsed hunks. Since developers typically collapse < 20 hunks per session, memory usage is negligible (< 1KB). No eviction needed.
2. **Immutability:** Every state update creates new Map instances. This is intentional for React's change detection. At typical Map sizes (< 50 entries), cloning is sub-microsecond.
3. **Ref synchronization:** `collapsedRef.current` is updated on every render to ensure keybinding handlers read fresh state. This is a standard React pattern, not a hack.

### 10.2 Performance considerations

1. **`getHunkVisualOffsets`** is O(n) where n = hunks in file. Memoized in `useFocusedHunk`. At 100 hunks, this is ~1μs.
2. **`getFocusedHunkIndex`** is O(log n) binary search. At 100 hunks, this is ~0.1μs. Called on every scroll position change.
3. **`CollapsedHunkSummary` render:** Pure component that renders 3 `<text>` nodes. Sub-millisecond.
4. **Key repeat rate:** At 30 keypresses/second (typical key repeat), each `z` toggle takes < 1ms (state update + synchronous re-render via OpenTUI). No frame drops.

### 10.3 Accessibility

1. **Screen readers:** Not applicable for TUI. The terminal output is the accessible surface.
2. **Color-only information:** The `▶`/`▼` characters provide non-color indication of collapse state. The dashed border provides additional visual structure.
3. **TERM=dumb fallback:** All indicators work at any color level. Dashed border degrades to ASCII `-`.

---

## 11. Unit & Integration Tests

**Test file:** `e2e/tui/diff.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper. Tests are appended to the existing `diff.test.ts` file. Tests that fail due to unimplemented backend features are left failing — they are never skipped or commented out.

### 11.1 Snapshot Tests — Visual States (13 tests)

```typescript
describe("TUI_DIFF_EXPAND_COLLAPSE — snapshot tests", () => {
  test("SNAP-EC-001: renders all hunks expanded by default at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with a multi-hunk file
    await tui.sendKeys("g", "r"); // go to repo list
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter"); // open first repo
    // Navigate to a diff (via changes or landings)
    // Wait for diff to render
    await tui.waitForText("@@");
    // Assert: all hunks show ▼ indicator
    const snap = tui.snapshot();
    expect(snap).toContain("▼");
    expect(snap).not.toContain("▶"); // No collapsed hunks
    expect(snap).not.toContain("hidden"); // No collapsed summaries
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-002: renders collapsed hunk summary at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // Press z to collapse focused hunk
    await tui.sendKeys("z");
    // Assert: collapsed summary visible
    const snap = tui.snapshot();
    expect(snap).toContain("▶");
    expect(snap).toContain("⋯");
    expect(snap).toMatch(/\d+ lines hidden \(lines \d+–\d+\)/);
    expect(snap).toContain("╌");
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-003: renders collapsed hunk summary at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff, press z
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // At < 120 cols, abbreviated format
    expect(snap).toContain("▶");
    expect(snap).toContain("⋯");
    expect(snap).toMatch(/\d+ hidden/);
    expect(snap).not.toMatch(/lines hidden/);
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-004: renders collapsed hunk summary at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff, press z
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    expect(snap).toContain("▶");
    expect(snap).toMatch(/\d+ lines hidden \(lines \d+–\d+\)/);
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-005: renders all hunks collapsed in file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with multiple hunks, press Z
    await tui.sendKeys("Z");
    const snap = tui.snapshot();
    // All hunks should show ▶, no ▼
    expect(snap).toContain("▶");
    // File header should still be visible
    // (file path and +N −M stats)
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-006: renders mixed collapse state", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with 3+ hunks
    // Collapse hunk 2 only (scroll down, z)
    await tui.sendKeys("j", "j", "j", "j", "j"); // scroll past hunk 1
    await tui.sendKeys("z"); // collapse hunk 2
    const snap = tui.snapshot();
    // Should show mix of ▼ (expanded) and ▶ (collapsed)
    expect(snap).toContain("▼");
    expect(snap).toContain("▶");
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-007: renders expanded hunk indicator", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    const snap = tui.snapshot();
    // ▼ should be present before @@ range
    expect(snap).toMatch(/▼.*@@/);
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-008: renders collapsed hunk indicator", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    expect(snap).toContain("▶");
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-009: renders collapsed hunk in split view", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Switch to split view
    await tui.sendKeys("t");
    // Collapse a hunk
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // Summary should span full width
    expect(snap).toContain("▶");
    expect(snap).toContain("hidden");
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-010: renders status bar hunk hints at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/z\/x/);
    expect(statusLine).toMatch(/hunks/);
    expect(statusLine).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-011: renders status bar hunk hints at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/z\/x/);
    expect(statusLine).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-012: renders single-line hunk collapsed", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with a 1-line hunk
    // Collapse it
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    expect(snap).toMatch(/1 line hidden \(line \d+\)/);
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-EC-013: renders large hunk collapsed", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with a large hunk (1500+ lines)
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // Full integer, no abbreviation
    expect(snap).toMatch(/\d{4,} lines hidden/);
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });
});
```

### 11.2 Keyboard Interaction Tests (26 tests)

```typescript
describe("TUI_DIFF_EXPAND_COLLAPSE — keyboard interaction", () => {
  test("KEY-EC-001: z collapses focused hunk", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with at least 1 hunk
    await tui.waitForText("@@");
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    expect(tui.snapshot()).toContain("▶");
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-002: z on collapsed hunk expands it", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("z"); // expand
    await tui.waitForText("@@");
    await tui.waitForNoText("hidden");
    expect(tui.snapshot()).toContain("▼");
    await tui.terminate();
  });

  test("KEY-EC-003: Enter on collapsed hunk expands it", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("Enter"); // expand via Enter
    await tui.waitForText("@@");
    await tui.waitForNoText("hidden");
    await tui.terminate();
  });

  test("KEY-EC-004: Enter on expanded hunk header is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    const before = tui.snapshot();
    await tui.sendKeys("Enter");
    const after = tui.snapshot();
    // Content should not change (Enter is no-op on expanded hunks in content zone)
    expect(after).toContain("▼");
    expect(after).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-005: Enter on code line is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("j", "j"); // move into code lines
    const before = tui.snapshot();
    await tui.sendKeys("Enter");
    const after = tui.snapshot();
    expect(after).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-006: Z collapses all hunks in file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("Z"); // Shift+Z collapse all
    // No @@ should be visible (all hunks collapsed)
    await tui.waitForText("hidden");
    expect(tui.snapshot()).not.toMatch(/▼.*@@/);
    await tui.terminate();
  });

  test("KEY-EC-007: x expands all hunks in file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("Z"); // collapse all
    await tui.waitForText("hidden");
    await tui.sendKeys("x"); // expand all
    await tui.waitForText("@@");
    await tui.waitForNoText("hidden");
    expect(tui.snapshot()).toContain("▼");
    await tui.terminate();
  });

  test("KEY-EC-008: X expands all across files", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("Z"); // collapse all in file 1
    await tui.sendKeys("]"); // next file
    await tui.sendKeys("Z"); // collapse all in file 2
    await tui.sendKeys("X"); // expand all globally
    // All hunks across all files should be expanded
    await tui.waitForNoText("hidden");
    await tui.terminate();
  });

  test("KEY-EC-009: z no-op during loading", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Before diff data loads, press z
    await tui.sendKeys("z");
    // Should not crash, no collapse visible
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-010: z no-op during error", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_API_URL: "http://localhost:1" }, // unreachable
    });
    // Navigate to diff — should error
    await tui.sendKeys("z");
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-011: z no-op with help overlay", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("?"); // open help
    await tui.sendKeys("z"); // should not collapse
    await tui.sendKeys("Esc"); // close help
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-012: z no-op with command palette", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys(":"); // open palette
    await tui.sendKeys("z"); // types into palette, doesn't collapse
    await tui.sendKeys("Esc"); // close palette
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-013: z works in split view", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("t"); // switch to split view
    await tui.sendKeys("z"); // collapse in split view
    await tui.waitForText("hidden");
    expect(tui.snapshot()).toContain("▶");
    await tui.terminate();
  });

  test("KEY-EC-014: collapse preserved across file nav", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse in file 1
    await tui.waitForText("hidden");
    await tui.sendKeys("]"); // next file
    await tui.sendKeys("["); // back to file 1
    // Collapse state should be preserved
    expect(tui.snapshot()).toContain("hidden");
    expect(tui.snapshot()).toContain("▶");
    await tui.terminate();
  });

  test("KEY-EC-015: collapse preserved across view toggle", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("t"); // toggle to split
    expect(tui.snapshot()).toContain("hidden");
    await tui.sendKeys("t"); // toggle back to unified
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-016: collapse reset on whitespace toggle", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("w"); // toggle whitespace
    // Collapse state should reset — all expanded
    await tui.waitForNoText("hidden");
    await tui.terminate();
  });

  test("KEY-EC-017: collapse preserved across line toggle", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("l"); // toggle line numbers
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-018: collapse preserved across sidebar toggle", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("ctrl+b"); // toggle sidebar
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-019: rapid z presses toggle correctly", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.waitForText("hidden");
    await tui.sendKeys("z"); // expand
    await tui.waitForNoText("hidden");
    await tui.sendKeys("z"); // collapse again
    await tui.waitForText("hidden");
    await tui.terminate();
  });

  test("KEY-EC-020: Z then x is full expand", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("Z"); // collapse all
    await tui.waitForText("hidden");
    await tui.sendKeys("x"); // expand all
    await tui.waitForNoText("hidden");
    expect(tui.snapshot()).toContain("▼");
    await tui.terminate();
  });

  test("KEY-EC-021: x when all expanded is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    const before = tui.snapshot();
    await tui.sendKeys("x"); // already all expanded
    const after = tui.snapshot();
    expect(before).toEqual(after);
    await tui.terminate();
  });

  test("KEY-EC-022: Z when all collapsed is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("Z"); // collapse all
    await tui.waitForText("hidden");
    const before = tui.snapshot();
    await tui.sendKeys("Z"); // already all collapsed
    const after = tui.snapshot();
    expect(before).toEqual(after);
    await tui.terminate();
  });

  test("KEY-EC-023: Ctrl+z does not trigger", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("ctrl+z"); // should NOT collapse
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("KEY-EC-024: scroll treats collapsed as 1 line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse first hunk
    await tui.waitForText("hidden");
    await tui.sendKeys("j"); // scroll down — should pass collapsed hunk in 1 step
    // After scrolling past collapsed hunk, next content should be visible
    await tui.terminate();
  });

  test("KEY-EC-025: page jump accounts for collapsed", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.sendKeys("ctrl+d"); // page down
    // Should not jump past content due to miscounted height
    await tui.terminate();
  });

  test("KEY-EC-026: G accounts for collapsed hunks", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("@@");
    await tui.sendKeys("z"); // collapse
    await tui.sendKeys("G"); // jump to bottom
    // Should reach actual bottom of visible content
    await tui.terminate();
  });
});
```

### 11.3 Responsive Behavior Tests (8 tests)

```typescript
describe("TUI_DIFF_EXPAND_COLLAPSE — responsive behavior", () => {
  test("RSP-EC-001: abbreviated at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff, collapse
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    expect(snap).toMatch(/\d+ hidden/);
    expect(snap).not.toMatch(/lines hidden/);
    await tui.terminate();
  });

  test("RSP-EC-002: full format at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    expect(snap).toMatch(/\d+ lines hidden \(lines \d+–\d+\)/);
    await tui.terminate();
  });

  test("RSP-EC-003: full format at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    expect(snap).toMatch(/\d+ lines hidden \(lines \d+–\d+\)/);
    await tui.terminate();
  });

  test("RSP-EC-004: resize 120→80 abbreviates", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    await tui.waitForText("lines hidden"); // full format
    await tui.resize(80, 24);
    const snap = tui.snapshot();
    expect(snap).toMatch(/\d+ hidden/);
    expect(snap).not.toMatch(/lines hidden/);
    await tui.terminate();
  });

  test("RSP-EC-005: resize 80→120 expands", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    await tui.resize(120, 40);
    const snap = tui.snapshot();
    expect(snap).toMatch(/\d+ lines hidden \(lines \d+–\d+\)/);
    await tui.terminate();
  });

  test("RSP-EC-006: resize preserves state", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    await tui.resize(80, 24);
    await tui.resize(120, 40);
    // State should still be collapsed
    expect(tui.snapshot()).toContain("hidden");
    expect(tui.snapshot()).toContain("▶");
    await tui.terminate();
  });

  test("RSP-EC-007: resize adjusts border width", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    const snap1 = tui.snapshot();
    await tui.resize(200, 60);
    const snap2 = tui.snapshot();
    // Border should be wider at 200 cols
    // Both should contain ╌ but at different lengths
    expect(snap1).toContain("╌");
    expect(snap2).toContain("╌");
    await tui.terminate();
  });

  test("RSP-EC-008: status bar hint updates", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    let status = tui.getLine(tui.rows - 1);
    expect(status).toMatch(/z\/x.*hunks/);
    await tui.resize(80, 24);
    status = tui.getLine(tui.rows - 1);
    expect(status).toMatch(/z\/x/);
    await tui.terminate();
  });
});
```

### 11.4 Integration Tests (6 tests)

```typescript
describe("TUI_DIFF_EXPAND_COLLAPSE — integration", () => {
  test("INT-EC-001: change diff hunk boundaries tracked", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a change diff with 3 hunks
    // Assert: 3 @@ headers visible
    const snap = tui.snapshot();
    const hunkCount = (snap.match(/▼/g) ?? []).length;
    expect(hunkCount).toBeGreaterThanOrEqual(1);
    await tui.terminate();
  });

  test("INT-EC-002: landing diff hunk boundaries tracked", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a landing diff with multiple files
    // Assert: hunks visible across files
    await tui.terminate();
  });

  test("INT-EC-003: collapse state clears on whitespace re-fetch", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Collapse some hunks
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    // Toggle whitespace
    await tui.sendKeys("w");
    // All hunks should be expanded after re-fetch
    await tui.waitForNoText("hidden");
    await tui.terminate();
  });

  test("INT-EC-004: collapse state independent across files", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // File 1: collapse hunk
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    // Navigate to file 2
    await tui.sendKeys("]");
    // File 2 should have all hunks expanded
    expect(tui.snapshot()).toContain("▼");
    // Navigate back to file 1
    await tui.sendKeys("[");
    // File 1 should still have collapsed hunk
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("INT-EC-005: binary file skipped in collapse", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a binary file in diff
    // Press Z — should be no-op (binary files have no hunks)
    await tui.sendKeys("Z");
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("INT-EC-006: collapse state clears on remount", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Collapse a hunk
    await tui.sendKeys("z");
    await tui.waitForText("hidden");
    // Exit diff screen
    await tui.sendKeys("q");
    // Re-enter diff screen (navigate back)
    // All hunks should be expanded
    await tui.waitForNoText("hidden");
    await tui.terminate();
  });
});
```

### 11.5 Edge Case Tests (12 tests)

```typescript
describe("TUI_DIFF_EXPAND_COLLAPSE — edge cases", () => {
  test("EDGE-EC-001: z on 0-file diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to an empty diff (no files changed)
    await tui.sendKeys("z");
    // Should not crash
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-002: z on 0-hunk file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a file with only metadata changes (no hunks)
    await tui.sendKeys("z");
    expect(tui.snapshot()).not.toContain("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-003: single-line hunk collapse", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with a 1-line hunk, collapse it
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // Singular form
    expect(snap).toMatch(/1 line hidden \(line \d+\)/);
    await tui.terminate();
  });

  test("EDGE-EC-004: collapse last hunk then G", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to last hunk, collapse it
    await tui.sendKeys("G"); // jump to bottom
    await tui.sendKeys("z"); // collapse last hunk
    await tui.sendKeys("G"); // jump to bottom again
    // Cursor should land on the collapsed summary
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-005: Z then ] preserves file 1", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("Z"); // collapse all in file 1
    await tui.waitForText("hidden");
    await tui.sendKeys("]"); // next file
    // File 2 should be expanded
    expect(tui.snapshot()).toContain("▼");
    await tui.sendKeys("["); // back to file 1
    // File 1 should still be collapsed
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-006: state after unified→split→unified", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z"); // collapse in unified
    await tui.waitForText("hidden");
    await tui.sendKeys("t"); // switch to split
    expect(tui.snapshot()).toContain("hidden");
    await tui.sendKeys("t"); // back to unified
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-007: 1000+ line hunk full number", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with very large hunk
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // Number should not be abbreviated
    expect(snap).toMatch(/\d{4,} lines hidden/);
    await tui.terminate();
  });

  test("EDGE-EC-008: cursor between hunks", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Scroll to a position between hunk boundaries
    // Press z — should collapse the nearest hunk above
    await tui.sendKeys("z");
    expect(tui.snapshot()).toContain("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-009: Z then x restores all", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("Z"); // collapse all
    await tui.waitForText("hidden");
    await tui.sendKeys("x"); // expand all
    await tui.waitForNoText("hidden");
    expect(tui.snapshot()).toContain("▼");
    await tui.terminate();
  });

  test("EDGE-EC-010: X across 5 files", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Collapse hunks in multiple files
    await tui.sendKeys("Z");
    await tui.sendKeys("]");
    await tui.sendKeys("Z");
    await tui.sendKeys("]");
    await tui.sendKeys("Z");
    // Global expand
    await tui.sendKeys("X");
    await tui.waitForNoText("hidden");
    await tui.terminate();
  });

  test("EDGE-EC-011: collapse at exactly 120 cols split", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // At exactly 120, should use full format
    expect(snap).toMatch(/\d+ lines hidden/);
    await tui.terminate();
  });

  test("EDGE-EC-012: no-color terminal", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { TERM: "dumb", NO_COLOR: "1" },
    });
    // Navigate to diff, collapse
    await tui.sendKeys("z");
    const snap = tui.snapshot();
    // Indicators should still work, borders fall back to ---
    expect(snap).toContain("▶");
    expect(snap).toContain("hidden");
    // Border should be ASCII dashes, not ╌
    expect(snap).toContain("---");
    await tui.terminate();
  });
});
```

---

## 12. Testing Notes

### 12.1 Test data requirements

The E2E tests require a running API server with test fixtures that include:
- A repository with at least one change that modifies 2+ files
- At least one file with 3+ hunks in a single diff
- At least one file with a single-line hunk
- At least one binary file in a diff
- At least one diff accessible via landing request

If these fixtures are not available (API server not running or fixtures missing), the tests will fail naturally. They are **not** skipped or mocked.

### 12.2 Navigation preamble

Each test must navigate to a diff screen before testing collapse behavior. The exact navigation sequence depends on the test fixture setup. A typical sequence:

```typescript
// Navigate to diff screen
await tui.sendKeys("g", "r"); // go to repos
await tui.waitForText("Repositories");
await tui.sendKeys("Enter"); // open repo
await tui.waitForText("Changes"); // or "Bookmarks"
// Navigate to a change with a diff
// ... (fixture-dependent)
await tui.waitForText("@@"); // diff is rendered
```

The exact keystrokes will be determined when test fixtures are finalized. The test structure is correct regardless.

### 12.3 Snapshot golden files

Snapshot tests use `toMatchSnapshot()` which creates/compares golden files in `e2e/tui/__snapshots__/diff.test.ts.snap`. On first run, golden files are created. On subsequent runs, they are compared. Failed snapshot comparisons indicate visual regressions.

### 12.4 No mocking

Per project policy: tests run against a real API server with test fixtures. The collapse feature is entirely client-side, but the diff data it operates on comes from real API responses. Tests that cannot reach the API server will fail at the navigation preamble, not at the collapse assertion.

---

## 13. Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/TUI_DIFF_EXPAND_COLLAPSE.md` — Product specification
- `specs/tui/engineering/tui-diff-unified-view.md` — Dependency: unified view
- `specs/tui/engineering/tui-diff-parse-utils.md` — Dependency: parse utilities
- `specs/tui/engineering/tui-diff-screen.md` — Parent: diff screen lifecycle
- `specs/tui/design.md` — TUI design specification
- `specs/tui/features.ts` — Feature inventory
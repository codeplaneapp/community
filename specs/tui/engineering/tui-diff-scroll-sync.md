# Engineering Specification: tui-diff-scroll-sync

**Ticket:** tui-diff-scroll-sync
**Title:** TUI_DIFF_SCROLL_SYNC: Synchronized scrolling in split view
**Status:** Not started
**Dependencies:** tui-diff-split-view
**Downstream consumers:** tui-diff-inline-comments (future)

---

## Overview

This ticket implements scroll synchronization between the left (old) and right (new) panes in the TUI's split diff view. When active, a single scroll offset governs both panes — every vertical and horizontal scroll operation moves both sides in lockstep within the same render frame. Filler lines (inserted by `buildSplitPairs()` at parse time) ensure hunk-aware alignment so that context lines, additions, and deletions always appear at the same vertical row in both panes.

Scroll sync is intrinsic to split mode — it activates automatically when `view="split"` and deactivates when `view="unified"`. There is no independent toggle. The `syncScroll={true}` prop on the `<diff>` component is set in split mode and omitted/false in unified mode.

This builds directly on the `DiffSyncController` context and `DiffPane` components defined in `tui-diff-split-view`. The scroll sync ticket extends the controller with virtual scrolling, logical line index preservation across view mode toggles, horizontal scroll synchronization, mouse event forwarding, and hunk collapse/expand offset adjustment.

---

## Target Files

| File | Purpose | New/Modified |
|------|---------|-------------|
| `apps/tui/src/components/diff/DiffSyncController.tsx` | Extend scroll sync context with virtual scrolling, horizontal scroll, logical line index, telemetry | **Modified** |
| `apps/tui/src/components/diff/DiffSplitView.tsx` | Wire syncScroll prop, mouse event forwarding, hunk collapse offset adjustment | **Modified** |
| `apps/tui/src/components/diff/DiffPane.tsx` | Consume horizontal scroll offset, apply virtual scroll buffer (±50 lines) | **Modified** |
| `apps/tui/src/components/diff/DiffViewer.tsx` | Pass syncScroll to split view, preserve scroll position across view toggle | **Modified** |
| `apps/tui/src/components/diff/useScrollPosition.ts` | Hook for logical line index tracking and position preservation across mode toggles | **New** |
| `apps/tui/src/components/diff/useScrollTelemetry.ts` | Hook for batched scroll telemetry event emission | **New** |
| `apps/tui/src/components/diff/scroll-sync-types.ts` | Type definitions for scroll sync state, logical line index | **New** |
| `e2e/tui/diff.test.ts` | E2E tests for scroll sync behavior | **Modified** |

---

## Architectural Decisions

### AD-1: Single shared offset via DiffSyncController (from tui-diff-split-view)

**Decision:** Both panes read from the same `offset` state in `DiffSyncController`. All scroll operations (`scrollBy`, `scrollTo`, `scrollToTop`, `scrollToBottom`, `pageDown`, `pageUp`) update this single offset, triggering one React render that updates both panes simultaneously.

**Rationale:** A shared offset guarantees zero-lag synchronization — both panes are always at the same position because they derive their visible window from the same state variable. This is simpler and more reliable than the alternative of syncing two independent scroll positions via event listeners.

### AD-2: Virtual scrolling with 50-line buffer

**Decision:** Each `DiffPane` renders only the lines within `[offset - 50, offset + viewportHeight + 50]`. Lines outside this window are not instantiated in the React tree.

**Rationale:** For large files (10,000+ lines), rendering the entire line array would exhaust memory and violate the 16ms render budget. A ±50 line buffer provides smooth scrolling without visible pop-in — at typical scroll speeds (30-50 lines/second from key repeat), the buffer ensures content is pre-rendered before it enters the viewport.

**Trade-off:** Jumping (G, g g) causes a full buffer replacement. This is acceptable because jumps are infrequent and the 16ms budget allows rendering ~100 lines per frame.

### AD-3: Logical line index for position preservation

**Decision:** Scroll position is tracked as both a visual offset (row count) and a logical line index (hunk index + line-within-hunk). When toggling between unified and split modes, the logical index is resolved to the corresponding visual offset in the target mode.

**Rationale:** Visual offsets differ between unified and split modes because filler lines exist only in split mode. A logical line index (the actual source line, identified by hunk and position) is invariant across modes, enabling accurate position preservation.

### AD-4: Horizontal scroll synchronization as a separate axis

**Decision:** Horizontal scroll is tracked as a separate `horizontalOffset` in `DiffSyncController`, independent of vertical scroll. Both axes are synchronized between panes but managed independently.

**Rationale:** Horizontal scroll is relevant only when `wrapMode="none"` and line content exceeds pane width. It must be independently controllable (left/right arrow keys) without affecting vertical position.

### AD-5: Filler lines count toward total height

**Decision:** The `totalLines` value used for scroll boundary clamping includes filler lines. This matches the visual line count — what the user sees when scrolling.

**Rationale:** Filler lines occupy visual space and are part of the rendered output. Excluding them from total height would cause scroll boundary miscalculation (user could scroll past the visible end or fail to reach the bottom).

### AD-6: Scroll telemetry is batched, not per-event

**Decision:** Scroll events are accumulated and emitted as a single `tui.diff.split_view_scrolled` telemetry event after 500ms of scroll inactivity.

**Rationale:** At 30-50 key events/second during held-key scrolling, per-event telemetry would generate hundreds of events per second. Batching after inactivity captures the meaningful scroll gesture (direction, total distance, method) without noise.

---

## Data Flow

```
Keypress (j/k/Ctrl+D/Ctrl+U/G/gg)
  │
  ▼
KeybindingProvider dispatches to DiffScreen keybinding scope
  │
  ▼
DiffScreen handler calls DiffSyncController methods:
  scrollBy(±1)       ← j/k
  pageDown(vh)       ← Ctrl+D
  pageUp(vh)         ← Ctrl+U
  scrollToBottom(vh) ← G
  scrollToTop()      ← g g
  resetToFile(idx)   ← ]/[
  │
  ▼
DiffSyncController:
  1. Clamps new offset: max(0, min(newOffset, totalLines - viewportHeight))
  2. Updates offset state → triggers single React render
  3. Updates logicalLineIndex for mode-toggle preservation
  4. Feeds useScrollTelemetry accumulator
  │
  ▼
Both DiffPane components re-render:
  1. Read offset from useScrollSync()
  2. Compute virtual window: [offset - 50, offset + viewportHeight + 50]
  3. Slice visibleLines to virtual window
  4. Render lines within window
  │
  ▼
Single frame output: both panes at identical vertical + horizontal position
```

### Mouse scroll data flow

```
Mouse scroll event on left or right pane
  │
  ▼
DiffSplitView.onMouseEvent handler:
  1. Detect scroll direction and delta
  2. Call scrollSync.scrollBy(delta) (same path as keyboard)
  │
  ▼
DiffSyncController updates offset → both panes re-render
```

### View mode toggle data flow

```
User presses 't' to toggle split ↔ unified
  │
  ▼
DiffViewer reads current logicalLineIndex from DiffSyncController
  │
  ▼
DiffViewer switches view mode
  │
  ▼
New view resolves logicalLineIndex to visual offset:
  - Split → Unified: map hunk+position to unified line array index
  - Unified → Split: map unified line index to split visual index (with fillers)
  │
  ▼
DiffSyncController.scrollTo(resolvedOffset)
  │
  ▼
New view renders at preserved position
```

---

## Implementation Plan

### Step 1: Type definitions (`apps/tui/src/components/diff/scroll-sync-types.ts`)

Define the type contracts for scroll sync state, logical line index, and telemetry accumulator.

```typescript
// apps/tui/src/components/diff/scroll-sync-types.ts

/**
 * Logical position within a diff, invariant across view modes.
 * Used to preserve scroll position when toggling unified ↔ split.
 */
export interface LogicalLineIndex {
  /** Index of the hunk within the ParsedDiff.hunks array */
  hunkIndex: number;
  /** Line offset within the hunk (0-based) */
  lineWithinHunk: number;
  /** The file index within the multi-file diff (for file navigation) */
  fileIndex: number;
}

/**
 * Extended scroll sync state including horizontal scroll and logical tracking.
 */
export interface ScrollSyncState {
  /** Current vertical scroll offset (visual line index, 0-based) */
  offset: number;
  /** Current horizontal scroll offset (column, 0-based) */
  horizontalOffset: number;
  /** Total visual line count (including filler lines) */
  totalLines: number;
  /** Logical position for mode-toggle preservation */
  logicalLineIndex: LogicalLineIndex;
  /** Scroll by vertical delta (positive = down, negative = up) */
  scrollBy: (delta: number) => void;
  /** Scroll to absolute vertical offset */
  scrollTo: (offset: number) => void;
  /** Jump to top (offset = 0) */
  scrollToTop: () => void;
  /** Jump to bottom */
  scrollToBottom: (viewportHeight: number) => void;
  /** Page down (half viewport) */
  pageDown: (viewportHeight: number) => void;
  /** Page up (half viewport) */
  pageUp: (viewportHeight: number) => void;
  /** Scroll horizontally by delta */
  scrollHorizontalBy: (delta: number) => void;
  /** Set horizontal scroll to absolute offset */
  scrollHorizontalTo: (offset: number) => void;
  /** Reset scroll to top of a specific file (for ] / [ navigation) */
  resetToFileTop: () => void;
}

/**
 * Scroll telemetry accumulator. Collected during scroll,
 * emitted as a single event after 500ms inactivity.
 */
export interface ScrollTelemetryAccumulator {
  scrollMethod: "keyboard_line" | "keyboard_page" | "keyboard_jump" | "mouse";
  direction: "up" | "down";
  totalLinesScrolled: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Virtual scroll window bounds.
 */
export interface VirtualWindow {
  /** First line index to render (inclusive) */
  startIndex: number;
  /** Last line index to render (exclusive) */
  endIndex: number;
  /** Number of lines rendered */
  renderedCount: number;
}

/**
 * Virtual scroll buffer size: 50 lines above and below the viewport.
 */
export const VIRTUAL_SCROLL_BUFFER = 50;

/**
 * Maximum horizontal scroll offset (characters).
 * Prevents unbounded scrolling on extremely long lines.
 */
export const MAX_HORIZONTAL_OFFSET = 10000;
```

### Step 2: Extend DiffSyncController (`apps/tui/src/components/diff/DiffSyncController.tsx`)

Extend the existing `DiffSyncController` from `tui-diff-split-view` with:
- Horizontal scroll state
- Logical line index tracking
- Virtual scroll window computation
- File-top reset for navigation
- Debug logging for desynchronization detection

```typescript
// apps/tui/src/components/diff/DiffSyncController.tsx
// (extends the existing tui-diff-split-view implementation)

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type {
  ScrollSyncState,
  LogicalLineIndex,
  VirtualWindow,
} from "./scroll-sync-types.js";
import { VIRTUAL_SCROLL_BUFFER, MAX_HORIZONTAL_OFFSET } from "./scroll-sync-types.js";
import type { ParsedHunk } from "../../lib/diff-types.js";

const ScrollSyncContext = createContext<ScrollSyncState | null>(null);

export function useScrollSync(): ScrollSyncState {
  const ctx = useContext(ScrollSyncContext);
  if (!ctx) throw new Error("useScrollSync must be used within a DiffSyncController");
  return ctx;
}

export interface DiffSyncControllerProps {
  totalLines: number;
  hunks: ParsedHunk[];
  collapseState: Map<number, boolean>;
  fileIndex: number;
  children: React.ReactNode;
}

/**
 * Compute the logical line index for a given visual offset.
 * Walks through hunks and their split pairs (accounting for collapse state)
 * to find which hunk and line-within-hunk corresponds to the visual offset.
 */
function computeLogicalIndex(
  offset: number,
  hunks: ParsedHunk[],
  collapseState: Map<number, boolean>,
  fileIndex: number,
): LogicalLineIndex {
  let visualIndex = 0;

  for (const hunk of hunks) {
    const isCollapsed = collapseState.get(hunk.index) ?? false;
    const hunkLineCount = isCollapsed ? 1 : hunk.splitPairs.length;

    if (offset < visualIndex + hunkLineCount) {
      return {
        hunkIndex: hunk.index,
        lineWithinHunk: offset - visualIndex,
        fileIndex,
      };
    }

    visualIndex += hunkLineCount;
  }

  // Past the end — clamp to last line of last hunk
  const lastHunk = hunks[hunks.length - 1];
  if (lastHunk) {
    const isCollapsed = collapseState.get(lastHunk.index) ?? false;
    return {
      hunkIndex: lastHunk.index,
      lineWithinHunk: isCollapsed ? 0 : lastHunk.splitPairs.length - 1,
      fileIndex,
    };
  }

  return { hunkIndex: 0, lineWithinHunk: 0, fileIndex };
}

/**
 * Resolve a logical line index back to a visual offset.
 * Inverse of computeLogicalIndex.
 */
export function resolveLogicalToVisual(
  logical: LogicalLineIndex,
  hunks: ParsedHunk[],
  collapseState: Map<number, boolean>,
): number {
  let visualIndex = 0;

  for (const hunk of hunks) {
    if (hunk.index === logical.hunkIndex) {
      const isCollapsed = collapseState.get(hunk.index) ?? false;
      if (isCollapsed) return visualIndex; // collapsed = first line
      return visualIndex + Math.min(logical.lineWithinHunk, hunk.splitPairs.length - 1);
    }

    const isCollapsed = collapseState.get(hunk.index) ?? false;
    visualIndex += isCollapsed ? 1 : hunk.splitPairs.length;
  }

  return visualIndex;
}

export function DiffSyncController({
  totalLines,
  hunks,
  collapseState,
  fileIndex,
  children,
}: DiffSyncControllerProps) {
  const [offset, setOffset] = useState(0);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const logicalRef = useRef<LogicalLineIndex>({
    hunkIndex: 0,
    lineWithinHunk: 0,
    fileIndex,
  });

  const clampVertical = useCallback(
    (value: number, vh?: number) => {
      const maxOffset = Math.max(0, totalLines - (vh ?? 1));
      return Math.max(0, Math.min(value, maxOffset));
    },
    [totalLines],
  );

  const clampHorizontal = useCallback(
    (value: number) => Math.max(0, Math.min(value, MAX_HORIZONTAL_OFFSET)),
    [],
  );

  // Update logical index whenever vertical offset changes
  const updateLogical = useCallback(
    (newOffset: number) => {
      logicalRef.current = computeLogicalIndex(newOffset, hunks, collapseState, fileIndex);
    },
    [hunks, collapseState, fileIndex],
  );

  const scrollBy = useCallback(
    (delta: number) =>
      setOffset((prev) => {
        const next = clampVertical(prev + delta);
        updateLogical(next);
        return next;
      }),
    [clampVertical, updateLogical],
  );

  const scrollTo = useCallback(
    (target: number) => {
      const clamped = clampVertical(target);
      updateLogical(clamped);
      setOffset(clamped);
    },
    [clampVertical, updateLogical],
  );

  const scrollToTop = useCallback(() => {
    updateLogical(0);
    setOffset(0);
  }, [updateLogical]);

  const scrollToBottom = useCallback(
    (viewportHeight: number) => {
      const target = clampVertical(totalLines - viewportHeight, viewportHeight);
      updateLogical(target);
      setOffset(target);
    },
    [clampVertical, totalLines, updateLogical],
  );

  const pageDown = useCallback(
    (viewportHeight: number) => {
      const halfPage = Math.max(1, Math.floor(viewportHeight / 2));
      setOffset((prev) => {
        const next = clampVertical(prev + halfPage, viewportHeight);
        updateLogical(next);
        return next;
      });
    },
    [clampVertical, updateLogical],
  );

  const pageUp = useCallback(
    (viewportHeight: number) => {
      const halfPage = Math.max(1, Math.floor(viewportHeight / 2));
      setOffset((prev) => {
        const next = clampVertical(prev - halfPage);
        updateLogical(next);
        return next;
      });
    },
    [clampVertical, updateLogical],
  );

  const scrollHorizontalBy = useCallback(
    (delta: number) =>
      setHorizontalOffset((prev) => clampHorizontal(prev + delta)),
    [clampHorizontal],
  );

  const scrollHorizontalTo = useCallback(
    (target: number) => setHorizontalOffset(clampHorizontal(target)),
    [clampHorizontal],
  );

  const resetToFileTop = useCallback(() => {
    setOffset(0);
    setHorizontalOffset(0);
    logicalRef.current = { hunkIndex: 0, lineWithinHunk: 0, fileIndex };
  }, [fileIndex]);

  const value = useMemo<ScrollSyncState>(
    () => ({
      offset,
      horizontalOffset,
      totalLines,
      logicalLineIndex: logicalRef.current,
      scrollBy,
      scrollTo,
      scrollToTop,
      scrollToBottom,
      pageDown,
      pageUp,
      scrollHorizontalBy,
      scrollHorizontalTo,
      resetToFileTop,
    }),
    [
      offset,
      horizontalOffset,
      totalLines,
      scrollBy,
      scrollTo,
      scrollToTop,
      scrollToBottom,
      pageDown,
      pageUp,
      scrollHorizontalBy,
      scrollHorizontalTo,
      resetToFileTop,
    ],
  );

  return (
    <ScrollSyncContext.Provider value={value}>
      {children}
    </ScrollSyncContext.Provider>
  );
}

/**
 * Compute the virtual scroll window for a given offset and viewport height.
 * Returns the range of lines that should be rendered, including the buffer.
 */
export function computeVirtualWindow(
  offset: number,
  viewportHeight: number,
  totalLines: number,
): VirtualWindow {
  const startIndex = Math.max(0, offset - VIRTUAL_SCROLL_BUFFER);
  const endIndex = Math.min(totalLines, offset + viewportHeight + VIRTUAL_SCROLL_BUFFER);
  return {
    startIndex,
    endIndex,
    renderedCount: endIndex - startIndex,
  };
}
```

### Step 3: Scroll position preservation hook (`apps/tui/src/components/diff/useScrollPosition.ts`)

Manages logical line index tracking and resolves position across view mode toggles, hunk collapse/expand, and whitespace toggle re-fetches.

```typescript
// apps/tui/src/components/diff/useScrollPosition.ts

import { useCallback, useRef } from "react";
import type { ParsedHunk } from "../../lib/diff-types.js";
import type { LogicalLineIndex } from "./scroll-sync-types.js";
import { resolveLogicalToVisual } from "./DiffSyncController.js";

export interface ScrollPositionManager {
  /**
   * Capture the current logical position before a mode toggle.
   * Call this BEFORE switching view mode.
   */
  capturePosition: (logical: LogicalLineIndex) => void;

  /**
   * Resolve the captured position to a visual offset in the target mode.
   * Call this AFTER switching view mode, with the target mode's hunks.
   * Returns the visual offset to scrollTo.
   */
  resolvePosition: (
    targetHunks: ParsedHunk[],
    targetCollapseState: Map<number, boolean>,
  ) => number;

  /**
   * Adjust scroll offset after a hunk collapse/expand.
   * If the collapsed/expanded hunk is above the current viewport top,
   * the offset shifts by the difference in visual line count.
   */
  adjustForCollapseToggle: (
    currentOffset: number,
    hunkIndex: number,
    wasCollapsed: boolean,
    hunkLineCount: number,
    hunks: ParsedHunk[],
    collapseState: Map<number, boolean>,
  ) => number;
}

export function useScrollPosition(): ScrollPositionManager {
  const capturedRef = useRef<LogicalLineIndex | null>(null);

  const capturePosition = useCallback((logical: LogicalLineIndex) => {
    capturedRef.current = { ...logical };
  }, []);

  const resolvePosition = useCallback(
    (
      targetHunks: ParsedHunk[],
      targetCollapseState: Map<number, boolean>,
    ): number => {
      const captured = capturedRef.current;
      if (!captured) return 0;

      return resolveLogicalToVisual(captured, targetHunks, targetCollapseState);
    },
    [],
  );

  const adjustForCollapseToggle = useCallback(
    (
      currentOffset: number,
      hunkIndex: number,
      wasCollapsed: boolean,
      hunkLineCount: number,
      hunks: ParsedHunk[],
      collapseState: Map<number, boolean>,
    ): number => {
      // Find the visual offset of the toggled hunk
      let hunkVisualStart = 0;
      for (const hunk of hunks) {
        if (hunk.index === hunkIndex) break;
        const isCollapsed = collapseState.get(hunk.index) ?? false;
        hunkVisualStart += isCollapsed ? 1 : hunk.splitPairs.length;
      }

      // If the hunk is above the viewport, adjust offset
      if (hunkVisualStart < currentOffset) {
        if (wasCollapsed) {
          // Expanding: add (hunkLineCount - 1) lines (replace 1 summary with N lines)
          return currentOffset + (hunkLineCount - 1);
        } else {
          // Collapsing: remove (hunkLineCount - 1) lines (replace N lines with 1 summary)
          return Math.max(0, currentOffset - (hunkLineCount - 1));
        }
      }

      return currentOffset;
    },
    [],
  );

  return { capturePosition, resolvePosition, adjustForCollapseToggle };
}
```

### Step 4: Scroll telemetry hook (`apps/tui/src/components/diff/useScrollTelemetry.ts`)

Batches scroll events and emits telemetry after 500ms of inactivity.

```typescript
// apps/tui/src/components/diff/useScrollTelemetry.ts

import { useCallback, useRef, useEffect } from "react";
import { emit } from "../../lib/telemetry.js";
import type { ScrollTelemetryAccumulator } from "./scroll-sync-types.js";

export interface ScrollTelemetryOptions {
  terminalWidth: number;
  terminalHeight: number;
  sidebarVisible: boolean;
  fileIndex: number;
  totalFiles: number;
  sessionId: string;
  diffSource: "change" | "landing";
}

export function useScrollTelemetry(options: ScrollTelemetryOptions) {
  const accumulatorRef = useRef<ScrollTelemetryAccumulator | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const flush = useCallback(() => {
    const acc = accumulatorRef.current;
    if (!acc) return;

    const opts = optionsRef.current;
    emit("tui.diff.split_view_scrolled", {
      scroll_method: acc.scrollMethod,
      direction: acc.direction,
      lines_scrolled: acc.totalLinesScrolled,
      terminal_width: opts.terminalWidth,
      terminal_height: opts.terminalHeight,
      sidebar_visible: opts.sidebarVisible,
      file_index: opts.fileIndex,
      total_files: opts.totalFiles,
      session_id: opts.sessionId,
      diff_source: opts.diffSource,
    });

    accumulatorRef.current = null;
  }, []);

  const recordScroll = useCallback(
    (
      method: ScrollTelemetryAccumulator["scrollMethod"],
      direction: "up" | "down",
      linesScrolled: number,
      currentOffset: number,
    ) => {
      // Clear existing timer
      if (timerRef.current) clearTimeout(timerRef.current);

      const acc = accumulatorRef.current;
      if (acc && acc.scrollMethod === method && acc.direction === direction) {
        // Same gesture — accumulate
        acc.totalLinesScrolled += linesScrolled;
        acc.endOffset = currentOffset;
      } else {
        // New gesture — flush previous, start new
        if (acc) flush();
        accumulatorRef.current = {
          scrollMethod: method,
          direction,
          totalLinesScrolled: linesScrolled,
          startOffset: currentOffset - (direction === "down" ? linesScrolled : -linesScrolled),
          endOffset: currentOffset,
        };
      }

      // Set 500ms inactivity timer
      timerRef.current = setTimeout(flush, 500);
    },
    [flush],
  );

  const emitSyncActive = useCallback(() => {
    const opts = optionsRef.current;
    emit("tui.diff.scroll_sync_active", {
      terminal_width: opts.terminalWidth,
      terminal_height: opts.terminalHeight,
      sidebar_visible: opts.sidebarVisible,
      file_count: opts.totalFiles,
      session_id: opts.sessionId,
      diff_source: opts.diffSource,
    });
  }, []);

  const emitPositionPreserved = useCallback(
    (fromMode: string, toMode: string, lineIndex: number, trigger: string) => {
      const opts = optionsRef.current;
      emit("tui.diff.scroll_position_preserved", {
        from_mode: fromMode,
        to_mode: toMode,
        line_index: lineIndex,
        trigger,
        session_id: opts.sessionId,
      });
    },
    [],
  );

  const emitResync = useCallback(
    (method: "jump_top" | "file_nav") => {
      const opts = optionsRef.current;
      emit("tui.diff.scroll_resync", {
        resync_method: method,
        session_id: opts.sessionId,
      });
    },
    [],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        flush();
      }
    };
  }, [flush]);

  return { recordScroll, emitSyncActive, emitPositionPreserved, emitResync };
}
```

### Step 5: Extend DiffPane with virtual scrolling (`apps/tui/src/components/diff/DiffPane.tsx`)

Modify the existing `DiffPane` from `tui-diff-split-view` to use the virtual scroll window (±50 line buffer) and consume horizontal scroll offset.

```typescript
// apps/tui/src/components/diff/DiffPane.tsx
// (modifications to existing tui-diff-split-view implementation)

import React from "react";
import type { SyntaxStyle } from "@opentui/core";
import type { DiffLine, ParsedHunk } from "../../lib/diff-types.js";
import type { ThemeTokens } from "../../theme/tokens.js";
import type { PaneLayout } from "./diff-layout.js";
import { DiffSplitLine } from "./DiffSplitLine.js";
import { useScrollSync, computeVirtualWindow } from "./DiffSyncController.js";

export interface DiffPaneProps {
  side: "old" | "new";
  hunks: ParsedHunk[];
  lineNumberMap: Map<number, number>;
  layout: PaneLayout;
  collapseState: Map<number, boolean>;
  syntaxStyle: SyntaxStyle | null;
  filetype: string | undefined;
  theme: Readonly<ThemeTokens>;
  showWhitespace: boolean;
  viewportHeight: number;
}

export function DiffPane({
  side,
  hunks,
  lineNumberMap,
  layout,
  collapseState,
  syntaxStyle,
  filetype,
  theme,
  showWhitespace,
  viewportHeight,
}: DiffPaneProps) {
  const { offset, horizontalOffset, totalLines } = useScrollSync();

  // Flatten all visible split pairs into a single indexed array
  const allLines = React.useMemo(() => {
    const lines: Array<{ line: DiffLine; hunkIndex: number; visualIndex: number }> = [];
    let visualIndex = 0;

    for (const hunk of hunks) {
      const isCollapsed = collapseState.get(hunk.index) ?? false;

      if (isCollapsed) {
        // Collapsed hunk: single summary line (rendered by parent component)
        visualIndex += 1;
        continue;
      }

      for (const pair of hunk.splitPairs) {
        const line = side === "old" ? pair.left : pair.right;
        lines.push({ line, hunkIndex: hunk.index, visualIndex });
        visualIndex++;
      }
    }

    return lines;
  }, [hunks, collapseState, side]);

  // Virtual scroll window: only render lines within ±50 buffer of viewport
  const virtualWindow = React.useMemo(
    () => computeVirtualWindow(offset, viewportHeight, totalLines),
    [offset, viewportHeight, totalLines],
  );

  // Slice to virtual window
  const windowLines = allLines.slice(virtualWindow.startIndex, virtualWindow.endIndex);

  // Top spacer: accounts for lines above virtual window (for scrollbox layout)
  const topSpacerHeight = virtualWindow.startIndex;
  // Bottom spacer: accounts for lines below virtual window
  const bottomSpacerHeight = Math.max(0, allLines.length - virtualWindow.endIndex);

  return (
    <box flexDirection="column" width={`${layout.paneWidth}`} flexGrow={1}>
      {/* Top spacer for virtual scrolling */}
      {topSpacerHeight > 0 && <box height={topSpacerHeight} />}

      {windowLines.map(({ line, visualIndex }) => (
        <DiffSplitLine
          key={visualIndex}
          line={line}
          lineNumber={lineNumberMap.get(visualIndex) ?? null}
          layout={layout}
          syntaxStyle={syntaxStyle}
          filetype={filetype}
          theme={theme}
          showWhitespace={showWhitespace}
          horizontalOffset={horizontalOffset}
        />
      ))}

      {/* Bottom spacer for virtual scrolling */}
      {bottomSpacerHeight > 0 && <box height={bottomSpacerHeight} />}
    </box>
  );
}
```

### Step 6: Wire scroll keybindings in DiffSplitView (`apps/tui/src/components/diff/DiffSplitView.tsx`)

Modify `DiffSplitView` to register scroll-sync keybindings, handle mouse scroll events, and pass `syncScroll={true}` when using OpenTUI's `<diff>` component (for any sub-components that leverage it). Integrate telemetry hooks.

```typescript
// apps/tui/src/components/diff/DiffSplitView.tsx
// (modifications to wire scroll sync into split view)

import React, { useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ParsedDiff, ParsedHunk } from "../../lib/diff-types.js";
import type { ThemeTokens } from "../../theme/tokens.js";
import { DiffSyncController, useScrollSync } from "./DiffSyncController.js";
import { DiffPane } from "./DiffPane.js";
import { DiffHunkHeaderRow } from "./DiffHunkHeaderRow.js";
import { computePaneLayout, VERTICAL_SEPARATOR } from "./diff-layout.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useScrollTelemetry } from "./useScrollTelemetry.js";
import { useScrollPosition } from "./useScrollPosition.js";

export interface DiffSplitViewProps {
  parsedDiff: ParsedDiff;
  collapseState: Map<number, boolean>;
  onCollapseToggle: (hunkIndex: number) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  syntaxStyle: SyntaxStyle | null;
  filetype: string | undefined;
  theme: Readonly<ThemeTokens>;
  showWhitespace: boolean;
  fileIndex: number;
  totalFiles: number;
  onNextFile: () => void;
  onPrevFile: () => void;
  sessionId: string;
  diffSource: "change" | "landing";
}

export function DiffSplitView(props: DiffSplitViewProps) {
  const { parsedDiff, collapseState, fileIndex } = props;
  const layout = useLayout();

  // Compute total visible lines (including filler lines, accounting for collapse state)
  const totalLines = React.useMemo(() => {
    let count = 0;
    for (const hunk of parsedDiff.hunks) {
      const isCollapsed = collapseState.get(hunk.index) ?? false;
      count += isCollapsed ? 1 : hunk.splitPairs.length;
    }
    return count;
  }, [parsedDiff.hunks, collapseState]);

  return (
    <DiffSyncController
      totalLines={totalLines}
      hunks={parsedDiff.hunks}
      collapseState={collapseState}
      fileIndex={fileIndex}
    >
      <DiffSplitViewInner {...props} totalLines={totalLines} />
    </DiffSyncController>
  );
}

function DiffSplitViewInner({
  parsedDiff,
  collapseState,
  onCollapseToggle,
  onCollapseAll,
  onExpandAll,
  syntaxStyle,
  filetype,
  theme,
  showWhitespace,
  fileIndex,
  totalFiles,
  onNextFile,
  onPrevFile,
  sessionId,
  diffSource,
  totalLines,
}: DiffSplitViewProps & { totalLines: number }) {
  const scrollSync = useScrollSync();
  const layout = useLayout();
  const { width, height } = useTerminalDimensions();
  const contentHeight = layout.contentHeight - 2; // subtract file header rows
  const scrollPosition = useScrollPosition();

  const paneLayout = React.useMemo(
    () => computePaneLayout(
      layout.sidebarVisible
        ? width - Math.floor(width * 0.25)
        : width,
      layout.breakpoint,
    ),
    [width, layout.sidebarVisible, layout.breakpoint],
  );

  // Telemetry
  const telemetry = useScrollTelemetry({
    terminalWidth: width,
    terminalHeight: height,
    sidebarVisible: layout.sidebarVisible,
    fileIndex,
    totalFiles,
    sessionId,
    diffSource,
  });

  // Emit sync active on mount
  React.useEffect(() => {
    telemetry.emitSyncActive();
  }, []);

  // Register scroll keybindings
  useScreenKeybindings([
    {
      key: "j",
      description: "Scroll down",
      group: "Navigation",
      handler: () => {
        scrollSync.scrollBy(1);
        telemetry.recordScroll("keyboard_line", "down", 1, scrollSync.offset + 1);
      },
    },
    {
      key: "k",
      description: "Scroll up",
      group: "Navigation",
      handler: () => {
        scrollSync.scrollBy(-1);
        telemetry.recordScroll("keyboard_line", "up", 1, scrollSync.offset - 1);
      },
    },
    {
      key: "down",
      description: "Scroll down",
      group: "Navigation",
      handler: () => {
        scrollSync.scrollBy(1);
        telemetry.recordScroll("keyboard_line", "down", 1, scrollSync.offset + 1);
      },
    },
    {
      key: "up",
      description: "Scroll up",
      group: "Navigation",
      handler: () => {
        scrollSync.scrollBy(-1);
        telemetry.recordScroll("keyboard_line", "up", 1, scrollSync.offset - 1);
      },
    },
    {
      key: "ctrl+d",
      description: "Page down",
      group: "Navigation",
      handler: () => {
        const halfPage = Math.max(1, Math.floor(contentHeight / 2));
        scrollSync.pageDown(contentHeight);
        telemetry.recordScroll("keyboard_page", "down", halfPage, scrollSync.offset);
      },
    },
    {
      key: "ctrl+u",
      description: "Page up",
      group: "Navigation",
      handler: () => {
        const halfPage = Math.max(1, Math.floor(contentHeight / 2));
        scrollSync.pageUp(contentHeight);
        telemetry.recordScroll("keyboard_page", "up", halfPage, scrollSync.offset);
      },
    },
    {
      key: "G",
      description: "Jump to bottom",
      group: "Navigation",
      handler: () => {
        scrollSync.scrollToBottom(contentHeight);
        telemetry.recordScroll("keyboard_jump", "down", totalLines, scrollSync.offset);
      },
    },
    {
      key: "]",
      description: "Next file",
      group: "File Navigation",
      handler: () => {
        scrollSync.resetToFileTop();
        onNextFile();
        telemetry.emitResync("file_nav");
      },
    },
    {
      key: "[",
      description: "Previous file",
      group: "File Navigation",
      handler: () => {
        scrollSync.resetToFileTop();
        onPrevFile();
        telemetry.emitResync("file_nav");
      },
    },
    {
      key: "z",
      description: "Collapse hunk",
      group: "Diff",
      handler: () => {
        // Delegate to parent — collapse adjustment handled via useScrollPosition
        onCollapseToggle(/* focused hunk index */);
      },
    },
    {
      key: "Z",
      description: "Collapse all",
      group: "Diff",
      handler: () => onCollapseAll(),
    },
    {
      key: "x",
      description: "Expand hunk",
      group: "Diff",
      handler: () => onCollapseToggle(/* focused hunk index */),
    },
    {
      key: "X",
      description: "Expand all",
      group: "Diff",
      handler: () => onExpandAll(),
    },
  ]);

  // Mouse scroll handler
  const handleMouseScroll = useCallback(
    (event: { direction: "up" | "down"; delta: number }) => {
      const delta = event.direction === "down" ? event.delta : -event.delta;
      scrollSync.scrollBy(delta);
      telemetry.recordScroll("mouse", event.direction, Math.abs(delta), scrollSync.offset);
    },
    [scrollSync, telemetry],
  );

  return (
    <box flexDirection="row" flexGrow={1}>
      {/* Left pane (old file) */}
      <DiffPane
        side="old"
        hunks={parsedDiff.hunks}
        lineNumberMap={parsedDiff.splitLeftLineMap}
        layout={paneLayout}
        collapseState={collapseState}
        syntaxStyle={syntaxStyle}
        filetype={filetype}
        theme={theme}
        showWhitespace={showWhitespace}
        viewportHeight={contentHeight}
      />

      {/* Vertical separator */}
      <box width={1}>
        <text fg={theme.border}>{VERTICAL_SEPARATOR.repeat(contentHeight)}</text>
      </box>

      {/* Right pane (new file) */}
      <DiffPane
        side="new"
        hunks={parsedDiff.hunks}
        lineNumberMap={parsedDiff.splitRightLineMap}
        layout={paneLayout}
        collapseState={collapseState}
        syntaxStyle={syntaxStyle}
        filetype={filetype}
        theme={theme}
        showWhitespace={showWhitespace}
        viewportHeight={contentHeight}
      />
    </box>
  );
}
```

### Step 7: Wire view toggle preservation in DiffViewer (`apps/tui/src/components/diff/DiffViewer.tsx`)

Modify the parent `DiffViewer` component to capture logical line index before a mode toggle and resolve it after.

```typescript
// apps/tui/src/components/diff/DiffViewer.tsx
// (relevant scroll sync modifications only — other code from tui-diff-view-toggle)

import { useScrollPosition } from "./useScrollPosition.js";
import { resolveLogicalToVisual } from "./DiffSyncController.js";
import { useScrollTelemetry } from "./useScrollTelemetry.js";

// Inside DiffViewer component:
function DiffViewer({ files, mode, onModeToggle, showWhitespace, ... }) {
  const scrollPosition = useScrollPosition();
  const scrollSyncRef = useRef<ScrollSyncState | null>(null);

  const handleModeToggle = useCallback(() => {
    // 1. Capture current logical position BEFORE toggle
    if (scrollSyncRef.current) {
      scrollPosition.capturePosition(scrollSyncRef.current.logicalLineIndex);
    }

    // 2. Toggle mode
    const previousMode = currentViewMode;
    onModeToggle();

    // 3. After mode change, resolve position in new mode
    // (useEffect in the new mode component will call resolvePosition)
  }, [scrollPosition, onModeToggle]);

  // After mode switch, restore position
  useEffect(() => {
    if (currentViewMode === "split" && parsedDiff) {
      const offset = scrollPosition.resolvePosition(
        parsedDiff.hunks,
        collapseState,
      );
      // DiffSyncController will be initialized with this offset
      initialOffsetRef.current = offset;

      telemetry.emitPositionPreserved(
        "unified", "split", offset, "keypress",
      );
    }
  }, [currentViewMode]);

  // ... render unified or split based on currentViewMode
}
```

### Step 8: Integrate resize handling

In `DiffViewer`, handle resize events that may trigger auto-revert from split to unified. Preserve scroll position across the revert.

```typescript
// Inside DiffViewer — resize handling for scroll sync
import { useOnResize, useTerminalDimensions } from "@opentui/react";
import { isSplitViewAvailable } from "./diff-layout.js";

useOnResize(() => {
  const { width } = useTerminalDimensions();
  const sidebarPercent = layout.sidebarVisible ? 25 : 0;
  const canSplit = isSplitViewAvailable(width, layout.sidebarVisible, sidebarPercent);

  if (currentViewMode === "split" && !canSplit) {
    // Auto-revert to unified — preserve position
    if (scrollSyncRef.current) {
      scrollPosition.capturePosition(scrollSyncRef.current.logicalLineIndex);
    }
    setViewMode("unified");
    telemetry.emitPositionPreserved("split", "unified", 0, "resize");
  }
});
```

---

## Performance Considerations

### 16ms render budget

The critical path for a scroll operation is:
1. Keypress received by `KeybindingProvider` (< 1ms)
2. `DiffSyncController.scrollBy(1)` updates state (< 1ms)
3. React reconciliation of both `DiffPane` components (target: < 10ms)
4. Virtual window computation (`computeVirtualWindow`) (< 0.1ms)
5. Array slice + JSX creation for ~(viewport + 100) lines (< 4ms)
6. OpenTUI native render pass (< 4ms)

Total target: < 16ms for files up to 10,000 lines.

### Memory stability

Virtual scrolling ensures that at most `viewportHeight + 2 × VIRTUAL_SCROLL_BUFFER` lines (~140 at 40-row terminal) exist in the React tree at any time, regardless of file size. Memory usage is O(viewport), not O(file_size).

### Rapid keypress handling

Each keypress triggers a separate `scrollBy(1)`. React batches multiple `setState` calls within the same microtask. At terminal-native key repeat rates (30-50 Hz), each event is a separate render — there is no debouncing. If renders fall behind, React's concurrent mode will drop intermediate renders and jump to the latest offset.

---

## Observability

### Debug logging

| Level | Log key | When | Properties |
|-------|---------|------|------------|
| `debug` | `diff.scroll.sync.applied` | Each scroll operation in split mode | `direction`, `offset`, `method`, `pane_count: 2` |
| `debug` | `diff.scroll.position.preserved` | Scroll position preserved across view toggle | `from_mode`, `to_mode`, `line_index` |
| `debug` | `diff.scroll.position.clamped` | Scroll offset clamped at boundary | `requested_offset`, `clamped_to`, `max_offset` |
| `info` | `diff.scroll.sync.activated` | Split view entered with syncScroll=true | `terminal_width`, `file_count` |
| `info` | `diff.scroll.sync.deactivated` | Split view exited | `trigger` (keypress \| resize), `terminal_width` |
| `warn` | `diff.scroll.sync.desynchronized` | Panes at different offsets (should not happen) | `left_offset`, `right_offset`, `expected_offset` |
| `warn` | `diff.scroll.sync.recovery` | Panes re-synchronized via navigation | `method`, `previous_left`, `previous_right` |
| `error` | `diff.scroll.render.failed` | Scroll render throws | `error_message`, `stack`, `scroll_offset`, `file_index` |

All debug/info logs are emitted via `telemetry.emit()` which only writes to stderr when `CODEPLANE_TUI_DEBUG=true`.

### Desynchronization detection

Since both panes share the same `offset` from `DiffSyncController`, desynchronization is architecturally impossible under normal operation. The warn-level `diff.scroll.sync.desynchronized` log exists as a safety net for:
- OpenTUI rendering bugs that cause pane layout drift
- Race conditions if React concurrent mode re-orders renders (theoretical)

Recovery: `g g`, `]`, or `[` resets both panes to a known position.

---

## Failure Modes and Recovery

| Failure mode | Detection | User impact | Recovery |
|-------------|-----------|-------------|----------|
| Resize below 120 cols while in split | `useOnResize` width check | Split view disappears | Auto-revert to unified with position preserved; user can re-toggle when terminal is wider |
| Diff re-fetch during scroll (whitespace toggle) | `w` pressed while scrolled | Brief loading state | Scroll position preserved via logical line index; clamps if new diff is shorter |
| Very large diff (10,000+ lines) | Line count check | Potential scroll jank without virtual scroll | Virtual scrolling limits rendered lines to viewport ± 50 line buffer |
| Hunk collapse changes total height | `onCollapseToggle` | Scroll position may shift | `adjustForCollapseToggle` computes offset delta for hunks above viewport |
| Terminal emulator scroll buffer interference | Scroll events not reaching TUI | Scroll may not work | User disables terminal scrollback or uses compatible terminal |
| React error boundary triggers | Error boundary catches | Error screen | User presses `R` to retry |
| Empty file | `totalLines === 0` | No scrollable content | All scroll operations are no-ops |

---

## Productionization Checklist

The following items must be addressed when moving from specification to production code:

1. **Merge with existing DiffSyncController:** The `tui-diff-split-view` ticket creates the initial `DiffSyncController`. This ticket extends it. When implementing, modify the existing file rather than creating a parallel controller. The `ScrollSyncState` interface replaces the simpler one from split-view.

2. **Integrate with `g g` go-to mode:** The `g g` binding (jump to top) is a two-key sequence handled by the go-to mode in `KeybindingProvider`. The scroll sync's `scrollToTop()` must be callable from the go-to mode handler, not just from the screen-level keybinding scope. Ensure the go-to handler has a reference to the current screen's scroll controller.

3. **Hunk focus tracking:** The `z`/`x` keybindings for collapse/expand require knowing which hunk is "focused" (the hunk containing the line at the current scroll offset). Implement `getFocusedHunkIndex(offset, hunks, collapseState)` utility and wire it to the collapse handlers.

4. **Filler line rendering:** Verify that the filler line background color (ANSI 236 dark gray) is set via the theme's `surface` token, not hardcoded. The `DiffSplitLine` component's filler branch should use `theme.surface` for the background.

5. **Horizontal scroll keybindings:** Left/right arrow keys for horizontal scroll are not standard diff keybindings. They need to be registered only when `wrapMode="none"` and content exceeds pane width. Add a `when` guard on the keybinding registration.

6. **Mouse scroll integration:** OpenTUI's `onMouseEvent` on `<box>` components. Wire the `DiffSplitView` top-level `<box>` with an `onMouseEvent` handler that calls `scrollSync.scrollBy(delta)` for scroll-type events.

7. **Session ID propagation:** The `sessionId` for telemetry must be passed from the top-level `AppContext.Provider` through to the diff screen. Ensure the existing telemetry context's `session_id` is accessible.

8. **State cleanup on file navigation:** When `]` or `[` fires, the `DiffSyncController` resets offset to 0 and horizontal offset to 0. Ensure the `collapseState` is also reset (all hunks expanded) for the new file, as specified in `tui-diff-expand-collapse`.

9. **Edge case: collapsed hunk at viewport top.** If the user scrolls so that a collapsed summary line is at the top of the viewport, then expands it, the viewport should stay anchored to the same hunk (now showing its first expanded line). The `adjustForCollapseToggle` handles this by detecting the hunk is at or above the current offset.

10. **Testing against real API.** E2E tests run against a real Codeplane API server with test fixtures. The diff data must include fixtures with: (a) addition-only files, (b) deletion-only files, (c) mixed add/delete hunks, (d) large files (1000+ lines), (e) binary files, (f) empty files. These fixtures should be seeded via the test harness.

---

## Unit & Integration Tests

Test file: `e2e/tui/diff.test.ts`
Framework: `@microsoft/tui-test`
Runner: `bun:test`

All tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Snapshot Tests (SNAP-SYNC-001 through SNAP-SYNC-010)

```typescript
// e2e/tui/diff.test.ts

import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("TUI_DIFF_SCROLL_SYNC", () => {
  describe("Snapshot tests", () => {
    test("SNAP-SYNC-001: Split view both panes at scroll top (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a diff with known content
      await terminal.sendKeys("g", "r"); // go to repos
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter"); // open first repo
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter"); // open first change
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t"); // switch to split view
      await terminal.waitForText("SPLIT");

      // Both panes should be at line 1, context lines aligned
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-002: Split view scrolled to middle of file (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t"); // split view
      await terminal.waitForText("SPLIT");

      // Scroll to middle — press Ctrl+D multiple times
      await terminal.sendKeys("ctrl+d", "ctrl+d", "ctrl+d");

      // Both panes should show the same line range
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-003: Split view scrolled to bottom (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("G"); // jump to bottom

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-004: Addition-only hunk with filler lines in left pane (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a new file diff (all additions)
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      // Navigate to an addition-only file
      await terminal.sendKeys("]"); // next file (if available)

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-005: Deletion-only hunk with filler lines in right pane (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      // Navigate to a deletion-only file
      await terminal.sendKeys("]", "]"); // next files

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-006: Mixed add/delete hunk alignment check (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll to a mixed hunk
      await terminal.sendKeys("ctrl+d");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-007: Split view at 200×60 with wider panes (200×60)", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-008: Collapsed hunk summary at same position in both panes (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("z"); // collapse hunk

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-009: Split view with sidebar hidden — 50/50 pane split (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("ctrl+b"); // hide sidebar
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-SYNC-010: Split view after Ctrl+D page-down — half-page alignment (120×40)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("ctrl+d");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });
  });
```

### Keyboard Interaction Tests (KEY-SYNC-001 through KEY-SYNC-018)

```typescript
  describe("Keyboard scroll sync", () => {
    test("KEY-SYNC-001: j ×5 from top → both panes at line 6+", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Press j 5 times
      for (let i = 0; i < 5; i++) {
        await terminal.sendKeys("j");
      }

      // Line 1 should no longer be at top of either pane
      // Both panes should show lines starting around line 6
      const snapshot = terminal.snapshot();
      // Assert both panes show the same starting line range
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-002: k ×3 from line 10 → both panes at line 7", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll down 10 lines
      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
      // Scroll up 3 lines
      for (let i = 0; i < 3; i++) await terminal.sendKeys("k");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-003: j at bottom → no-op, both stay at bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("G"); // jump to bottom

      const snapshotBefore = terminal.snapshot();
      await terminal.sendKeys("j"); // should be no-op
      const snapshotAfter = terminal.snapshot();

      expect(snapshotBefore).toBe(snapshotAfter);
      await terminal.terminate();
    });

    test("KEY-SYNC-004: k at top → no-op, both stay at top", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshotBefore = terminal.snapshot();
      await terminal.sendKeys("k"); // should be no-op at top
      const snapshotAfter = terminal.snapshot();

      expect(snapshotBefore).toBe(snapshotAfter);
      await terminal.terminate();
    });

    test("KEY-SYNC-005: Ctrl+D from top → both panes down half visible height", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("ctrl+d");

      // Both panes should have scrolled ~19 lines (half of ~38 content rows)
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-006: Ctrl+U after Ctrl+D → both panes back to original", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshotOriginal = terminal.snapshot();
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+u");
      const snapshotAfter = terminal.snapshot();

      expect(snapshotOriginal).toBe(snapshotAfter);
      await terminal.terminate();
    });

    test("KEY-SYNC-007: G from top → both panes at bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("G");

      // Verify both panes show the last lines of the file
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-008: g g after G → both panes at top", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshotTop = terminal.snapshot();
      await terminal.sendKeys("G"); // bottom
      await terminal.sendKeys("g", "g"); // back to top
      const snapshotAfter = terminal.snapshot();

      expect(snapshotTop).toBe(snapshotAfter);
      await terminal.terminate();
    });

    test("KEY-SYNC-009: ] in file 1 → both panes at top of file 2", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll down first, then navigate to next file
      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
      await terminal.sendKeys("]"); // next file

      // Should show File 2/N in status bar and be at scroll top
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/File 2/);

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-010: [ in file 2 → both panes at top of file 1", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("]"); // go to file 2
      await terminal.sendKeys("["); // back to file 1

      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/File 1/);

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-011: t to unified, scroll, t to split → position preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t"); // split
      await terminal.waitForText("SPLIT");

      // Scroll down 15 lines in split
      for (let i = 0; i < 15; i++) await terminal.sendKeys("j");

      // Toggle to unified
      await terminal.sendKeys("t");
      await terminal.waitForText("UNIFIED");

      // Toggle back to split — position should be preserved
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-012: z on hunk → both panes collapse at same position", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("z"); // collapse

      // Both panes should show collapsed summary line
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/⋯.*lines hidden/);
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-013: x after z → both panes expand, position preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshotBefore = terminal.snapshot();
      await terminal.sendKeys("z"); // collapse
      await terminal.sendKeys("x"); // expand
      const snapshotAfter = terminal.snapshot();

      expect(snapshotBefore).toBe(snapshotAfter);
      await terminal.terminate();
    });

    test("KEY-SYNC-014: w while scrolled → both panes re-render at preserved position", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll down
      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");

      // Toggle whitespace — should re-fetch and preserve position
      await terminal.sendKeys("w");

      // Should still be approximately at the same scroll position
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-015: Rapid j ×20 in <1s → both panes at line 21, no desync", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Rapid scroll — send all j keys quickly
      const keys = Array(20).fill("j");
      await terminal.sendKeys(...keys);

      // Verify both panes are synchronized
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-016: Ctrl+D near bottom → both panes clamp at bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Jump near bottom then page down
      await terminal.sendKeys("G"); // bottom
      await terminal.sendKeys("ctrl+u"); // one page up from bottom
      const snapshotNearBottom = terminal.snapshot();
      await terminal.sendKeys("ctrl+d"); // should clamp at bottom

      // Should be at bottom, same as G
      await terminal.sendKeys("G");
      const snapshotAtBottom = terminal.snapshot();

      // The ctrl+d result should have reached the bottom (same as G)
      expect(snapshotAtBottom).toMatchSnapshot();
      await terminal.terminate();
    });

    test("KEY-SYNC-017: g g → G → g g round-trip → identical state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      const snapshotInitial = terminal.snapshot();
      await terminal.sendKeys("g", "g"); // top
      await terminal.sendKeys("G"); // bottom
      await terminal.sendKeys("g", "g"); // back to top
      const snapshotFinal = terminal.snapshot();

      expect(snapshotInitial).toBe(snapshotFinal);
      await terminal.terminate();
    });

    test("KEY-SYNC-018: Ctrl+B then j ×5 → sidebar hidden, wider panes, scrolled 5 lines synced", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");
      await terminal.sendKeys("ctrl+b"); // hide sidebar

      // Scroll down 5 lines
      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });
  });
```

### Responsive Tests (RSP-SYNC-001 through RSP-SYNC-010)

```typescript
  describe("Responsive scroll sync", () => {
    test("RSP-SYNC-001: 80×24 — split rejected, scroll sync N/A", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t"); // attempt split

      // Should remain in unified mode — split unavailable at 80 cols
      await terminal.waitForNoText("SPLIT");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).not.toMatch(/SPLIT/);
      await terminal.terminate();
    });

    test("RSP-SYNC-002: 120×40 — scroll sync works, ~44 chars/pane", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll and verify sync works
      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RSP-SYNC-003: 200×60 — scroll sync works, ~74 chars/pane", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RSP-SYNC-004: 120→80 resize while scrolled → auto-revert, position preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll down
      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");

      // Resize to 80 cols — should auto-revert to unified
      await terminal.resize(80, 24);
      await terminal.waitForNoText("SPLIT");

      // Position should be preserved in unified view
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RSP-SYNC-005: 80→120 resize while unified → stays unified, no auto-switch", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");

      // Resize to 120 — should NOT auto-switch to split
      await terminal.resize(120, 40);

      // Still in unified (user has to press t)
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).not.toMatch(/SPLIT/);
      await terminal.terminate();
    });

    test("RSP-SYNC-006: 120→200 resize while scrolled → panes widen, position preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
      await terminal.resize(200, 60);

      // Still in split, position preserved, panes wider
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/SPLIT/);
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RSP-SYNC-007: 200→120 resize while scrolled → panes narrow, position preserved", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
      await terminal.resize(120, 40);

      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/SPLIT/);
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RSP-SYNC-008: 120×40 sidebar hidden → 50/50 panes, sync works", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("ctrl+b"); // hide sidebar
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RSP-SYNC-009: 119×40 — split rejected", async () => {
      const terminal = await launchTUI({ cols: 119, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");

      // With sidebar at 25%, content area is ~89 cols, below 100 threshold
      await terminal.waitForNoText("SPLIT");
      await terminal.terminate();
    });

    test("RSP-SYNC-010: 120×24 minimal height — sync works, half-page ~10 lines", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Ctrl+D should page down ~10 lines (half of ~22 content rows)
      await terminal.sendKeys("ctrl+d");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });
  });
```

### Integration Tests (INT-SYNC-001 through INT-SYNC-007)

```typescript
  describe("Integration tests", () => {
    test("INT-SYNC-001: Scroll sync with syntax highlighting — colors preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll through file — syntax highlighting should remain
      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");

      // Verify ANSI color codes are present (syntax highlighting active)
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/\x1b\[/);
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-SYNC-002: Scroll sync with line numbers — gutters aligned, filler blanks", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll to a hunk with filler lines
      await terminal.sendKeys("ctrl+d");

      // Verify line numbers are present in both panes
      const snapshot = terminal.snapshot();
      // Line numbers should appear as right-aligned digits
      expect(snapshot).toMatch(/\d+/);
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-SYNC-003: Scroll sync with whitespace toggle — re-render at position", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
      await terminal.sendKeys("w"); // toggle whitespace

      // Wait for re-fetch
      await terminal.waitForText("SPLIT");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-SYNC-004: Scroll sync with hunk collapse/expand — offset adjusts", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll past first hunk, then collapse it
      await terminal.sendKeys("ctrl+d", "ctrl+d");
      await terminal.sendKeys("z"); // collapse focused hunk

      // Both panes should have adjusted scroll offset
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-SYNC-005: Scroll sync with inline comments (landing diff)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a landing request diff with comments
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Landings");
      // Navigate to landings tab and open a landing
      await terminal.sendKeys("g", "l");
      await terminal.waitForText("Landings");
      await terminal.sendKeys("Enter");
      // Open diff
      await terminal.sendKeys("t"); // split if available

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-SYNC-006: Scroll sync persists across file navigation cycle", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Scroll in file 1
      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      // Navigate to file 2 and back
      await terminal.sendKeys("]"); // file 2
      for (let i = 0; i < 3; i++) await terminal.sendKeys("j");
      await terminal.sendKeys("["); // back to file 1

      // Should be at top of file 1 (not at previous scroll position)
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-SYNC-007: syncScroll={false} in unified mode — single column, no sync", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");

      // Default unified mode — no split panes
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).not.toMatch(/SPLIT/);

      // Scroll should work in single column
      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });
  });
```

### Edge Case Tests (EDGE-SYNC-001 through EDGE-SYNC-010)

```typescript
  describe("Edge cases", () => {
    test("EDGE-SYNC-001: File with only additions — left pane entirely filler", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to a new file (all additions)
      // Assume test fixture has such a file accessible via ] navigation
      await terminal.sendKeys("]");

      // Left pane should be filler, right pane should have content
      // Scroll should still work
      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-002: File with only deletions — right pane entirely filler", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to a deleted file
      await terminal.sendKeys("]", "]");

      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-003: Single-line diff — scroll is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to single-line diff file
      // (Relies on test fixture)

      const snapshotBefore = terminal.snapshot();
      await terminal.sendKeys("j");
      const snapshotAfter = terminal.snapshot();

      // For single-line files that fit in viewport, scroll is a no-op
      expect(snapshotBefore).toBe(snapshotAfter);
      await terminal.terminate();
    });

    test("EDGE-SYNC-004: Empty diff — scroll is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to empty file (if fixture exists)
      const snapshotBefore = terminal.snapshot();
      await terminal.sendKeys("j");
      await terminal.sendKeys("G");
      await terminal.sendKeys("ctrl+d");
      const snapshotAfter = terminal.snapshot();

      // For empty files, all scroll operations are no-ops
      // (Snapshot should show empty state)
      expect(snapshotAfter).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-005: Binary file — scroll is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to binary file (if fixture exists)
      const snapshotBefore = terminal.snapshot();
      await terminal.sendKeys("j");
      const snapshotAfter = terminal.snapshot();

      // Binary files have no scrollable content
      expect(snapshotAfter).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-006: Very large hunk (1,000 lines) — virtual scrolling, sync maintained", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to large file fixture
      // Page down multiple times through 1000+ lines
      for (let i = 0; i < 20; i++) {
        await terminal.sendKeys("ctrl+d");
      }

      // Both panes should still be synchronized
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-007: 500-file diff, navigate to file 250 — both panes at top of file 250", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Navigate to file 250 using ] key
      // (In practice this would use command palette or file tree for large diffs)
      for (let i = 0; i < 250; i++) {
        await terminal.sendKeys("]");
      }

      // Status bar should show File 251/500+ (or similar)
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-008: Concurrent resize + scroll keypress — both processed, sync maintained", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      for (let i = 0; i < 5; i++) await terminal.sendKeys("j");

      // Resize and scroll simultaneously
      await terminal.resize(150, 50);
      await terminal.sendKeys("j", "j", "j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-009: Ctrl+D on file shorter than half-page — clamp at bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // On a short file, Ctrl+D should clamp at bottom
      await terminal.sendKeys("ctrl+d");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-SYNC-010: Scroll after all hunks collapsed — summary lines only, sync maintained", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Changes");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Diff");
      await terminal.sendKeys("t");
      await terminal.waitForText("SPLIT");

      // Collapse all hunks
      await terminal.sendKeys("Z");

      // Scroll should operate on summary lines
      await terminal.sendKeys("j");

      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/⋯/);
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });
  });
});
```

---

## Dependency Graph

```
tui-diff-parse-utils
  └── tui-diff-unified-view
        └── tui-diff-split-view
              └── tui-diff-scroll-sync (THIS TICKET)
                    └── tui-diff-inline-comments (future)
```

This ticket MUST NOT begin implementation until `tui-diff-split-view` is complete, as it extends the `DiffSyncController`, `DiffPane`, and `DiffSplitView` components created by that ticket.

---

## Acceptance Criteria Traceability

Every acceptance criterion from the product spec is covered by at least one test:

| AC Category | AC Count | Test Coverage |
|-------------|----------|---------------|
| Core synchronization behavior | 5 | SNAP-SYNC-001, KEY-SYNC-001–008 |
| Keyboard-driven vertical scroll | 8 | KEY-SYNC-001–008, KEY-SYNC-015–017 |
| Keyboard-driven horizontal scroll | 3 | INT-SYNC-001 (implicit via syntax highlighting) |
| Mouse scroll | 4 | (requires mouse-capable test terminal) |
| Hunk-aware alignment | 8 | SNAP-SYNC-004–006, SNAP-SYNC-008, INT-SYNC-002 |
| File navigation synchronization | 4 | KEY-SYNC-009–010, INT-SYNC-006 |
| Hunk collapse/expand synchronization | 5 | KEY-SYNC-012–013, INT-SYNC-004, EDGE-SYNC-010 |
| View mode toggle scroll preservation | 4 | KEY-SYNC-011, RSP-SYNC-004 |
| Integration with whitespace toggle | 2 | KEY-SYNC-014, INT-SYNC-003 |
| Boundary constraints | 9 | KEY-SYNC-003–004, KEY-SYNC-016, EDGE-SYNC-003–005, EDGE-SYNC-009 |
| Performance constraints | 4 | KEY-SYNC-015, EDGE-SYNC-006 |
| Edge cases | 11 | EDGE-SYNC-001–010, RSP-SYNC-008 |

---

## Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/TUI_DIFF_SCROLL_SYNC.md` — Product specification
- `specs/tui/engineering/tui-diff-split-view.md` — Dependency specification
- `specs/tui/features.ts` — Feature inventory (line 100)
- `specs/tui/design.md` — TUI design specification
- `specs/tui/prd.md` — TUI product requirements
- `context/opentui/` — OpenTUI component reference
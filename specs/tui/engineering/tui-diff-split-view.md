# Engineering Specification: tui-diff-split-view

**Ticket:** tui-diff-split-view
**Title:** TUI_DIFF_SPLIT_VIEW: Side-by-side old/new comparison panes
**Status:** Not started
**Dependencies:** tui-diff-unified-view, tui-diff-parse-utils
**Downstream consumers:** tui-diff-inline-comments (future)

---

## Overview

This ticket implements the split (side-by-side) diff view for the Codeplane TUI. The split view renders two synchronized panes — left showing old file content (deletions in red) and right showing new file content (additions in green) — separated by a vertical border character. It is the visual counterpart to the unified diff view, toggled via the `t` key.

The implementation builds directly on the `parseDiffHunks()` utility (from `tui-diff-parse-utils`) which already produces `SplitLinePair[]` arrays with filler-line insertion for vertical alignment. The split view consumes these pre-computed pairs and renders them as two coordinated `<scrollbox>` panes within a `<box flexDirection="row">` container.

---

## Target Files

| File | Purpose | New/Modified |
|------|---------|-------------|
| `apps/tui/src/components/diff/DiffSplitView.tsx` | Top-level split view component | **New** |
| `apps/tui/src/components/diff/DiffPane.tsx` | Single pane renderer (old or new side) | **New** |
| `apps/tui/src/components/diff/DiffHunkHeaderRow.tsx` | Hunk header spanning both panes | **New** |
| `apps/tui/src/components/diff/DiffSplitLine.tsx` | Single line within a pane (line number + content) | **New** |
| `apps/tui/src/components/diff/DiffSyncController.tsx` | Scroll synchronization context provider | **New** |
| `apps/tui/src/components/diff/DiffViewer.tsx` | Parent component orchestrating unified/split toggle | **Modified** |
| `apps/tui/src/components/diff/diff-layout.ts` | Layout computation utilities for pane widths | **New** |
| `apps/tui/src/components/diff/index.ts` | Barrel export for diff components | **Modified** |
| `e2e/tui/diff.test.ts` | E2E test specifications | **Modified** |

---

## Architectural Decisions

### AD-1: Custom pane rendering vs OpenTUI's `<diff view="split">`

**Decision:** Use custom pane rendering with `<box>`, `<scrollbox>`, `<text>`, and `<code>` instead of OpenTUI's built-in `<diff view="split">`.

**Rationale:**
1. OpenTUI's `<diff>` component accepts a raw unified diff string and handles parsing internally. The TUI's diff pipeline needs to intercept the parsed data to support expand/collapse state, line number mapping via `splitLeftLineMap`/`splitRightLineMap`, and filler-line insertion via `buildSplitPairs()` — all of which are already computed by `parseDiffHunks()`.
2. Hunk headers must span the full width across both panes as a single row, which requires rendering outside the individual pane scrollboxes.
3. Scroll synchronization must be coordinated with the collapse/expand state machine and the TUI's keybinding system (`j`/`k` dispatched through `KeybindingProvider`), not through the `<diff>` component's internal scroll.
4. Inline comment anchoring (future `tui-diff-inline-comments`) requires per-line identity that OpenTUI's internal rendering does not expose.

**Trade-off:** More implementation work, but full control over rendering, state, and keybinding integration.

### AD-2: Shared `scrollOffset` ref for synchronization

**Decision:** Scroll position is stored as a React ref (`useRef<number>`) managed by `DiffSyncController`. Both panes read the same offset. Key events (`j`/`k`/`Ctrl+D`/`Ctrl+U`/`G`/`g g`) update the shared offset, which triggers a re-render of both panes.

**Rationale:** Using a ref avoids double-render on scroll (ref mutation → explicit setState for render). The controller exposes `scrollTo(offset)` and `scrollBy(delta)` methods that both update the ref and trigger a single batched render.

### AD-3: Filler lines from parse layer, not render layer

**Decision:** Filler lines are inserted by `buildSplitPairs()` at parse time, not at render time.

**Rationale:** The parse layer (from `tui-diff-parse-utils`) already produces `SplitLinePair[]` with filler lines inserted to maintain vertical alignment. Each `ParsedHunk.splitPairs` entry has `left` and `right` `DiffLine` objects where one side may be `type: "filler"`. This means the render layer receives pre-aligned arrays of equal length, eliminating alignment logic in the component tree.

### AD-4: Syntax highlighting via `<code>` per-line blocks

**Decision:** Each non-filler line renders its content via OpenTUI's `<code>` component with `filetype` and `syntaxStyle` props for Tree-sitter highlighting. Filler lines render as empty `<text>` with the appropriate background.

**Rationale:** OpenTUI's `<code>` component integrates with Tree-sitter for incremental highlighting. Using it per-line (with the line's content as a single-line string) leverages the existing highlighting pipeline and the `useDiffSyntaxStyle()` hook. The `syntaxStyle` is created once per diff screen lifecycle and shared across all lines.

**Performance note:** Per-line `<code>` instances have overhead. For files with >1000 visible lines, this is mitigated by `<scrollbox viewportCulling={true}>` which only renders lines within the visible viewport.

---

## Data Flow

```
FileDiffItem.patch (unified diff string from API)
  │
  ▼
parseDiffHunks(patch) → ParsedDiff
  │
  ├── hunks[i].lines → DiffLine[] (for unified view)
  ├── hunks[i].splitPairs → SplitLinePair[] (for split view) ◄── THIS TICKET
  ├── splitLeftLineMap → Map<visualIndex, oldLineNumber>
  └── splitRightLineMap → Map<visualIndex, newLineNumber>
  │
  ▼
<DiffSplitView>
  ├── <DiffHunkHeaderRow> (per hunk, spans full width)
  └── <box flexDirection="row">
      ├── <DiffPane side="old"> (left, from pair.left)
      │   └── <DiffSplitLine> per pair.left
      ├── <text>│</text> (vertical separator)
      └── <DiffPane side="new"> (right, from pair.right)
          └── <DiffSplitLine> per pair.right
```

### Input Types (from `apps/tui/src/lib/diff-types.ts`)

```typescript
// Already defined in tui-diff-parse-utils
interface SplitLinePair {
  left: DiffLine;   // old file side: type is "remove", "context", or "filler"
  right: DiffLine;  // new file side: type is "add", "context", or "filler"
}

interface DiffLine {
  content: string;
  type: DiffLineType; // "context" | "add" | "remove" | "filler"
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

interface ParsedHunk {
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  scopeName: string | null;
  lines: DiffLine[];
  splitPairs: SplitLinePair[];
  totalLineCount: number;
}
```

---

## Implementation Plan

### Step 1: Layout computation utilities (`apps/tui/src/components/diff/diff-layout.ts`)

Create pure functions that compute pane widths based on terminal dimensions and sidebar visibility. These are consumed by `DiffSplitView` and `DiffViewer` for layout decisions.

```typescript
// apps/tui/src/components/diff/diff-layout.ts

import type { Breakpoint } from "../../types/breakpoint.js";

/**
 * Minimum content-area columns required for split view.
 * Below this, split view is disabled and `t` shows a warning.
 *
 * Derivation: 2 panes × (4-digit line number gutter + 1 space + 40 chars content min)
 *   + 1 char vertical separator = 2 × 45 + 1 = 91 ≈ rounded to 100 for readability.
 * With sidebar at 25%, terminal needs 100 / 0.75 ≈ 134 cols.
 * Without sidebar, 100 cols content means 100 + 2 (border) = ~102 terminal cols.
 * We use 100 cols content area as the threshold, which maps to:
 *   - No sidebar: terminal ≥ ~102 cols (we round to 100 content area)
 *   - With sidebar at 25%: terminal ≥ ~134 cols
 */
export const SPLIT_VIEW_MIN_CONTENT_COLS = 100;

/**
 * Compute whether split view is available at the current terminal width.
 */
export function isSplitViewAvailable(
  terminalCols: number,
  sidebarVisible: boolean,
  sidebarWidthPercent: number, // e.g., 25 or 30
): boolean {
  const sidebarCols = sidebarVisible
    ? Math.floor(terminalCols * (sidebarWidthPercent / 100))
    : 0;
  const contentCols = terminalCols - sidebarCols;
  return contentCols >= SPLIT_VIEW_MIN_CONTENT_COLS;
}

/**
 * Separator character: BOX DRAWINGS LIGHT VERTICAL (U+2502).
 * 1 column wide. Rendered between left and right panes.
 */
export const VERTICAL_SEPARATOR = "│";

export interface PaneLayout {
  /** Width of each pane in columns */
  paneWidth: number;
  /** Number of columns for the line number gutter */
  gutterWidth: number;
  /** Number of columns for line content */
  contentWidth: number;
}

/**
 * Compute pane dimensions given available content columns.
 *
 * Layout: [gutter | content] │ [gutter | content]
 *   - 1 col for vertical separator
 *   - Remaining split 50/50 between left and right panes
 *   - Each pane: gutterWidth + 1 space + contentWidth
 */
export function computePaneLayout(
  contentCols: number,
  breakpoint: Breakpoint | null,
): PaneLayout {
  // 1 col for separator
  const availableForPanes = contentCols - 1;
  const paneWidth = Math.floor(availableForPanes / 2);

  // Gutter width: 4 digits at minimum/standard, 6 at large
  const gutterWidth = breakpoint === "large" ? 6 : 4;

  // 1 space separator between gutter and content
  const contentWidth = Math.max(1, paneWidth - gutterWidth - 1);

  return { paneWidth, gutterWidth, contentWidth };
}

/**
 * Compute the content area columns available for diff rendering.
 * Subtracts sidebar width from terminal width.
 */
export function getContentAreaCols(
  terminalCols: number,
  sidebarVisible: boolean,
  sidebarWidthPercent: number,
): number {
  const sidebarCols = sidebarVisible
    ? Math.floor(terminalCols * (sidebarWidthPercent / 100))
    : 0;
  return terminalCols - sidebarCols;
}
```

### Step 2: Scroll synchronization controller (`apps/tui/src/components/diff/DiffSyncController.tsx`)

Create a React context provider that manages synchronized scroll state for both panes.

```typescript
// apps/tui/src/components/diff/DiffSyncController.tsx

import React, { createContext, useContext, useRef, useState, useCallback, useMemo } from "react";

export interface ScrollSyncState {
  /** Current scroll offset (line index, 0-based) */
  offset: number;
  /** Total number of visual lines across all expanded hunks */
  totalLines: number;
  /** Scroll by a delta (positive = down, negative = up) */
  scrollBy: (delta: number) => void;
  /** Scroll to an absolute line offset */
  scrollTo: (offset: number) => void;
  /** Jump to top (offset = 0) */
  scrollToTop: () => void;
  /** Jump to bottom (offset = totalLines - viewportHeight) */
  scrollToBottom: (viewportHeight: number) => void;
  /** Page down by half viewport height */
  pageDown: (viewportHeight: number) => void;
  /** Page up by half viewport height */
  pageUp: (viewportHeight: number) => void;
}

const ScrollSyncContext = createContext<ScrollSyncState | null>(null);

export function useScrollSync(): ScrollSyncState {
  const ctx = useContext(ScrollSyncContext);
  if (!ctx) throw new Error("useScrollSync must be used within a DiffSyncController");
  return ctx;
}

export interface DiffSyncControllerProps {
  totalLines: number;
  children: React.ReactNode;
}

export function DiffSyncController({ totalLines, children }: DiffSyncControllerProps) {
  const [offset, setOffset] = useState(0);

  const clamp = useCallback(
    (value: number) => Math.max(0, Math.min(value, Math.max(0, totalLines - 1))),
    [totalLines],
  );

  const scrollBy = useCallback(
    (delta: number) => setOffset((prev) => clamp(prev + delta)),
    [clamp],
  );

  const scrollTo = useCallback(
    (target: number) => setOffset(clamp(target)),
    [clamp],
  );

  const scrollToTop = useCallback(() => setOffset(0), []);

  const scrollToBottom = useCallback(
    (viewportHeight: number) => setOffset(clamp(totalLines - viewportHeight)),
    [clamp, totalLines],
  );

  const pageDown = useCallback(
    (viewportHeight: number) => {
      const halfPage = Math.max(1, Math.floor(viewportHeight / 2));
      setOffset((prev) => clamp(prev + halfPage));
    },
    [clamp],
  );

  const pageUp = useCallback(
    (viewportHeight: number) => {
      const halfPage = Math.max(1, Math.floor(viewportHeight / 2));
      setOffset((prev) => clamp(prev - halfPage));
    },
    [clamp],
  );

  const value = useMemo(
    () => ({ offset, totalLines, scrollBy, scrollTo, scrollToTop, scrollToBottom, pageDown, pageUp }),
    [offset, totalLines, scrollBy, scrollTo, scrollToTop, scrollToBottom, pageDown, pageUp],
  );

  return (
    <ScrollSyncContext.Provider value={value}>
      {children}
    </ScrollSyncContext.Provider>
  );
}
```

### Step 3: Single diff line component (`apps/tui/src/components/diff/DiffSplitLine.tsx`)

Render a single line within one pane: line number gutter + content area.

```typescript
// apps/tui/src/components/diff/DiffSplitLine.tsx

import React from "react";
import type { RGBA, SyntaxStyle } from "@opentui/core";
import type { DiffLine } from "../../lib/diff-types.js";
import type { PaneLayout } from "./diff-layout.js";

export interface DiffSplitLineProps {
  line: DiffLine;
  lineNumber: number | null;
  layout: PaneLayout;
  syntaxStyle: SyntaxStyle | null;
  filetype: string | undefined;
  theme: {
    diffAddedBg: RGBA;
    diffRemovedBg: RGBA;
    diffAddedText: RGBA;
    diffRemovedText: RGBA;
    muted: RGBA;
  };
  showWhitespace: boolean;
}

export function DiffSplitLine({
  line,
  lineNumber,
  layout,
  syntaxStyle,
  filetype,
  theme,
  showWhitespace,
}: DiffSplitLineProps) {
  const { gutterWidth } = layout;

  // Determine colors based on line type
  const bgColor = resolveLineBg(line.type, theme);
  const gutterText =
    lineNumber !== null
      ? String(lineNumber).padStart(gutterWidth)
      : " ".repeat(gutterWidth);

  // Whitespace visualization
  const displayContent = showWhitespace
    ? line.content.replace(/ /g, "·").replace(/\t/g, "→   ")
    : line.content;

  if (line.type === "filler") {
    // Filler lines render as empty rows with muted background
    return (
      <box flexDirection="row" width="100%">
        <text fg={theme.muted}>{" ".repeat(gutterWidth)} </text>
        <text> </text>
      </box>
    );
  }

  return (
    <box flexDirection="row" width="100%" backgroundColor={bgColor}>
      <text fg={theme.muted}>{gutterText} </text>
      {syntaxStyle && filetype ? (
        <code
          content={displayContent}
          filetype={filetype}
          syntaxStyle={syntaxStyle}
          flexGrow={1}
        />
      ) : (
        <text fg={resolveLineFg(line.type, theme)}>{displayContent}</text>
      )}
    </box>
  );
}

function resolveLineBg(
  type: DiffLine["type"],
  theme: DiffSplitLineProps["theme"],
): RGBA | undefined {
  switch (type) {
    case "add":    return theme.diffAddedBg;
    case "remove": return theme.diffRemovedBg;
    default:       return undefined;
  }
}

function resolveLineFg(
  type: DiffLine["type"],
  theme: DiffSplitLineProps["theme"],
): RGBA | undefined {
  switch (type) {
    case "add":    return theme.diffAddedText;
    case "remove": return theme.diffRemovedText;
    default:       return undefined;
  }
}
```

### Step 4: Single pane component (`apps/tui/src/components/diff/DiffPane.tsx`)

Render one side of the split view (left/old or right/new). Receives the pre-aligned line array from `SplitLinePair` and the line number map from `ParsedDiff`.

```typescript
// apps/tui/src/components/diff/DiffPane.tsx

import React from "react";
import type { SyntaxStyle } from "@opentui/core";
import type { DiffLine, ParsedHunk } from "../../lib/diff-types.js";
import type { ThemeTokens } from "../../theme/tokens.js";
import type { PaneLayout } from "./diff-layout.js";
import { DiffSplitLine } from "./DiffSplitLine.js";
import { useScrollSync } from "./DiffSyncController.js";

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
  const { offset } = useScrollSync();

  // Flatten all visible split pairs into a single array
  const visibleLines = React.useMemo(() => {
    const lines: Array<{ line: DiffLine; hunkIndex: number; visualIndex: number }> = [];
    let visualIndex = 0;

    for (const hunk of hunks) {
      const isCollapsed = collapseState.get(hunk.index) ?? false;

      if (isCollapsed) {
        // Collapsed hunks render as a single summary line (handled by parent)
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

  // Viewport slicing: render only lines visible at current scroll offset
  const startIndex = Math.max(0, offset);
  const endIndex = Math.min(visibleLines.length, startIndex + viewportHeight);
  const viewportLines = visibleLines.slice(startIndex, endIndex);

  return (
    <box flexDirection="column" width={`${layout.paneWidth}`} flexGrow={1}>
      {viewportLines.map(({ line, visualIndex }) => (
        <DiffSplitLine
          key={visualIndex}
          line={line}
          lineNumber={lineNumberMap.get(visualIndex) ?? null}
          layout={layout}
          syntaxStyle={syntaxStyle}
          filetype={filetype}
          theme={theme}
          showWhitespace={showWhitespace}
        />
      ))}
    </box>
  );
}
```

### Step 5: Hunk header row component (`apps/tui/src/components/diff/DiffHunkHeaderRow.tsx`)

Renders hunk headers (`@@ -42,7 +42,12 @@ function setup()`) spanning the full width of both panes in cyan.

```typescript
// apps/tui/src/components/diff/DiffHunkHeaderRow.tsx

import React from "react";
import type { RGBA } from "@opentui/core";
import type { ParsedHunk } from "../../lib/diff-types.js";
import { getCollapsedSummaryText } from "../../lib/diff-parse.js";

export interface DiffHunkHeaderRowProps {
  hunk: ParsedHunk;
  isCollapsed: boolean;
  hunkHeaderColor: RGBA;
  mutedColor: RGBA;
  totalWidth: number;
}

export function DiffHunkHeaderRow({
  hunk,
  isCollapsed,
  hunkHeaderColor,
  mutedColor,
  totalWidth,
}: DiffHunkHeaderRowProps) {
  if (isCollapsed) {
    const summary = getCollapsedSummaryText(hunk, totalWidth);
    return (
      <box width="100%">
        <text fg={mutedColor}>{'─'.repeat(2)} {summary} {'─'.repeat(Math.max(0, totalWidth - summary.length - 4))}</text>
      </box>
    );
  }

  return (
    <box width="100%">
      <text fg={hunkHeaderColor}>{hunk.header}{hunk.scopeName ? ` ${hunk.scopeName}` : ""}</text>
    </box>
  );
}
```

### Step 6: Top-level split view component (`apps/tui/src/components/diff/DiffSplitView.tsx`)

The main split view component that orchestrates panes, separator, hunk headers, scroll sync, and keybindings.

```typescript
// apps/tui/src/components/diff/DiffSplitView.tsx

import React, { useMemo, useCallback } from "react";
import type { SyntaxStyle } from "@opentui/core";
import type { ParsedDiff, ParsedHunk } from "../../lib/diff-types.js";
import type { ThemeTokens } from "../../theme/tokens.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { DiffSyncController, useScrollSync } from "./DiffSyncController.js";
import { DiffPane } from "./DiffPane.js";
import { DiffHunkHeaderRow } from "./DiffHunkHeaderRow.js";
import { computePaneLayout, getContentAreaCols, VERTICAL_SEPARATOR } from "./diff-layout.js";

export interface DiffSplitViewProps {
  parsedDiff: ParsedDiff;
  filetype: string | undefined;
  syntaxStyle: SyntaxStyle | null;
  theme: Readonly<ThemeTokens>;
  showWhitespace: boolean;
  collapseState: Map<number, boolean>;
  onToggleCollapse: (hunkIndex: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function DiffSplitView(props: DiffSplitViewProps) {
  const {
    parsedDiff,
    filetype,
    syntaxStyle,
    theme,
    showWhitespace,
    collapseState,
  } = props;

  const layout = useLayout();
  const sidebarWidthPercent = layout.sidebarVisible
    ? (layout.breakpoint === "large" ? 30 : 25)
    : 0;
  const contentCols = getContentAreaCols(layout.width, layout.sidebarVisible, sidebarWidthPercent);
  const paneLayout = computePaneLayout(contentCols, layout.breakpoint);

  // Compute total visual lines for scroll sync
  const totalVisualLines = useMemo(() => {
    let count = 0;
    for (const hunk of parsedDiff.hunks) {
      const isCollapsed = collapseState.get(hunk.index) ?? false;
      if (isCollapsed) {
        count += 1; // collapsed hunk = 1 summary line
      } else {
        count += hunk.splitPairs.length;
      }
      count += 1; // hunk header row
    }
    return count;
  }, [parsedDiff.hunks, collapseState]);

  return (
    <DiffSyncController totalLines={totalVisualLines}>
      <DiffSplitViewInner
        {...props}
        contentCols={contentCols}
        paneLayout={paneLayout}
        totalVisualLines={totalVisualLines}
      />
    </DiffSyncController>
  );
}

interface DiffSplitViewInnerProps extends DiffSplitViewProps {
  contentCols: number;
  paneLayout: ReturnType<typeof computePaneLayout>;
  totalVisualLines: number;
}

/**
 * Inner component that has access to ScrollSyncContext.
 * Separated from DiffSplitView so useScrollSync() can be called
 * within the DiffSyncController provider.
 */
function DiffSplitViewInner({
  parsedDiff,
  filetype,
  syntaxStyle,
  theme,
  showWhitespace,
  collapseState,
  onExpandAll,
  onCollapseAll,
  contentCols,
  paneLayout,
}: DiffSplitViewInnerProps) {
  const layout = useLayout();
  const scrollSync = useScrollSync();
  const viewportHeight = layout.contentHeight;

  // Register split-view keybindings for scroll navigation
  const keybindings = useMemo(() => [
    {
      key: "j",
      description: "Scroll down",
      group: "Diff",
      handler: () => scrollSync.scrollBy(1),
    },
    {
      key: "k",
      description: "Scroll up",
      group: "Diff",
      handler: () => scrollSync.scrollBy(-1),
    },
    {
      key: "ctrl+d",
      description: "Page down",
      group: "Diff",
      handler: () => scrollSync.pageDown(viewportHeight),
    },
    {
      key: "ctrl+u",
      description: "Page up",
      group: "Diff",
      handler: () => scrollSync.pageUp(viewportHeight),
    },
    {
      key: "G",
      description: "Jump to bottom",
      group: "Diff",
      handler: () => scrollSync.scrollToBottom(viewportHeight),
    },
    {
      key: "x",
      description: "Expand all hunks",
      group: "Diff",
      handler: onExpandAll,
    },
    {
      key: "z",
      description: "Collapse all hunks",
      group: "Diff",
      handler: onCollapseAll,
    },
  ], [scrollSync, viewportHeight, onExpandAll, onCollapseAll]);

  useScreenKeybindings(keybindings);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <scrollbox scrollY viewportCulling>
        {parsedDiff.hunks.map((hunk) => {
          const isCollapsed = collapseState.get(hunk.index) ?? false;
          return (
            <box key={hunk.index} flexDirection="column" width="100%">
              {/* Hunk header spans full width */}
              <DiffHunkHeaderRow
                hunk={hunk}
                isCollapsed={isCollapsed}
                hunkHeaderColor={theme.diffHunkHeader}
                mutedColor={theme.muted}
                totalWidth={contentCols}
              />
              {/* Pane row: left │ right */}
              {!isCollapsed && (
                <box flexDirection="row" width="100%">
                  <DiffPane
                    side="old"
                    hunks={[hunk]}
                    lineNumberMap={parsedDiff.splitLeftLineMap}
                    layout={paneLayout}
                    collapseState={collapseState}
                    syntaxStyle={syntaxStyle}
                    filetype={filetype}
                    theme={theme}
                    showWhitespace={showWhitespace}
                    viewportHeight={viewportHeight}
                  />
                  <text fg={theme.border}>{VERTICAL_SEPARATOR}</text>
                  <DiffPane
                    side="new"
                    hunks={[hunk]}
                    lineNumberMap={parsedDiff.splitRightLineMap}
                    layout={paneLayout}
                    collapseState={collapseState}
                    syntaxStyle={syntaxStyle}
                    filetype={filetype}
                    theme={theme}
                    showWhitespace={showWhitespace}
                    viewportHeight={viewportHeight}
                  />
                </box>
              )}
            </box>
          );
        })}
      </scrollbox>
    </box>
  );
}
```

### Step 7: Modify parent DiffViewer to support mode toggle (`apps/tui/src/components/diff/DiffViewer.tsx`)

The parent `DiffViewer` component manages mode state (`unified` | `split`), passes it down, and conditionally renders either `<DiffUnifiedView>` or `<DiffSplitView>`. This component also handles the `t` toggle keypress and the minimum-width gate.

```typescript
// apps/tui/src/components/diff/DiffViewer.tsx (modifications)

import React, { useState, useMemo, useCallback } from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useDiffSyntaxStyle } from "../../hooks/useDiffSyntaxStyle.js";
import { parseDiffHunks } from "../../lib/diff-parse.js";
import { resolveFiletype } from "../../lib/diff-syntax.js";
import { isSplitViewAvailable, getContentAreaCols } from "./diff-layout.js";
import { DiffSplitView } from "./DiffSplitView.js";
// import { DiffUnifiedView } from "./DiffUnifiedView.js"; // from tui-diff-unified-view
import type { FileDiffItem } from "@codeplane/sdk";

export type DiffViewMode = "unified" | "split";

/** Duration in ms to show the "too narrow" warning toast */
const TOO_NARROW_WARNING_MS = 3000;

export interface DiffViewerProps {
  files: FileDiffItem[];
  focusedFileIndex: number;
  onFileChange: (index: number) => void;
}

export function DiffViewer({ files, focusedFileIndex, onFileChange }: DiffViewerProps) {
  const layout = useLayout();
  const theme = useTheme();
  const syntaxStyle = useDiffSyntaxStyle();

  // ── View mode state ──────────────────────────────────────────────
  const [mode, setMode] = useState<DiffViewMode>("unified");
  const [tooNarrowWarning, setTooNarrowWarning] = useState(false);

  // ── Diff data state ──────────────────────────────────────────────
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [collapseState, setCollapseState] = useState<Map<number, boolean>>(new Map());

  const currentFile = files[focusedFileIndex];
  const parsedDiff = useMemo(
    () => parseDiffHunks(currentFile?.patch),
    [currentFile?.patch],
  );

  const filetype = useMemo(
    () => resolveFiletype(currentFile?.language ?? null, currentFile?.path ?? ""),
    [currentFile?.language, currentFile?.path],
  );

  // ── Split view availability check ────────────────────────────────
  const sidebarWidthPercent = layout.sidebarVisible
    ? (layout.breakpoint === "large" ? 30 : 25)
    : 0;
  const splitAvailable = isSplitViewAvailable(layout.width, layout.sidebarVisible, sidebarWidthPercent);

  // ── Mode toggle handler ──────────────────────────────────────────
  const handleModeToggle = useCallback(() => {
    if (mode === "unified") {
      if (!splitAvailable) {
        setTooNarrowWarning(true);
        setTimeout(() => setTooNarrowWarning(false), TOO_NARROW_WARNING_MS);
        return;
      }
      setMode("split");
    } else {
      setMode("unified");
    }
  }, [mode, splitAvailable]);

  // Force back to unified if terminal is resized below threshold while in split mode
  React.useEffect(() => {
    if (mode === "split" && !splitAvailable) {
      setMode("unified");
    }
  }, [mode, splitAvailable]);

  // ── File navigation handlers ─────────────────────────────────────
  const handleNextFile = useCallback(() => {
    if (focusedFileIndex < files.length - 1) {
      setCollapseState(new Map()); // reset collapse on file change
      onFileChange(focusedFileIndex + 1);
    }
  }, [focusedFileIndex, files.length, onFileChange]);

  const handlePrevFile = useCallback(() => {
    if (focusedFileIndex > 0) {
      setCollapseState(new Map()); // reset collapse on file change
      onFileChange(focusedFileIndex - 1);
    }
  }, [focusedFileIndex, onFileChange]);

  // ── Expand/collapse handlers ─────────────────────────────────────
  const handleToggleCollapse = useCallback((hunkIndex: number) => {
    setCollapseState((prev) => {
      const next = new Map(prev);
      next.set(hunkIndex, !(prev.get(hunkIndex) ?? false));
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setCollapseState(new Map());
  }, []);

  const handleCollapseAll = useCallback(() => {
    const next = new Map<number, boolean>();
    for (const hunk of parsedDiff.hunks) {
      next.set(hunk.index, true);
    }
    setCollapseState(next);
  }, [parsedDiff.hunks]);

  // ── Keybindings ──────────────────────────────────────────────────
  const keybindings = useMemo(() => [
    { key: "t", description: "Toggle unified/split", group: "Diff", handler: handleModeToggle },
    { key: "w", description: "Toggle whitespace", group: "Diff", handler: () => setShowWhitespace((v) => !v) },
    { key: "]", description: "Next file", group: "Diff", handler: handleNextFile },
    { key: "[", description: "Previous file", group: "Diff", handler: handlePrevFile },
    { key: "x", description: "Expand all hunks", group: "Diff", handler: handleExpandAll },
    { key: "z", description: "Collapse all hunks", group: "Diff", handler: handleCollapseAll },
  ], [handleModeToggle, handleNextFile, handlePrevFile, handleExpandAll, handleCollapseAll]);

  useScreenKeybindings(keybindings);

  // ── Render ────────────────────────────────────────────────────────
  if (parsedDiff.error) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={theme.error}>{parsedDiff.error}</text>
      </box>
    );
  }

  if (parsedDiff.isEmpty) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={theme.muted}>No changes in this file</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Too narrow warning banner */}
      {tooNarrowWarning && (
        <box width="100%">
          <text fg={theme.warning}>Terminal too narrow for split view (need {100} content cols, have {getContentAreaCols(layout.width, layout.sidebarVisible, sidebarWidthPercent)})</text>
        </box>
      )}

      {/* Mode indicator in a thin status row */}
      <box flexDirection="row" width="100%">
        <text fg={theme.muted}>
          {mode === "split" ? "Split" : "Unified"} view
          {" "}
          [{focusedFileIndex + 1}/{files.length}] {currentFile?.path}
        </text>
      </box>

      {/* Conditional view rendering */}
      {mode === "split" ? (
        <DiffSplitView
          parsedDiff={parsedDiff}
          filetype={filetype}
          syntaxStyle={syntaxStyle}
          theme={theme}
          showWhitespace={showWhitespace}
          collapseState={collapseState}
          onToggleCollapse={handleToggleCollapse}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
      ) : (
        // DiffUnifiedView rendered here (from tui-diff-unified-view dependency)
        <box flexGrow={1}>
          <text fg={theme.muted}>Unified view (see tui-diff-unified-view)</text>
        </box>
      )}
    </box>
  );
}
```

### Step 8: Update barrel export (`apps/tui/src/components/diff/index.ts`)

```typescript
// apps/tui/src/components/diff/index.ts

export { DiffSplitView } from "./DiffSplitView.js";
export type { DiffSplitViewProps } from "./DiffSplitView.js";
export { DiffPane } from "./DiffPane.js";
export type { DiffPaneProps } from "./DiffPane.js";
export { DiffSplitLine } from "./DiffSplitLine.js";
export type { DiffSplitLineProps } from "./DiffSplitLine.js";
export { DiffHunkHeaderRow } from "./DiffHunkHeaderRow.js";
export type { DiffHunkHeaderRowProps } from "./DiffHunkHeaderRow.js";
export { DiffSyncController, useScrollSync } from "./DiffSyncController.js";
export type { ScrollSyncState, DiffSyncControllerProps } from "./DiffSyncController.js";
export { DiffViewer } from "./DiffViewer.js";
export type { DiffViewerProps, DiffViewMode } from "./DiffViewer.js";
export {
  isSplitViewAvailable,
  computePaneLayout,
  getContentAreaCols,
  VERTICAL_SEPARATOR,
  SPLIT_VIEW_MIN_CONTENT_COLS,
} from "./diff-layout.js";
export type { PaneLayout } from "./diff-layout.js";
```

---

## Responsive Behavior

### Pane Width Calculation

| Terminal Width | Sidebar | Content Area | Per-Pane Width | Gutter | Content/Pane |
|---------------|---------|-------------|---------------|--------|-------------|
| 80 cols | Hidden (minimum) | 80 cols | **Split unavailable** | — | — |
| 120 cols | Visible (25%) | 90 cols | **Split unavailable** (< 100) | — | — |
| 120 cols | Hidden | 120 cols | 59 cols | 4 | 54 cols |
| 140 cols | Visible (25%) | 105 cols | 52 cols | 4 | 47 cols |
| 160 cols | Visible (25%) | 120 cols | 59 cols | 4 | 54 cols |
| 200 cols | Visible (30%) | 140 cols | 69 cols | 6 | 62 cols |
| 240 cols | Visible (30%) | 168 cols | 83 cols | 6 | 76 cols |

### Split View Availability Gate

- **Content area < 100 cols:** Split view disabled. `t` key shows warning: `"Terminal too narrow for split view"` for 3 seconds. View stays in unified mode.
- **Content area ≥ 100 cols:** Split view available. `t` toggles freely.
- **Terminal resized below threshold while in split mode:** Automatically switches back to unified mode (no warning — the switch is silent and instant).

### Sidebar Toggle Interaction

- `Ctrl+B` toggles sidebar visibility via `useSidebarState()`.
- When sidebar hides, content area expands. Panes resize immediately.
- When sidebar shows, content area shrinks. If content area drops below 100 cols, auto-switch to unified.
- Pane widths recalculate synchronously on resize (no animation, no debounce).

---

## Keybinding Integration

### Keybindings Active in Split Mode

| Key | Action | Priority | Source |
|-----|--------|----------|--------|
| `j` / `Down` | Scroll both panes down 1 line | SCREEN | DiffSplitViewInner |
| `k` / `Up` | Scroll both panes up 1 line | SCREEN | DiffSplitViewInner |
| `Ctrl+D` | Page down (half viewport) | SCREEN | DiffSplitViewInner |
| `Ctrl+U` | Page up (half viewport) | SCREEN | DiffSplitViewInner |
| `G` | Jump to bottom | SCREEN | DiffSplitViewInner |
| `g g` | Jump to top | GLOBAL (go-to handler) | KeybindingProvider |
| `t` | Toggle to unified mode | SCREEN | DiffViewer |
| `w` | Toggle whitespace visibility | SCREEN | DiffViewer |
| `]` | Next file | SCREEN | DiffViewer |
| `[` | Previous file | SCREEN | DiffViewer |
| `x` | Expand all hunks | SCREEN | DiffViewer |
| `z` | Collapse all hunks | SCREEN | DiffViewer |
| `Ctrl+B` | Toggle sidebar | GLOBAL | GlobalKeybindings |
| `?` | Help overlay | GLOBAL | GlobalKeybindings |
| `:` | Command palette | GLOBAL | GlobalKeybindings |
| `q` | Back/pop screen | GLOBAL | GlobalKeybindings |

### Keybinding Registration Pattern

Split-view scroll keybindings are registered by `DiffSplitViewInner` via `useScreenKeybindings()`. They push a SCREEN-priority scope on mount and pop on unmount. When the user toggles from split to unified, the split view unmounts, its keybinding scope is popped, and the unified view's keybinding scope takes over.

File navigation (`]`/`[`) and mode toggle (`t`) are registered by the parent `DiffViewer`, which persists across mode changes.

---

## Scroll Synchronization — Detailed Design

### Mechanism

1. `DiffSyncController` provides a `ScrollSyncState` context with `offset` and navigation methods.
2. Both `<DiffPane side="old">` and `<DiffPane side="new">` consume the same `offset` via `useScrollSync()`.
3. Each pane renders only the lines within `[offset, offset + viewportHeight)` (viewport slicing).
4. When `j` is pressed, `scrollSync.scrollBy(1)` increments the shared offset by 1. Both panes re-render showing the next row.
5. Both panes always show the same visual line index range, so context lines are vertically aligned.

### Filler Line Alignment

Filler lines were inserted by `buildSplitPairs()` at parse time. For a change block with 3 deletions and 5 additions:

```
Left (old) pane:          Right (new) pane:
─────────────────         ─────────────────
  42 │ old line 1           42 │ new line 1
  43 │ old line 2           43 │ new line 2
  44 │ old line 3           44 │ new line 3
     │ [filler]             45 │ new line 4
     │ [filler]             46 │ new line 5
```

Filler lines render as blank rows with no line number, maintaining vertical alignment so that context lines after the change block appear on the same visual row in both panes.

### Scroll Boundaries

- **Top:** `offset` clamped to 0.
- **Bottom:** `offset` clamped to `totalVisualLines - 1`.
- **Page scroll:** Half the viewport height, clamped.

### Performance

Viewport culling ensures only `viewportHeight` lines are rendered per pane at any time. For a diff with 10,000 lines, only ~38 lines (at standard 120×40 terminal) are rendered per pane. This keeps the render time well under the 50ms target from the design spec.

---

## Telemetry

```typescript
// Emit when user toggles between modes
trackEvent("tui.diff.mode_toggle", {
  from: prevMode, // "unified" | "split"
  to: nextMode,   // "unified" | "split"
});

// Emit when split mode is blocked due to terminal width
trackEvent("tui.diff.split_view_blocked", {
  terminal_width: layout.width,
  content_area_cols: contentCols,
  sidebar_visible: layout.sidebarVisible,
});

// Dimension tracking on render
trackEvent("tui.diff.view_render", {
  mode: currentMode,
  terminal_width: layout.width,
  terminal_height: layout.height,
  breakpoint: layout.breakpoint,
});
```

Telemetry is fire-and-forget — never blocks rendering. Events use the shared telemetry client from `@codeplane/ui-core`.

---

## Observability

| Signal | Type | Condition | Action |
|--------|------|-----------|--------|
| `diff_split_render_ms` | Performance metric | Every split view render | Log if > 50ms |
| Split view width gate | Warning log | User presses `t` but terminal too narrow | Log `warn("Split view blocked: need 100 content cols, have ${contentCols}")` |
| Auto-downgrade to unified | Info log | Terminal resized below threshold while in split | Log `info("Auto-switched from split to unified: content area ${contentCols} < 100")` |
| Scroll sync offset | Debug | Optional, controlled by env flag | Log offset changes for debugging alignment issues |

---

## Error Handling

| Error | Handling |
|-------|----------|
| `parseDiffHunks()` returns `error` | Show error message centered in content area with `theme.error` color |
| `parseDiffHunks()` returns `isEmpty: true` | Show "No changes in this file" with `theme.muted` |
| `syntaxStyle` is `null` (native lib unavailable) | Render content as plain `<text>` without syntax highlighting — graceful degradation |
| Scroll offset exceeds total lines (race condition) | `clamp()` in `DiffSyncController` silently bounds offset |
| File has no `patch` field | `parseDiffHunks(undefined)` returns empty result — handled by isEmpty check |
| Binary file | `validatePatch()` returns error string — rendered as error message |

---

## Unit & Integration Tests

All tests target `e2e/tui/diff.test.ts` using `@microsoft/tui-test`. Tests are appended to the existing file which already contains `TUI_DIFF_SYNTAX_HIGHLIGHT` test stubs.

### Test File: `e2e/tui/diff.test.ts`

```typescript
// Appended to e2e/tui/diff.test.ts

import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers.ts";

describe("TUI_DIFF_SPLIT_VIEW — mode toggle", () => {
  test("TUI_DIFF_SPLIT_VIEW_TOGGLE: t toggles between unified and split, then back", async () => {
    // Launch TUI at 120x40 (standard breakpoint, split available)
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    // Navigate to a diff view with repo context
    // (assumes test fixture has a repo with at least one change/landing with a diff)
    await terminal.sendKeys("g", "l"); // go to landings
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter"); // open first landing
    // Navigate to diff tab or open diff view
    // (exact navigation depends on DiffScreen scaffold implementation)

    // Verify initial mode is unified
    await terminal.waitForText("Unified view");

    // Press t to switch to split
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Verify split layout: vertical separator character (│) should be visible
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("│");

    // Press t again to switch back to unified
    await terminal.sendKeys("t");
    await terminal.waitForText("Unified view");
  });
});

describe("TUI_DIFF_SPLIT_VIEW — rendering", () => {
  test("TUI_DIFF_SPLIT_VIEW_COLORS: left pane red deletions, right pane green additions", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    // Navigate to diff view with a file that has both additions and deletions
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");

    // Switch to split view
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Capture terminal snapshot for color verification
    // Left pane: deletion lines should have red background (ANSI 52 / #4D1A1A)
    // Right pane: addition lines should have green background (ANSI 22 / #1A4D1A)
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("TUI_DIFF_SPLIT_VIEW_LINE_NUMBERS: both panes show independent line numbers", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    // Navigate to diff with known file content
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Left pane line numbers should correspond to old file lines
    // Right pane line numbers should correspond to new file lines
    // Line numbers are independent — old file may show 42-48 while new shows 42-52
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatchSnapshot();
  });

  test("TUI_DIFF_SPLIT_VIEW_HUNK_HEADER: hunk headers span full width in cyan", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Hunk header (@@ ... @@) should span the full width across both panes
    // Should be rendered in cyan (theme.diffHunkHeader)
    const snapshot = terminal.snapshot();
    // Regex: hunk header pattern visible
    expect(snapshot).toMatch(/@@.*@@/);
    expect(snapshot).toMatchSnapshot();
  });

  test("TUI_DIFF_SPLIT_VIEW_ALIGNMENT: filler lines keep context aligned", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    // Navigate to diff with unequal additions/deletions (e.g., 2 deletions, 5 additions)
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Filler lines on the shorter side maintain vertical alignment
    // Context lines after the change block appear on the same row in both panes
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});

describe("TUI_DIFF_SPLIT_VIEW — scroll synchronization", () => {
  test("TUI_DIFF_SPLIT_VIEW_SCROLL_SYNC: j/k scrolls both panes together", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Capture initial position
    const snapshot1 = terminal.snapshot();

    // Press j multiple times to scroll down
    await terminal.sendKeys("j", "j", "j", "j", "j");

    // Capture scrolled position — both panes should have moved
    const snapshot2 = terminal.snapshot();
    expect(snapshot2).not.toEqual(snapshot1);

    // Press k to scroll back up
    await terminal.sendKeys("k", "k", "k", "k", "k");

    // Should return to original position
    const snapshot3 = terminal.snapshot();
    expect(snapshot3).toEqual(snapshot1);
  });
});

describe("TUI_DIFF_SPLIT_VIEW — file navigation", () => {
  test("TUI_DIFF_SPLIT_VIEW_FILE_NAV: ] and [ navigate files in split mode", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Verify initial file indicator (e.g., [1/3])
    const initialSnapshot = terminal.snapshot();
    expect(initialSnapshot).toMatch(/\[1\//);

    // Press ] to go to next file
    await terminal.sendKeys("]");

    // Should still be in split mode with next file
    await terminal.waitForText("Split view");
    const nextSnapshot = terminal.snapshot();
    expect(nextSnapshot).toMatch(/\[2\//);

    // Press [ to go back
    await terminal.sendKeys("[");
    await terminal.waitForText("Split view");
    const prevSnapshot = terminal.snapshot();
    expect(prevSnapshot).toMatch(/\[1\//);
  });
});

describe("TUI_DIFF_SPLIT_VIEW — expand/collapse", () => {
  test("TUI_DIFF_SPLIT_VIEW_HUNK_EXPAND_COLLAPSE: z collapses, x expands all hunks", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Capture expanded state
    const expandedSnapshot = terminal.snapshot();

    // Press z to collapse all hunks
    await terminal.sendKeys("z");
    const collapsedSnapshot = terminal.snapshot();

    // Collapsed should show summary text (e.g., "N lines hidden")
    expect(collapsedSnapshot).toMatch(/hidden/);
    // Collapsed should be shorter than expanded
    expect(collapsedSnapshot).not.toEqual(expandedSnapshot);

    // Press x to expand all hunks
    await terminal.sendKeys("x");
    const reExpandedSnapshot = terminal.snapshot();

    // Should match original expanded state
    expect(reExpandedSnapshot).toEqual(expandedSnapshot);
  });
});

describe("TUI_DIFF_SPLIT_VIEW — whitespace toggle", () => {
  test("TUI_DIFF_SPLIT_VIEW_WHITESPACE: w toggles whitespace visibility", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });

    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    const withoutWhitespace = terminal.snapshot();

    // Press w to show whitespace
    await terminal.sendKeys("w");
    const withWhitespace = terminal.snapshot();

    // With whitespace visible, middle-dot (·) characters should appear
    // where spaces were
    expect(withWhitespace).not.toEqual(withoutWhitespace);

    // Press w again to hide
    await terminal.sendKeys("w");
    const withoutAgain = terminal.snapshot();
    expect(withoutAgain).toEqual(withoutWhitespace);
  });
});

describe("TUI_DIFF_SPLIT_VIEW — minimum width gate", () => {
  test("TUI_DIFF_SPLIT_VIEW_MIN_WIDTH: shows warning at 80x24 and stays unified", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });

    // Navigate to diff
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");

    // Verify we're in unified mode
    await terminal.waitForText("Unified view");

    // Press t — should show warning, NOT switch to split
    await terminal.sendKeys("t");

    // Warning message should appear
    await terminal.waitForText("too narrow");

    // Should still be in unified mode
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Unified view");
    expect(snapshot).not.toContain("Split view");
  });
});

describe("TUI_DIFF_SPLIT_VIEW — sidebar toggle interaction", () => {
  test("TUI_DIFF_SPLIT_VIEW_SIDEBAR_TOGGLE: Ctrl+B hides sidebar and panes resize", async () => {
    // Use 140x40 — with 25% sidebar, content = 105 cols (split OK)
    // Without sidebar, content = 140 cols (split wider)
    const terminal = await launchTUI({ cols: 140, rows: 40 });

    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Capture with sidebar
    const withSidebar = terminal.snapshot();

    // Toggle sidebar off
    await terminal.sendKeys("ctrl+b");

    // Panes should have resized (wider content per pane)
    const withoutSidebar = terminal.snapshot();
    expect(withoutSidebar).not.toEqual(withSidebar);

    // Toggle sidebar back on
    await terminal.sendKeys("ctrl+b");
    const withSidebarAgain = terminal.snapshot();
    expect(withSidebarAgain).toEqual(withSidebar);
  });
});

describe("TUI_DIFF_SPLIT_VIEW — responsive snapshots", () => {
  test("SNAP-SPLIT-001: split view at 120x40 standard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SPLIT-002: split view at 200x60 large", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SPLIT-003: split view at 160x40 with sidebar", async () => {
    const terminal = await launchTUI({ cols: 160, rows: 40 });
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SPLIT-004: resize from 200 to 80 auto-switches to unified", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view");

    // Resize terminal below split threshold
    await terminal.resize(80, 24);

    // Should auto-switch to unified
    await terminal.waitForText("Unified view");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

---

## Productionization Checklist

This section outlines how to take the components from initial implementation to production-ready quality.

### 1. Move from spec references to real source files

The `diff-types.ts` and `diff-parse.ts` files currently exist only under `specs/tui/apps/tui/src/lib/`. They must be copied to `apps/tui/src/lib/diff-types.ts` and `apps/tui/src/lib/diff-parse.ts` as real source files. After copying:
- Verify `import { parsePatch } from "diff"` resolves in the Bun runtime
- Run `bun typecheck` to confirm type compatibility with `@opentui/core` and `@codeplane/sdk`
- Add the files to the `apps/tui/src/lib/index.ts` barrel export

### 2. Integration with DiffScreen scaffold

The `DiffViewer` component created in Step 7 must be integrated with the `DiffScreen` scaffold (from `tui-diff-screen-scaffold`). The scaffold provides:
- Screen params (`owner`, `repo`, `changeId` or `landingNumber`)
- Data hook wiring (`useChangeDiff` / `useLandingDiff`)
- Focus zone state machine (file tree ↔ content)
- Breadcrumb generation

The `DiffViewer` is rendered as the content zone child within the scaffold.

### 3. Performance profiling

Before shipping:
- Profile render time at 120×40 with a 500-line diff → must be < 50ms
- Profile render time at 200×60 with a 2000-line diff → must be < 50ms
- Profile memory usage after 100 file navigations → must not leak
- Verify `viewportCulling={true}` on `<scrollbox>` actually culls off-screen lines (inspect OpenTUI render tree)

### 4. Snapshot golden file review

After all E2E tests pass:
- Review every snapshot golden file for visual correctness:
  - Vertical separator (│) aligned on every row
  - Line numbers right-justified in gutter
  - Filler lines show blank content, no artifacts
  - Hunk headers span full width, no truncation
  - Colors: red on left, green on right, cyan headers
- Commit golden files alongside the implementation

### 5. Accessibility considerations

- Verify that line type information is conveyed by both color AND position (left pane = old, right pane = new). Color alone is not sufficient for colorblind users.
- Hunk headers use text content (`@@`) as a structural marker, not just color.
- The `w` (whitespace toggle) uses character substitution (·, →) rather than color-only whitespace indication.

### 6. Remove placeholder from screen registry

Once `DiffScreen` scaffold and `DiffViewer` are complete:
- In `apps/tui/src/router/registry.ts`, replace `PlaceholderScreen` with the real `DiffScreen` component
- Verify deep-link navigation (`codeplane tui --screen diff --repo owner/repo --change abc123`) works

---

## Dependencies (Upstream)

| Dependency | Required Before | Provides |
|-----------|----------------|----------|
| `tui-diff-parse-utils` | Step 1 | `ParsedDiff`, `SplitLinePair`, `parseDiffHunks()`, `buildSplitPairs()`, `buildLineMap()`, `getCollapsedSummaryText()` |
| `tui-diff-unified-view` | Step 7 | `DiffUnifiedView` component (conditional render in `DiffViewer`) |
| `tui-diff-syntax-style` | Step 3 | `useDiffSyntaxStyle()` hook, `resolveFiletype()`, `SyntaxStyle` creation |
| `tui-diff-screen-scaffold` | Productionization | `DiffScreen` shell component, data hook wiring |
| `tui-diff-data-hooks` | Productionization | `useChangeDiff()`, `useLandingDiff()` for real API data |

## Dependencies (Downstream)

| Consumer | Consumes | Notes |
|----------|----------|-------|
| `tui-diff-inline-comments` (future) | `DiffSplitLine`, `DiffPane`, line identity | Comments anchored to specific lines in split view |
| `tui-diff-screen-scaffold` | `DiffViewer`, `DiffViewMode` | Renders DiffViewer as content zone child |

---

## File Summary

| File | Lines (est.) | New/Mod |
|------|--------------|---------|
| `apps/tui/src/components/diff/diff-layout.ts` | ~80 | New |
| `apps/tui/src/components/diff/DiffSyncController.tsx` | ~90 | New |
| `apps/tui/src/components/diff/DiffSplitLine.tsx` | ~90 | New |
| `apps/tui/src/components/diff/DiffPane.tsx` | ~80 | New |
| `apps/tui/src/components/diff/DiffHunkHeaderRow.tsx` | ~45 | New |
| `apps/tui/src/components/diff/DiffSplitView.tsx` | ~180 | New |
| `apps/tui/src/components/diff/DiffViewer.tsx` | ~200 | New |
| `apps/tui/src/components/diff/index.ts` | ~25 | New/Mod |
| `e2e/tui/diff.test.ts` | ~350 (additions) | Modified |
| **Total** | **~1140** | |
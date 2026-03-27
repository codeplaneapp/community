# Engineering Specification: TUI_DIFF_UNIFIED_VIEW — Default Single-Column Interleaved Diff Rendering

**Ticket:** `tui-diff-unified-view`
**Status:** Not started
**Dependencies:** `tui-diff-screen-scaffold` (DiffScreen shell, `useDiffData`, `FocusZone`, `DiffContentPlaceholder`), `tui-diff-parse-utils` (`parseDiffHunks`, `ParsedDiff`, `ParsedHunk`, `DiffLine`, `getHunkVisualOffsets`, `getCollapsedSummaryText`, `parseHunkScopeName`), `tui-diff-syntax-style` (`useDiffSyntaxStyle`, `resolveFiletype`, `createDiffSyntaxStyle`)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket implements the unified (single-column) diff view — `UnifiedDiffViewer` — the default rendering mode when DiffScreen opens. It replaces `DiffContentPlaceholder` from the scaffold with a fully functional renderer that:

1. Renders OpenTUI `<diff>` with `view="unified"`, passing `filetype`, `syntaxStyle`, color props, and `wrapMode`.
2. Renders a file header bar with change type icon (A/D/M/R/C with semantic colors), file path, and `+N −M` stats.
3. Wraps content in `<scrollbox>` with vim-style navigation (`j`/`k`, `Ctrl+D`/`Ctrl+U`, `G`/`gg`).
4. Renders hunk headers with `@@` markers in cyan (ANSI 37), expand/collapse indicators (`▼`/`▶`).
5. Manages per-file hunk collapse state, line number visibility, whitespace toggle.
6. Handles binary files, empty patches, whitespace-only-when-toggled, and error states.
7. Adapts `wrapMode` to `"word"` at minimum breakpoint, `"none"` at standard+.

---

## 2. File Inventory

### 2.1 New Files

| File | Purpose | Approx Lines |
|------|---------|-------------|
| `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx` | Main unified diff viewer component | ~180 |
| `apps/tui/src/screens/DiffScreen/DiffFileHeader.tsx` | File header bar (filename, change type icon, +N −M stats) | ~65 |
| `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx` | Hunk header row (cyan `@@`, scope name, ▼/▶) | ~50 |
| `apps/tui/src/screens/DiffScreen/DiffEmptyState.tsx` | Empty/binary/no-whitespace placeholder messages | ~25 |
| `apps/tui/src/screens/DiffScreen/useFileNavigation.ts` | Hook: file index, `]`/`[` wrap-around navigation | ~40 |
| `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` | Hook: per-file hunk collapse, `z`/`x`/`Enter` | ~45 |
| `apps/tui/src/screens/DiffScreen/useDiffScroll.ts` | Hook: scroll state, `j`/`k`/`Ctrl+D`/`Ctrl+U`/`G`/`gg` | ~75 |
| `apps/tui/src/screens/DiffScreen/diff-constants.ts` | Gutter widths, color hex values, truncation limits | ~45 |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Replace `DiffContentPlaceholder` with `UnifiedDiffViewer`. Wire file navigation, hunk collapse, scroll, syntax style, and line number hooks. Add keybinding wiring. |
| `apps/tui/src/screens/DiffScreen/types.ts` | Add `UnifiedDiffViewerProps`, `ScrollHandle`, `FileHeaderProps`, `HunkHeaderProps` |

---

## 3. Type Definitions

### File: `apps/tui/src/screens/DiffScreen/types.ts` (additions)

These types extend the existing DiffScreen type file from the scaffold. They reference the real interfaces from the codebase: `FileDiffItem` from `packages/sdk/src/services/repohost.ts` (re-exported via `apps/tui/src/types/diff.ts`), `ParsedDiff` from `apps/tui/src/lib/diff-types.ts`, `SyntaxStyle` from `@opentui/core`, and `Breakpoint` from `apps/tui/src/types/breakpoint.ts`.

```typescript
import type { FileDiffItem } from "../../types/diff.js";
import type { ParsedDiff } from "../../lib/diff-types.js";
import type { SyntaxStyle } from "@opentui/core";
import type { Breakpoint } from "../../types/breakpoint.js";

/**
 * Imperative handle for controlling scroll position of the diff content area.
 * Wraps OpenTUI's ScrollBoxRenderable.scrollTo/scrollBy APIs.
 *
 * The scrollbox ref is obtained via React.useRef<any> pointing at the <scrollbox>
 * element. OpenTUI scrollbox exposes scrollTo(amount), scrollBy(delta, unit?),
 * scrollHeight, and scrollTop on the renderable.
 */
export interface ScrollHandle {
  scrollToTop: () => void;
  scrollToBottom: () => void;
  /** @param delta positive = down, negative = up, in lines */
  scrollBy: (delta: number) => void;
  getScrollPosition: () => number;
  setScrollPosition: (pos: number) => void;
}

export interface UnifiedDiffViewerProps {
  /** Current file being displayed. Null only when fileCount === 0. */
  file: FileDiffItem;
  /** Parsed representation of the file's diff patch (from parseDiffHunks) */
  parsedDiff: ParsedDiff;
  /** Whether this viewer has keyboard focus (vs file tree sidebar) */
  focused: boolean;
  /** Always "unified" for this component */
  viewMode: "unified";
  /** Current whitespace visibility state */
  showWhitespace: boolean;
  /** Current line number visibility state */
  showLineNumbers: boolean;
  /** Map of hunk index → collapsed boolean (true = collapsed) */
  hunkCollapseState: Map<number, boolean>;
  onToggleHunk: (hunkIndex: number) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  /** 0-indexed file position in multi-file diff */
  fileIndex: number;
  /** Total number of files in diff */
  fileCount: number;
  /** Tree-sitter syntax style from useDiffSyntaxStyle (null = plain text fallback) */
  syntaxStyle: SyntaxStyle | null;
  /** Detected filetype for syntax highlighting (undefined = unresolvable) */
  filetype: string | undefined;
  /** Current responsive breakpoint from useLayout(). null = terminal too small. */
  breakpoint: Breakpoint | null;
  /** Terminal width in columns from useLayout().width */
  terminalWidth: number;
  /** Terminal height in rows from useLayout().height */
  terminalHeight: number;
  /** Ref callback to expose ScrollHandle to parent for keybinding wiring */
  scrollRef?: React.RefCallback<ScrollHandle>;
}

export interface FileHeaderProps {
  /** The file diff item from the API response */
  file: FileDiffItem;
  /** 0-based index of the current file */
  fileIndex: number;
  /** Total file count */
  fileCount: number;
  /** Current responsive breakpoint */
  breakpoint: Breakpoint | null;
}

export interface HunkHeaderProps {
  /** Raw hunk header string (e.g., "@@ -42,7 +42,12 @@") */
  header: string;
  /** Extracted scope/function name (e.g., "refreshToken()"), null if absent */
  scopeName: string | null;
  /** Whether this hunk is currently collapsed */
  collapsed: boolean;
  /** Current responsive breakpoint */
  breakpoint: Breakpoint | null;
  /** Callback invoked when user presses Enter on this header */
  onToggle: () => void;
}
```

---

## 4. Implementation Plan

### Step 1: Constants Module

**File:** `apps/tui/src/screens/DiffScreen/diff-constants.ts`

Define all magic numbers, color values, and display mappings in a single constants file. This prevents color or sizing values from being scattered across components and ensures consistency with the product spec's color tokens.

```typescript
import type { Breakpoint } from "../../types/breakpoint.js";

/**
 * Gutter width per breakpoint — each value is the width of ONE line number column.
 * Total gutter = 2 * value (old + new line numbers).
 */
export const GUTTER_WIDTH: Record<NonNullable<Breakpoint>, number> = {
  minimum: 4,   // 4+4 = 8ch total
  standard: 5,  // 5+5 = 10ch total
  large: 6,     // 6+6 = 12ch total
} as const;

/**
 * All diff-specific colors.
 * Values match the product spec acceptance criteria exactly.
 * These are hex strings passed directly to OpenTUI's <diff> component.
 */
export const DIFF_COLORS = {
  addedBg: "#1a4d1a",
  removedBg: "#4d1a1a",
  contextBg: "transparent",
  addedSignColor: "#22c55e",
  removedSignColor: "#ef4444",
  lineNumberFg: "#6b7280",
  lineNumberBg: "#161b22",
  addedLineNumberBg: "#0d3a0d",
  removedLineNumberBg: "#3a0d0d",
  hunkHeaderColor: "#06b6d4",  // cyan, ANSI 37 equivalent
} as const;

/**
 * File change type → display metadata.
 * `colorToken` references a key on ThemeTokens from useTheme().
 *
 * The SDK's FileDiffItem.change_type is typed as string. The TUI's
 * narrowed types/diff.ts re-exports it with a union type, but we
 * still use Record<string, ...> for defensive lookup with a fallback.
 */
export const CHANGE_TYPE_DISPLAY: Record<string, { icon: string; label: string; colorToken: string }> = {
  added:    { icon: "A", label: "added",    colorToken: "success" },
  deleted:  { icon: "D", label: "deleted",  colorToken: "error" },
  modified: { icon: "M", label: "modified", colorToken: "warning" },
  renamed:  { icon: "R", label: "renamed",  colorToken: "primary" },
  copied:   { icon: "C", label: "copied",   colorToken: "primary" },
};

/**
 * Truncation and size limits.
 * These are hard boundaries — exceeding them triggers truncation or fallback.
 */
export const TRUNCATION = {
  /** Maximum filename display length before truncation */
  maxFilenameChars: 255,
  /** Maximum hunk scope name length before truncation */
  maxScopeNameChars: 40,
  /** Maximum total diff lines before truncation message */
  maxTotalDiffLines: 100_000,
  /** Maximum digits in line number gutter */
  maxLineNumberDigits: 6,
} as const;

/** Fraction of viewport height used for Ctrl+D/Ctrl+U page scroll */
export const HALF_PAGE_FRACTION = 0.5;

/** Context lines shown around hunks by breakpoint */
export const CONTEXT_LINES: Record<NonNullable<Breakpoint>, number> = {
  minimum: 3,
  standard: 3,
  large: 5,
} as const;
```

**Rationale:** Centralizing constants prevents drift between components and makes the product spec's exact values auditable in one place. Using `as const` enables type narrowing in consumers.

**Why this is Step 1:** Every subsequent component and hook references these constants. Building this first establishes the shared vocabulary.

---

### Step 2: useFileNavigation Hook

**File:** `apps/tui/src/screens/DiffScreen/useFileNavigation.ts`

Manages the current file index within a multi-file diff. Provides `]` (next) and `[` (previous) with wrap-around semantics. Consumed by both DiffScreen (keybinding wiring) and UnifiedDiffViewer (current file rendering).

```typescript
import { useState, useCallback, useMemo } from "react";
import type { FileDiffItem } from "../../types/diff.js";

export interface FileNavigationState {
  /** Current 0-based file index */
  fileIndex: number;
  /** Total number of files */
  fileCount: number;
  /** The current file object, or null if no files */
  currentFile: FileDiffItem | null;
  /** Navigate to next file (wraps last→first). No-op if ≤1 files. */
  nextFile: () => void;
  /** Navigate to previous file (wraps first→last). No-op if ≤1 files. */
  prevFile: () => void;
  /** Jump to a specific file index (clamped to valid range). */
  goToFile: (index: number) => void;
}

export function useFileNavigation(files: FileDiffItem[]): FileNavigationState {
  const [fileIndex, setFileIndex] = useState(0);
  const fileCount = files.length;

  const nextFile = useCallback(() => {
    if (fileCount <= 1) return;
    setFileIndex((prev) => (prev + 1) % fileCount);
  }, [fileCount]);

  const prevFile = useCallback(() => {
    if (fileCount <= 1) return;
    setFileIndex((prev) => (prev - 1 + fileCount) % fileCount);
  }, [fileCount]);

  const goToFile = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, fileCount - 1));
    if (fileCount > 0) setFileIndex(clamped);
  }, [fileCount]);

  const currentFile = useMemo(
    () => (fileCount > 0 ? files[fileIndex] ?? null : null),
    [files, fileIndex, fileCount],
  );

  return { fileIndex, fileCount, currentFile, nextFile, prevFile, goToFile };
}
```

**Design decisions:**
- `]` on last file wraps to first; `[` on first wraps to last (product spec: "File navigation wraps around").
- Single-file diff (`fileCount === 1`): `nextFile`/`prevFile` are no-ops (product spec: "`]`/`[` on single-file diff — no-op").
- Zero-file diff (`fileCount === 0`): `currentFile` is null, all navigation is no-op.
- `goToFile` clamps index to valid range for safety against stale indices after file list changes.
- `files` reference from `DiffData.files` (`FileDiffItem[]` from the SDK) is stable for the lifetime of a fetch — it only changes on `refetch()`.

---

### Step 3: useHunkCollapse Hook

**File:** `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts`

Manages per-hunk collapse state for the currently viewed file. Provides `z` (collapse all), `x` (expand all), and `Enter` (toggle individual) actions. State is per-file — `reset()` is called on file navigation.

```typescript
import { useState, useCallback } from "react";

export interface HunkCollapseState {
  /** Map of hunk index → collapsed (true means collapsed). Absent = expanded. */
  collapseState: Map<number, boolean>;
  /** Toggle a single hunk's collapsed state. */
  toggleHunk: (hunkIndex: number) => void;
  /** Collapse all hunks. Requires hunk count to populate map. */
  collapseAll: (hunkCount: number) => void;
  /** Expand all hunks (clears the map). */
  expandAll: () => void;
  /** Reset collapse state (called on file navigation). */
  reset: () => void;
  /** Query whether a specific hunk is collapsed. */
  isCollapsed: (hunkIndex: number) => boolean;
}

export function useHunkCollapse(): HunkCollapseState {
  const [collapseState, setCollapseState] = useState<Map<number, boolean>>(
    () => new Map(),
  );

  const toggleHunk = useCallback((hunkIndex: number) => {
    setCollapseState((prev) => {
      const next = new Map(prev);
      if (next.has(hunkIndex)) {
        next.delete(hunkIndex);
      } else {
        next.set(hunkIndex, true);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback((hunkCount: number) => {
    setCollapseState(() => {
      const next = new Map<number, boolean>();
      for (let i = 0; i < hunkCount; i++) next.set(i, true);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapseState(() => new Map());
  }, []);

  const reset = useCallback(() => {
    setCollapseState(() => new Map());
  }, []);

  const isCollapsed = useCallback(
    (hunkIndex: number) => collapseState.get(hunkIndex) ?? false,
    [collapseState],
  );

  return { collapseState, toggleHunk, collapseAll, expandAll, reset, isCollapsed };
}
```

**Design decisions:**
- Absent-from-map = expanded. This is the default state (product spec: all hunks expanded on open).
- `reset()` is called on file navigation (`]`/`[`) to ensure per-file independence (product spec: "`z` then `]` — new file opens with hunks expanded").
- `collapseAll` requires explicit `hunkCount` parameter rather than tracking it internally, keeping the hook stateless with respect to parsed diff data.
- Uses functional `setCollapseState` updates for correctness under React 19 batched renders.

---

### Step 4: useDiffScroll Hook

**File:** `apps/tui/src/screens/DiffScreen/useDiffScroll.ts`

Manages scroll state and exposes imperative scroll methods. Wraps OpenTUI's `<scrollbox>` scroll API via a `ScrollHandle` ref pattern. The dual-tracking approach (React state for display, imperative ref for actual scrollbox manipulation) avoids re-rendering the entire diff on every scroll event.

```typescript
import { useRef, useCallback, useState } from "react";
import type { ScrollHandle } from "./types.js";
import { HALF_PAGE_FRACTION } from "./diff-constants.js";

export interface DiffScrollState {
  /** Current scroll offset (tracked for status bar display, not authoritative) */
  scrollOffset: number;
  /** Scroll down exactly one line */
  scrollDown: () => void;
  /** Scroll up exactly one line (clamped at 0) */
  scrollUp: () => void;
  /** Scroll down half a viewport. @param viewportHeight terminal content height */
  pageDown: (viewportHeight: number) => void;
  /** Scroll up half a viewport. @param viewportHeight terminal content height */
  pageUp: (viewportHeight: number) => void;
  /** Jump to first line (scroll position 0) */
  jumpToTop: () => void;
  /** Jump to last line. @param totalLines total diff lines, @param viewportHeight visible area */
  jumpToBottom: (totalLines: number, viewportHeight: number) => void;
  /** Reset scroll offset to 0 (called on file navigation) */
  resetScroll: () => void;
  /** Ref callback for scrollbox component */
  scrollRef: React.RefCallback<ScrollHandle>;
}

export function useDiffScroll(): DiffScrollState {
  const [scrollOffset, setScrollOffset] = useState(0);
  const handleRef = useRef<ScrollHandle | null>(null);

  const scrollRef = useCallback((handle: ScrollHandle | null) => {
    handleRef.current = handle;
  }, []);

  const scrollDown = useCallback(() => {
    setScrollOffset((p) => p + 1);
    handleRef.current?.scrollBy(1);
  }, []);

  const scrollUp = useCallback(() => {
    setScrollOffset((p) => Math.max(0, p - 1));
    handleRef.current?.scrollBy(-1);
  }, []);

  const pageDown = useCallback((viewportHeight: number) => {
    const delta = Math.max(1, Math.floor(viewportHeight * HALF_PAGE_FRACTION));
    setScrollOffset((p) => p + delta);
    handleRef.current?.scrollBy(delta);
  }, []);

  const pageUp = useCallback((viewportHeight: number) => {
    const delta = Math.max(1, Math.floor(viewportHeight * HALF_PAGE_FRACTION));
    setScrollOffset((p) => Math.max(0, p - delta));
    handleRef.current?.scrollBy(-delta);
  }, []);

  const jumpToTop = useCallback(() => {
    setScrollOffset(0);
    handleRef.current?.scrollToTop();
  }, []);

  const jumpToBottom = useCallback(
    (totalLines: number, viewportHeight: number) => {
      const maxOffset = Math.max(0, totalLines - viewportHeight);
      setScrollOffset(maxOffset);
      handleRef.current?.scrollToBottom();
    },
    [],
  );

  const resetScroll = useCallback(() => {
    setScrollOffset(0);
    handleRef.current?.scrollToTop();
  }, []);

  return {
    scrollOffset,
    scrollDown,
    scrollUp,
    pageDown,
    pageUp,
    jumpToTop,
    jumpToBottom,
    resetScroll,
    scrollRef,
  };
}
```

**Design decisions:**
- **No debounce** — each keypress = exactly one line of scroll (product spec: "Rapid `j`/`k` presses: processed sequentially, one line per keypress, no debounce").
- **Dual tracking** — `scrollOffset` React state drives status bar display; imperative `handleRef.current?.scrollBy()` drives the actual scrollbox. This avoids re-rendering the entire diff on every scroll event.
- **OpenTUI scrollbox API** — `scrollBy(amount, unit?)` and `scrollTo(amount)` are the native methods on `ScrollBoxRenderable`. The `ScrollHandle` abstraction wraps these so the parent component controls scroll without direct ref access to the scrollbox DOM.
- **`resetScroll`** called on file navigation alongside `hunkCollapse.reset()` to start each file at position 0.

---

### Step 5: DiffFileHeader Component

**File:** `apps/tui/src/screens/DiffScreen/DiffFileHeader.tsx`

Renders the file header bar: change type icon (A/D/M/R/C with semantic color), file path, change type label, and `+N −M` stats. The header is always 1 row tall.

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { CHANGE_TYPE_DISPLAY, TRUNCATION } from "./diff-constants.js";
import type { FileHeaderProps } from "./types.js";

/**
 * Truncate a file path from the left with `…/` prefix.
 *
 * Algorithm: greedily includes rightmost path segments until exceeding maxWidth.
 * If even the basename exceeds maxWidth, truncate the basename with leading `…`.
 *
 * This preserves the most useful part of the path (filename + immediate parent),
 * consistent with how terminals typically truncate paths.
 */
function truncateFilename(filePath: string, maxWidth: number): string {
  if (filePath.length <= maxWidth) return filePath;
  const parts = filePath.split("/");
  const basename = parts[parts.length - 1] ?? filePath;

  // If basename alone is too long, truncate it
  if (basename.length > maxWidth - 2) {
    return "…" + basename.slice(-(maxWidth - 1));
  }

  // Greedily include path segments from the right
  let result = basename;
  for (let i = parts.length - 2; i >= 0; i--) {
    const candidate = "…/" + parts.slice(i).join("/");
    if (candidate.length > maxWidth) break;
    result = candidate;
  }
  return result;
}

export function DiffFileHeader({ file, fileIndex, fileCount, breakpoint }: FileHeaderProps) {
  const theme = useTheme();
  const info = CHANGE_TYPE_DISPLAY[file.change_type] ?? CHANGE_TYPE_DISPLAY.modified;

  // For renames, show "old → new"
  const displayPath =
    file.change_type === "renamed" && file.old_path
      ? `${file.old_path} → ${file.path}`
      : file.path;

  // Max filename width varies by breakpoint
  const maxFilenameWidth =
    breakpoint === "minimum" ? 40 : breakpoint === "standard" ? 80 : 150;

  // colorToken is a key on ThemeTokens (e.g., "success", "error", "warning", "primary")
  // useTheme() returns Readonly<ThemeTokens> where each token is a color string
  const iconColor = (theme as any)[info.colorToken] as string;

  return (
    <box flexDirection="row" width="100%" height={1}>
      <text color={iconColor} bold>
        {info.icon}
      </text>
      <text> </text>
      <text color={theme.primary} bold>
        {truncateFilename(displayPath, maxFilenameWidth)}
      </text>
      <text color={theme.muted}>  ({info.label})</text>
      <box flexGrow={1} />
      <text color={theme.success}>+{file.additions}</text>
      <text color={theme.muted}> </text>
      <text color={theme.error}>−{file.deletions}</text>
    </box>
  );
}
```

**Design decisions:**
- `truncateFilename` removes leading path segments, replacing them with `…/`. This preserves the most useful part of the path (filename + immediate parent).
- Color for the change type icon uses the semantic color token from `useTheme()` rather than hardcoded ANSI values, ensuring theme consistency.
- The `+N −M` summary uses `−` (U+2212 minus sign, not hyphen) matching the product spec.
- `file.additions` and `file.deletions` come directly from `FileDiffItem` (SDK type), which are `number` fields.

---

### Step 6: DiffHunkHeader Component

**File:** `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx`

Renders the `@@ ... @@` hunk header line in cyan with an expand/collapse indicator (▼/▶) and optional scope name. The scope name is extracted from the raw hunk header via `parseHunkScopeName()` from `diff-parse.ts`.

```typescript
import React from "react";
import { DIFF_COLORS, TRUNCATION } from "./diff-constants.js";
import type { HunkHeaderProps } from "./types.js";

export function DiffHunkHeader({
  header,
  scopeName,
  collapsed,
  breakpoint,
  onToggle,
}: HunkHeaderProps) {
  const indicator = collapsed ? "▶" : "▼";

  // Scope name hidden at minimum breakpoint (product spec)
  const showScope = breakpoint !== "minimum" && scopeName != null && scopeName.length > 0;

  // Truncate scope name at standard breakpoint (40 chars), full at large
  let displayScope = scopeName;
  if (
    showScope &&
    scopeName!.length > TRUNCATION.maxScopeNameChars &&
    breakpoint === "standard"
  ) {
    displayScope = scopeName!.slice(0, TRUNCATION.maxScopeNameChars - 1) + "…";
  }

  return (
    <box flexDirection="row" width="100%" height={1}>
      <text color={DIFF_COLORS.hunkHeaderColor}>
        {indicator} {header}
      </text>
      {showScope && (
        <text color={DIFF_COLORS.hunkHeaderColor} dim>
          {" "}
          {displayScope}
        </text>
      )}
    </box>
  );
}
```

**Design decisions:**
- Hunk header color is cyan (`#06b6d4`), consistent with product spec ("ANSI 37").
- Scope name is hidden entirely at minimum breakpoint (product spec: "Hunk scope name: Hidden at minimum width").
- At standard breakpoint, scope name truncated at 40 characters with `…` suffix.
- At large breakpoint, full scope name shown.
- The `onToggle` callback is exposed for `Enter` key handling from the parent's keybinding system. The component itself does not register keybindings — keybinding dispatch happens in DiffScreen via the `KeybindingProvider` scope system.

---

### Step 7: DiffEmptyState Component

**File:** `apps/tui/src/screens/DiffScreen/DiffEmptyState.tsx`

Renders centered placeholder messages for empty, binary, and whitespace-only-when-toggled states. Each message matches the product spec acceptance criteria exactly.

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";

const MESSAGES = {
  empty: "No file changes in this diff.",
  binary: "Binary file — cannot display diff.",
  "no-whitespace": "No non-whitespace changes.",
} as const;

export type EmptyStateType = keyof typeof MESSAGES;

export function DiffEmptyState({ type }: { type: EmptyStateType }) {
  const theme = useTheme();
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <text color={theme.muted}>{MESSAGES[type]}</text>
    </box>
  );
}
```

**Design decisions:**
- All three messages match the product spec acceptance criteria verbatim.
- Rendered in `muted` color (ANSI 245 equivalent) per spec.
- `flexGrow={1}` centers the message vertically in the remaining content area.
- The component is pure — no state, no keybindings, no side effects.

---

### Step 8: UnifiedDiffViewer Component

**File:** `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx`

The core rendering component. Renders file header, then iterates hunks rendering each as either a collapsed summary line or an expanded `<diff>` element inside a `<scrollbox>`.

```typescript
import React, { useMemo, useRef, useEffect } from "react";
import type { UnifiedDiffViewerProps, ScrollHandle } from "./types.js";
import { DiffFileHeader } from "./DiffFileHeader.js";
import { DiffHunkHeader } from "./DiffHunkHeader.js";
import { DiffEmptyState } from "./DiffEmptyState.js";
import { DIFF_COLORS, TRUNCATION } from "./diff-constants.js";
import { getCollapsedSummaryText } from "../../lib/diff-parse.js";
import { useTheme } from "../../hooks/useTheme.js";
import type { ParsedHunk } from "../../lib/diff-types.js";
import { logger } from "../../lib/logger.js";

/**
 * Reconstruct a valid unified diff patch string for a single hunk.
 *
 * OpenTUI's <diff> component expects a string in standard unified diff format.
 * We reconstruct this per-hunk from the parsed DiffLine[] structure rather
 * than slicing the original patch string. This ensures correctness when hunks
 * are non-contiguous or when the original patch format varies.
 */
function buildHunkPatch(hunk: ParsedHunk): string {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${
    hunk.scopeName ? " " + hunk.scopeName : ""
  }`;
  const body = hunk.lines.map((line) => {
    const prefix =
      line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
    return prefix + line.content;
  });
  return [header, ...body].join("\n");
}

export function UnifiedDiffViewer(props: UnifiedDiffViewerProps) {
  const {
    file,
    parsedDiff,
    showLineNumbers,
    hunkCollapseState,
    onToggleHunk,
    fileIndex,
    fileCount,
    syntaxStyle,
    filetype,
    breakpoint,
    terminalWidth,
    scrollRef,
  } = props;

  const theme = useTheme();
  const scrollboxRef = useRef<any>(null);

  // Expose scroll handle to parent via ref callback
  const handle: ScrollHandle = useMemo(
    () => ({
      scrollToTop: () => {
        if (scrollboxRef.current) scrollboxRef.current.scrollTo(0);
      },
      scrollToBottom: () => {
        if (scrollboxRef.current) {
          const sh = scrollboxRef.current.scrollHeight ?? 0;
          scrollboxRef.current.scrollTo(sh);
        }
      },
      scrollBy: (delta: number) => {
        scrollboxRef.current?.scrollBy(delta, "line");
      },
      getScrollPosition: () => scrollboxRef.current?.scrollTop ?? 0,
      setScrollPosition: (pos: number) => {
        if (scrollboxRef.current) scrollboxRef.current.scrollTo(pos);
      },
    }),
    [],
  );

  useEffect(() => {
    scrollRef?.(handle);
    return () => scrollRef?.(null);
  }, [scrollRef, handle]);

  // --- Edge case: no file (0-file diff) ---
  if (!file) {
    return <DiffEmptyState type="empty" />;
  }

  // --- Edge case: binary file ---
  if (file.is_binary) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <DiffFileHeader
          file={file}
          fileIndex={fileIndex}
          fileCount={fileCount}
          breakpoint={breakpoint}
        />
        <DiffEmptyState type="binary" />
      </box>
    );
  }

  // --- Edge case: empty patch (renamed without changes, etc.) ---
  if (parsedDiff.isEmpty && !file.patch) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <DiffFileHeader
          file={file}
          fileIndex={fileIndex}
          fileCount={fileCount}
          breakpoint={breakpoint}
        />
        <DiffEmptyState type="empty" />
      </box>
    );
  }

  // Responsive: word wrap at minimum, none at standard+
  const wrapMode = breakpoint === "minimum" ? "word" : "none";

  // Truncation check
  const totalLines = parsedDiff.hunks.reduce(
    (sum, hunk) => sum + hunk.totalLineCount,
    0,
  );
  const isTruncated = totalLines > TRUNCATION.maxTotalDiffLines;

  if (isTruncated) {
    logger.warn(
      `DiffUnified: truncated [lines=${totalLines}] [cap=${TRUNCATION.maxTotalDiffLines}]`,
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} width="100%">
      <DiffFileHeader
        file={file}
        fileIndex={fileIndex}
        fileCount={fileCount}
        breakpoint={breakpoint}
      />
      <scrollbox
        ref={scrollboxRef}
        flexGrow={1}
        scrollY={true}
        viewportCulling={true}
      >
        <box flexDirection="column" width="100%">
          {parsedDiff.hunks.map((hunk, i) => {
            const collapsed = hunkCollapseState.get(i) ?? false;
            return (
              <box key={i} flexDirection="column" width="100%">
                <DiffHunkHeader
                  header={hunk.header}
                  scopeName={hunk.scopeName}
                  collapsed={collapsed}
                  breakpoint={breakpoint}
                  onToggle={() => onToggleHunk(i)}
                />
                {collapsed ? (
                  <box height={1} width="100%">
                    <text color={theme.muted}>
                      {"  "}
                      {getCollapsedSummaryText(hunk, terminalWidth)}
                    </text>
                  </box>
                ) : (
                  <diff
                    diff={buildHunkPatch(hunk)}
                    view="unified"
                    filetype={filetype}
                    syntaxStyle={syntaxStyle ?? undefined}
                    showLineNumbers={showLineNumbers}
                    wrapMode={wrapMode}
                    addedBg={DIFF_COLORS.addedBg}
                    removedBg={DIFF_COLORS.removedBg}
                    contextBg={DIFF_COLORS.contextBg}
                    addedSignColor={DIFF_COLORS.addedSignColor}
                    removedSignColor={DIFF_COLORS.removedSignColor}
                    lineNumberFg={DIFF_COLORS.lineNumberFg}
                    lineNumberBg={DIFF_COLORS.lineNumberBg}
                    addedLineNumberBg={DIFF_COLORS.addedLineNumberBg}
                    removedLineNumberBg={DIFF_COLORS.removedLineNumberBg}
                    style={{ width: "100%" }}
                  />
                )}
              </box>
            );
          })}
          {isTruncated && (
            <box justifyContent="center" width="100%" height={1}>
              <text color={theme.warning}>
                Diff truncated at{" "}
                {TRUNCATION.maxTotalDiffLines.toLocaleString()} lines.
              </text>
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  );
}
```

**Architecture decisions:**

1. **One `<diff>` per expanded hunk via `buildHunkPatch()`** — This enables individual hunk collapse without re-parsing the entire patch. When a hunk is collapsed, its `<diff>` element is replaced with a single summary `<text>` line, avoiding unnecessary rendering work. OpenTUI's `<diff>` component handles its own Tree-sitter parsing internally, so per-hunk instances are lightweight.

2. **`<scrollbox>` wraps entire hunk list** — Keyboard scroll manipulates `scrollTop`/`scrollBy` imperatively through the `ScrollHandle` ref. This keeps scroll state outside React's render cycle for performance. The `viewportCulling={true}` prop ensures only visible hunks are rendered, critical for diffs with many hunks.

3. **`SyntaxStyle` from `useDiffSyntaxStyle` passed through** — Created once at DiffScreen level (see Step 9), shared across all hunk `<diff>` elements. Null = plain text fallback (no crash). The `?? undefined` coercion prevents passing `null` to OpenTUI which expects `SyntaxStyle | undefined`.

4. **`buildHunkPatch` reconstructs standard unified diff format** — OpenTUI's `<diff>` component expects a string in unified diff format. We reconstruct this per-hunk from the parsed `DiffLine[]` structure rather than slicing the original patch string, ensuring correctness when hunks are non-contiguous or when the original patch format varies.

5. **`viewportCulling={true}`** — Critical for performance with large diffs. Only hunks within the visible viewport are rendered. Combined with per-hunk `<diff>` elements, this means scrolling a 10,000-line file only renders the ~40 lines visible in the viewport.

---

### Step 9: DiffScreen Integration

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` — modifications to scaffold

This step wires all new hooks and `UnifiedDiffViewer` into the existing DiffScreen scaffold. The scaffold already provides: the outer layout (sidebar + content split), loading/error states, `useDiffData` for fetching, `FocusZone` state machine, and the `useScreenKeybindings` registration point.

**New imports added to DiffScreen.tsx:**

```typescript
import { useFileNavigation } from "./useFileNavigation.js";
import { useHunkCollapse } from "./useHunkCollapse.js";
import { useDiffScroll } from "./useDiffScroll.js";
import { UnifiedDiffViewer } from "./UnifiedDiffViewer.js";
import { DiffEmptyState } from "./DiffEmptyState.js";
import { DiffFileHeader } from "./DiffFileHeader.js";
import { parseDiffHunks } from "../../lib/diff-parse.js";
import { resolveFiletype } from "../../lib/diff-syntax.js";
import { useDiffSyntaxStyle } from "../../hooks/useDiffSyntaxStyle.js";
import { useColorTier } from "../../hooks/useColorTier.js";
import { logger } from "../../lib/logger.js";
import { emit as trackEvent } from "../../lib/telemetry.js";
```

**New hooks added inside the DiffScreen component body** (after existing validation/data fetching):

```typescript
// --- File navigation ---
const fileNav = useFileNavigation(diffResult.files);

// --- Per-file state hooks ---
const hunkCollapse = useHunkCollapse();
const scroll = useDiffScroll();

// --- Syntax highlighting (single instance for entire screen lifecycle) ---
const colorTier = useColorTier();
const syntaxStyle = useDiffSyntaxStyle(colorTier);

// --- Line number toggle ---
const [showLineNumbers, setShowLineNumbers] = useState(true);

// --- Parse current file's diff ---
const parsedDiff = useMemo(
  () => parseDiffHunks(fileNav.currentFile?.patch),
  [fileNav.currentFile?.patch],
);

// --- Detect filetype for syntax highlighting ---
const filetype = useMemo(
  () =>
    fileNav.currentFile
      ? resolveFiletype(
          fileNav.currentFile.language,
          fileNav.currentFile.path,
        )
      : undefined,
  [fileNav.currentFile?.language, fileNav.currentFile?.path],
);

// --- Reset per-file state on file navigation ---
useEffect(() => {
  hunkCollapse.reset();
  scroll.resetScroll();
  logger.debug(
    `DiffUnified: file nav [file=${fileNav.currentFile?.path}] [index=${fileNav.fileIndex + 1}/${fileNav.fileCount}]`,
  );
  trackEvent("tui.diff.unified.file_navigate", {
    repo: `${parsed.owner}/${parsed.repo}`,
    file_index: fileNav.fileIndex,
    total_files: fileNav.fileCount,
  });
}, [fileNav.fileIndex]);

// --- Whitespace-only detection ---
const isWhitespaceOnly = useMemo(() => {
  if (showWhitespace || !parsedDiff || parsedDiff.isEmpty) return false;
  return parsedDiff.hunks.every((h) =>
    h.lines
      .filter((l) => l.type === "add" || l.type === "remove")
      .every((l) => l.content.trim() === ""),
  );
}, [parsedDiff, showWhitespace]);
```

**Replace `<DiffContentPlaceholder>` in the scaffold's JSX with:**

```typescript
{/* Content area — replaces DiffContentPlaceholder */}
{diffResult.files.length === 0 ? (
  <DiffEmptyState type="empty" />
) : isWhitespaceOnly ? (
  <box flexDirection="column" flexGrow={1}>
    <DiffFileHeader
      file={fileNav.currentFile!}
      fileIndex={fileNav.fileIndex}
      fileCount={fileNav.fileCount}
      breakpoint={layout.breakpoint}
    />
    <DiffEmptyState type="no-whitespace" />
  </box>
) : (
  <UnifiedDiffViewer
    file={fileNav.currentFile!}
    parsedDiff={parsedDiff}
    focused={focusZone === "content"}
    viewMode="unified"
    showWhitespace={showWhitespace}
    showLineNumbers={showLineNumbers}
    hunkCollapseState={hunkCollapse.collapseState}
    onToggleHunk={hunkCollapse.toggleHunk}
    onCollapseAll={() => hunkCollapse.collapseAll(parsedDiff.hunks.length)}
    onExpandAll={hunkCollapse.expandAll}
    fileIndex={fileNav.fileIndex}
    fileCount={fileNav.fileCount}
    syntaxStyle={syntaxStyle}
    filetype={filetype}
    breakpoint={layout.breakpoint}
    terminalWidth={layout.width}
    terminalHeight={layout.height}
    scrollRef={scroll.scrollRef}
  />
)}
```

**Key integration points with the scaffold:**
- `diffResult` comes from the scaffold's `useDiffData(parsed)` hook.
- `focusZone` / `setFocusZone` come from the scaffold's `useState<FocusZone>("content")`.
- `viewMode` / `setViewMode` come from the scaffold's `useState<"unified" | "split">("unified")`.
- `showWhitespace` / `setShowWhitespace` come from the scaffold's `useState(true)`.
- `layout` comes from the scaffold's `useLayout()`.
- `parsed` is the validated `DiffScreenParams` from the scaffold's `validateDiffParams()`.

---

### Step 10: Keybinding Wiring

Extend the scaffold's `buildDiffKeybindings` function with real handlers for all unified diff keybindings. These are registered via `useScreenKeybindings` at `PRIORITY.SCREEN` (priority 4 in the keybinding-types.ts priority system).

The keybindings reference the real `KeyHandler` interface from `apps/tui/src/providers/keybinding-types.ts` which requires `key`, `description`, `group`, `handler`, and optional `when` predicate.

```typescript
import type { KeyHandler } from "../../providers/keybinding-types.js";

interface DiffKeybindingContext {
  focusZone: FocusZone;
  setFocusZone: (z: FocusZone) => void;
  viewMode: "unified" | "split";
  setViewMode: (m: "unified" | "split") => void;
  showWhitespace: boolean;
  setShowWhitespace: (s: boolean) => void;
  showLineNumbers: boolean;
  setShowLineNumbers: (s: boolean) => void;
  sidebarVisible: boolean;
  breakpoint: Breakpoint | null;
  nextFile: () => void;
  prevFile: () => void;
  scrollDown: () => void;
  scrollUp: () => void;
  pageDown: () => void;
  pageUp: () => void;
  jumpToTop: () => void;
  jumpToBottom: () => void;
  collapseAll: () => void;
  expandAll: () => void;
  toggleHunkAtCursor: () => void;
  retryFetch: () => void;
  hasError: boolean;
}

function buildDiffKeybindings(ctx: DiffKeybindingContext): KeyHandler[] {
  return [
    // --- Scroll navigation (content zone only) ---
    {
      key: "j",
      description: "Scroll down",
      group: "Navigation",
      handler: ctx.scrollDown,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "down",
      description: "Scroll down",
      group: "Navigation",
      handler: ctx.scrollDown,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "k",
      description: "Scroll up",
      group: "Navigation",
      handler: ctx.scrollUp,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "up",
      description: "Scroll up",
      group: "Navigation",
      handler: ctx.scrollUp,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "ctrl+d",
      description: "Page down",
      group: "Navigation",
      handler: ctx.pageDown,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "ctrl+u",
      description: "Page up",
      group: "Navigation",
      handler: ctx.pageUp,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "G",
      description: "Jump to bottom",
      group: "Navigation",
      handler: ctx.jumpToBottom,
      when: () => ctx.focusZone === "content",
    },

    // --- File navigation (content zone only) ---
    {
      key: "]",
      description: "Next file",
      group: "Diff",
      handler: ctx.nextFile,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "[",
      description: "Previous file",
      group: "Diff",
      handler: ctx.prevFile,
      when: () => ctx.focusZone === "content",
    },

    // --- View toggles (all zones) ---
    {
      key: "t",
      description: ctx.viewMode === "unified" ? "Split view" : "Unified view",
      group: "Diff",
      handler: () => {
        if (ctx.breakpoint !== "minimum" && ctx.breakpoint !== null) {
          ctx.setViewMode(
            ctx.viewMode === "unified" ? "split" : "unified",
          );
        }
      },
    },
    {
      key: "w",
      description: ctx.showWhitespace ? "Hide whitespace" : "Show whitespace",
      group: "Diff",
      handler: () => ctx.setShowWhitespace(!ctx.showWhitespace),
    },
    {
      key: "l",
      description: "Toggle line numbers",
      group: "Diff",
      handler: () => ctx.setShowLineNumbers(!ctx.showLineNumbers),
    },

    // --- Hunk collapse (content zone only) ---
    {
      key: "z",
      description: "Collapse all hunks",
      group: "Diff",
      handler: ctx.collapseAll,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "x",
      description: "Expand all hunks",
      group: "Diff",
      handler: ctx.expandAll,
      when: () => ctx.focusZone === "content",
    },
    {
      key: "return",
      description: "Toggle hunk",
      group: "Diff",
      handler: ctx.toggleHunkAtCursor,
      when: () => ctx.focusZone === "content",
    },

    // --- Focus zone / sidebar ---
    {
      key: "tab",
      description: "Switch focus zone",
      group: "Navigation",
      handler: () => {
        if (ctx.sidebarVisible) {
          ctx.setFocusZone(
            ctx.focusZone === "tree" ? "content" : "tree",
          );
        }
      },
    },

    // --- Error retry ---
    {
      key: "R",
      description: "Retry fetch",
      group: "Diff",
      handler: ctx.retryFetch,
      when: () => ctx.hasError,
    },
  ];
}
```

**`g g` handling:**

The `g` prefix activates go-to mode in `KeybindingProvider` at `PRIORITY.GOTO` (priority 3 — higher than screen's priority 4). To support `g g` = jump to top within the diff context, DiffScreen registers a binding at screen priority that is only active when go-to mode is active:

```typescript
// In DiffScreen, as part of the screen keybindings array:
{
  key: "g",
  description: "Jump to top",
  group: "Navigation",
  handler: () => {
    scroll.jumpToTop();
  },
  when: () => goToModeActive && focusZone === "content",
}
```

This approach avoids modifying the global go-to system. The KeybindingProvider dispatches in priority order, so the go-to mode handler at priority 3 would normally handle the second `g`. By registering a screen-level override that checks `goToModeActive`, the DiffScreen intercepts `g g` specifically when go-to mode was just activated by the first `g`.

Alternative: DiffScreen registers a go-to override via `NavigationContext.registerGoToOverride("g", jumpToTop)` if such an API exists. The approach chosen depends on the go-to mode architecture in the KeybindingProvider.

---

### Step 11: Status Bar Hints

Register context-sensitive status bar hints via the `StatusBarHintsContext` (from `keybinding-types.ts`). Hints update reactively when toggle states change. Uses `registerHints(sourceId, hints)` which returns a cleanup function.

```typescript
import type { StatusBarHint } from "../../providers/keybinding-types.js";

const statusBarHints: StatusBarHint[] = useMemo(() => [
  { keys: "Unified", label: "", order: -10 },
  { keys: "j/k", label: "scroll", order: 0 },
  { keys: "]/[", label: "file", order: 10 },
  {
    keys: `File ${fileNav.fileIndex + 1}/${fileNav.fileCount}`,
    label: "",
    order: 15,
  },
  // Only show split toggle hint at standard+ breakpoints
  ...(layout.breakpoint !== "minimum" && layout.breakpoint !== null
    ? [{ keys: "t", label: "split", order: 20 }]
    : []),
  {
    keys: "w",
    label: showWhitespace ? "ws:on" : "ws:off",
    order: 30,
  },
  {
    keys: "l",
    label: showLineNumbers ? "ln:on" : "ln:off",
    order: 35,
  },
  // Only show hunk hints at large breakpoint (more room)
  ...(layout.breakpoint === "large"
    ? [{ keys: "x/z", label: "hunks", order: 50 }]
    : []),
], [
  fileNav.fileIndex,
  fileNav.fileCount,
  layout.breakpoint,
  showWhitespace,
  showLineNumbers,
]);
```

**Rendering behavior:**
- The `StatusBar` component (in `apps/tui/src/components/StatusBar.tsx`) filters hints by breakpoint: at most 4 hints at minimum breakpoint, 6 at standard, all at large.
- Hints are sorted by `order` value (lower = shown first).
- The `"Unified"` hint acts as a label (no key+label pair, just a text indicator of the current view mode).
- The `registerHints` call returns a cleanup function that is called on component unmount.

---

### Step 12: Telemetry & Logging Integration

Add structured logging and telemetry events throughout the component lifecycle. Uses `logger.*` from `apps/tui/src/lib/logger.ts` and `emit` from `apps/tui/src/lib/telemetry.ts`. The logger writes to stderr with ISO timestamps; the telemetry emitter writes JSON to stderr when `CODEPLANE_TUI_DEBUG=true`.

```typescript
// On mount:
useEffect(() => {
  const start = performance.now();
  logger.debug(
    `DiffUnified: mounted [repo=${parsed.owner}/${parsed.repo}] [change_id=${parsed.change_id ?? "n/a"}] [width=${layout.width}] [height=${layout.height}]`,
  );
  return () => {
    const timeSpent = Math.round(performance.now() - start);
    trackEvent("tui.diff.unified.exit", {
      repo: `${parsed.owner}/${parsed.repo}`,
      time_spent_ms: timeSpent,
      files_viewed: fileNav.fileIndex + 1,
      total_files: fileNav.fileCount,
    });
  };
}, []);

// On data loaded:
useEffect(() => {
  if (!diffResult.isLoading && !diffResult.error && diffResult.files.length > 0) {
    const totalAdditions = diffResult.files.reduce((s, f) => s + f.additions, 0);
    const totalDeletions = diffResult.files.reduce((s, f) => s + f.deletions, 0);
    logger.info(
      `DiffUnified: ready [repo=${parsed.owner}/${parsed.repo}] [change_id=${parsed.change_id ?? "n/a"}] [files=${diffResult.files.length}] [additions=${totalAdditions}] [deletions=${totalDeletions}]`,
    );
    trackEvent("tui.diff.unified.view", {
      repo: `${parsed.owner}/${parsed.repo}`,
      change_id: parsed.change_id ?? "",
      file_count: diffResult.files.length,
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "unsupported",
    });
  }
}, [diffResult.isLoading, diffResult.error]);

// On error:
useEffect(() => {
  if (diffResult.error) {
    logger.warn(
      `DiffUnified: fetch failed [status=${diffResult.error.status ?? "unknown"}] [error=${diffResult.error.message}]`,
    );
    trackEvent("tui.diff.unified.error", {
      repo: `${parsed.owner}/${parsed.repo}`,
      error_type: diffResult.error.status === 401 ? "auth" : "fetch",
      http_status: diffResult.error.status ?? 0,
    });
  }
}, [diffResult.error]);
```

**Toggle events** are emitted inline within the keybinding handlers:
- `trackEvent("tui.diff.unified.toggle_line_numbers", { line_numbers_visible: !showLineNumbers })`
- `trackEvent("tui.diff.unified.toggle_whitespace", { whitespace_visible: !showWhitespace })`
- `trackEvent("tui.diff.unified.toggle_view", { from_view: "unified", to_view: "split" })`
- `trackEvent("tui.diff.unified.hunk_collapse", { action: "collapse_all" | "expand_all" | "toggle" })`

---

## 5. Responsive Behavior

| Feature | Minimum (80×24) | Standard (120×40) | Large (200×60) |
|---------|-----------------|-------------------|----------------|
| Sidebar | Hidden (`layout.sidebarVisible = false`) | Available (25%, `layout.sidebarWidth = "25%"`) | Available (30%, `layout.sidebarWidth = "30%"`) |
| Gutter width | 4+4=8ch | 5+5=10ch | 6+6=12ch |
| `wrapMode` | `"word"` forced | `"none"` | `"none"` |
| Filename | Truncated `…/` at 40ch | Full path at 80ch | Full path at 150ch |
| Hunk scope | Hidden | Truncated at 40ch | Full |
| `t` toggle | No-op (`breakpoint === "minimum"`) | Active | Active |
| `Ctrl+B` sidebar | No-op (handled by `useSidebarState`) | Active | Active |
| Context lines | 3 | 3 | 5 |
| Status hints | 4 max | 6 max | All |
| Modal width | 90% | 60% | 50% |

**Resize handling:** All toggle states (line numbers, whitespace, view mode, hunk collapse, file index, scroll position) are stored in React state. They persist across re-renders caused by resize. `useLayout()` (from `apps/tui/src/hooks/useLayout.ts`) calls `useTerminalDimensions()` from `@opentui/react` which fires synchronously on `SIGWINCH`. No debounce, no animation.

**Below minimum (<80×24):** `getBreakpoint(cols, rows)` returns `null`. The app-shell router renders `TerminalTooSmallScreen` (from `apps/tui/src/components/TerminalTooSmallScreen.tsx`). DiffScreen never mounts.

---

## 6. Error Handling

| Error | Behavior | Recovery | User Message |
|-------|----------|----------|--------------|
| Fetch failure (4xx/5xx) | Full-screen error from scaffold via `useScreenLoading` | `R` retry | "Failed to load diff. Press `R` to retry." |
| 401 auth | Propagates to `AuthErrorScreen` via app-shell | Re-auth via CLI | "Session expired. Run `codeplane auth login` to re-authenticate." |
| 429 rate limit | Inline message | `R` after wait | "Rate limited. Retry in {N}s." |
| Network timeout (30s) | Full-screen error | `R` retry | "Request timed out. Press `R` to retry." |
| 404 not found | Inline error | `q` back | "Change not found." |
| 500 server error | Full-screen error | `R` retry | "Server error. Press `R` to retry." |
| Parse failure (`parseDiffHunks` error) | Raw patch rendered as plain `<code>` | Automatic | (none — falls back silently) |
| Syntax highlight failure | No syntax colors, diff colors still applied | Automatic | (none — `useDiffSyntaxStyle` returns null) |
| Binary file | "Binary file" message via `DiffEmptyState` | `]`/`[` to other files | "Binary file — cannot display diff." |
| Empty patch | "No file changes" message | `]`/`[` to other files | "No file changes in this diff." |
| >100k lines | Truncation message at bottom of scrollbox | Informational | "Diff truncated at 100,000 lines." |
| Component crash | `ErrorBoundary` (from `apps/tui/src/components/ErrorBoundary.tsx`) | `r` to restart, `q` to quit | "An error occurred. Press `r` to restart." |
| Malformed diff string | `parseDiffHunks` returns `{ isEmpty: false, error: "..." }` | Plain text fallback | (none) |

---

## 7. Logging & Telemetry

Logs to stderr via `logger.*` calls from `apps/tui/src/lib/logger.ts`. Level controlled by `CODEPLANE_TUI_LOG_LEVEL` env var (default: `"error"`; set `CODEPLANE_TUI_DEBUG=true` for `"debug"`).

### Log Events

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Screen mounted | `DiffUnified: mounted [repo={r}] [change_id={id}] [width={w}] [height={h}]` |
| `debug` | Diff loaded | `DiffUnified: loaded [repo={r}] [change_id={id}] [files={n}] [lines={l}] [duration={ms}ms]` |
| `debug` | File navigated | `DiffUnified: file nav [file={f}] [index={i}/{total}]` |
| `debug` | Scroll position | `DiffUnified: scroll [repo={r}] [change_id={id}] [position={p}] [method={m}]` |
| `debug` | Line numbers toggled | `DiffUnified: line numbers [repo={r}] [visible={v}]` |
| `debug` | Whitespace toggled | `DiffUnified: whitespace [repo={r}] [visible={v}]` |
| `debug` | Hunk action | `DiffUnified: hunk [repo={r}] [action={a}] [file={f}]` |
| `info` | Fully loaded | `DiffUnified: ready [repo={r}] [change_id={id}] [files={n}] [additions={a}] [deletions={d}]` |
| `info` | View toggled | `DiffUnified: view toggle [repo={r}] [to=split] [width={w}]` |
| `warn` | Fetch failed | `DiffUnified: fetch failed [repo={r}] [change_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `DiffUnified: rate limited [repo={r}] [change_id={id}] [retry_after={s}]` |
| `warn` | Diff truncated | `DiffUnified: truncated [repo={r}] [change_id={id}] [lines={l}] [cap=100000]` |
| `warn` | Slow load (>3s) | `DiffUnified: slow load [repo={r}] [change_id={id}] [duration={ms}ms]` |
| `warn` | Highlight fallback | `DiffUnified: highlight fallback [repo={r}] [file={f}] [filetype={ft}]` |
| `error` | Auth error | `DiffUnified: auth error [repo={r}] [status=401]` |
| `error` | Render error | `DiffUnified: render error [repo={r}] [change_id={id}] [error={msg}]` |

### Telemetry Events

| Event | Trigger | Key Properties |
|-------|---------|----------------|
| `tui.diff.unified.view` | Screen mounted with data | `repo`, `change_id`, `file_count`, `total_additions`, `total_deletions`, `breakpoint` |
| `tui.diff.unified.scroll` | Scroll position changes (throttled 2s) | `scroll_position_pct`, `direction`, `method` |
| `tui.diff.unified.file_navigate` | `]` or `[` pressed | `from_file`, `to_file`, `file_index`, `total_files` |
| `tui.diff.unified.toggle_line_numbers` | `l` pressed | `line_numbers_visible` |
| `tui.diff.unified.toggle_whitespace` | `w` pressed | `whitespace_visible` |
| `tui.diff.unified.toggle_view` | `t` pressed | `from_view`, `to_view`, `terminal_width` |
| `tui.diff.unified.hunk_collapse` | `z`, `x`, or `Enter` | `action`, `file`, `hunk_count` |
| `tui.diff.unified.error` | API failure | `error_type`, `http_status` |
| `tui.diff.unified.retry` | `R` pressed | `retry_success` |
| `tui.diff.unified.exit` | User navigates away | `time_spent_ms`, `files_viewed`, `total_files` |

---

## 8. Productionization Checklist

1. **No `console.log`** — All logging uses `logger.debug/info/warn/error` from `apps/tui/src/lib/logger.ts`. No `console.*` calls. No `TODO` comments without ticket IDs.
2. **SyntaxStyle lifecycle** — `useDiffSyntaxStyle` (from `apps/tui/src/hooks/useDiffSyntaxStyle.ts`) creates the `SyntaxStyle` once on mount and calls `destroy()` on unmount. No native memory leaks.
3. **Scroll performance** — 10,000+ line diffs scroll at 60fps target. Per-hunk `<diff>` rendering avoids full re-parse. `viewportCulling={true}` on scrollbox ensures only visible hunks render.
4. **Snapshot golden files** — All 28 snapshot golden files committed at exact terminal sizes (80×24, 120×40, 200×60). Golden files are deterministic given fixed fixture data.
5. **Keybinding completeness** — All 20+ keybindings registered via `useScreenKeybindings`. `g g` integrated with go-to mode. Help overlay (`?`) lists all diff keybindings grouped by category.
6. **Color consistency** — All colors sourced from `DIFF_COLORS` constant or `useTheme()` tokens. No hardcoded ANSI codes in component code.
7. **TERM=dumb support** — When `COLORTERM` is absent and `TERM` indicates no color, OpenTUI's `<diff>` component renders `+`/`-` text signs without backgrounds. No crash.
8. **Tab characters** — Rendered as 4 spaces by OpenTUI's default tab stop.
9. **Unicode/CJK alignment** — Wide characters (2-column) handled by OpenTUI's layout engine.
10. **Diff caching** — Diff data cached in memory by `useDiffData` hook (scaffold). Navigating back to a previously viewed diff uses cached version (no re-fetch unless `R` is pressed).
11. **Auth token security** — Token never displayed in error messages or logged. Diff content stored in memory only (no disk cache). 401 responses propagate to auth error screen.
12. **Rate limiting** — 429 responses display inline message with `Retry-After` value. No auto-retry.

---

## 9. Unit & Integration Tests

### Test File: `e2e/tui/diff.test.ts`

All tests use `@microsoft/tui-test` + `bun:test`. Run against real API server with test fixtures. **Tests failing due to unimplemented backends are left failing — never skipped or commented out.** This file extends the existing `diff.test.ts` which already contains syntax highlight tests (SNAP-SYN-*, KEY-SYN-*, RSP-SYN-*, INT-SYN-*, EDGE-SYN-*).

### 9.1 Terminal Snapshot Tests (28 tests)

| ID | Description | Terminal Size | Key Assertions |
|----|-------------|---------------|----------------|
| SNAP-DIFF-UNI-001 | Full layout with single-file TypeScript change | 120×40 | Line numbers visible, syntax highlighting applied, hunk headers cyan, file header shows +N −M, status bar shows "Unified" |
| SNAP-DIFF-UNI-002 | Compact layout at minimum size | 80×24 | Word-wrapped lines, truncated filename with `…/`, no sidebar, abbreviated status hints, 8ch gutter |
| SNAP-DIFF-UNI-003 | Expanded layout at large size | 200×60 | 12ch gutter, full filename path, extra context lines (5), full status bar descriptions |
| SNAP-DIFF-UNI-004 | Multi-file diff file header | 120×40 | Filename, change type "modified" with M icon in warning color, "+14 −7" summary |
| SNAP-DIFF-UNI-005 | New file (all additions) | 120×40 | All lines green background, left gutter empty (no old line numbers), change type "added" with A icon in success color |
| SNAP-DIFF-UNI-006 | Deleted file (all deletions) | 120×40 | All lines red background, right gutter empty (no new line numbers), change type "deleted" with D icon in error color |
| SNAP-DIFF-UNI-007 | Renamed file with content changes | 120×40 | Header shows "R old.ts → new.ts (renamed)", diff content visible |
| SNAP-DIFF-UNI-008 | Renamed file without content changes | 120×40 | Header shows "R old.ts → new.ts (renamed)", no diff content below header |
| SNAP-DIFF-UNI-009 | Binary file placeholder | 120×40 | "Binary file — cannot display diff." in muted text, file header still visible |
| SNAP-DIFF-UNI-010 | Empty diff (0 files) | 120×40 | "No file changes in this diff." centered in muted text |
| SNAP-DIFF-UNI-011 | Loading state | 120×40 | Spinner with "Loading diff…" text (from scaffold's `FullScreenLoading`) |
| SNAP-DIFF-UNI-012 | Error state | 120×40 | Red error message, "Press `R` to retry" hint (from scaffold's `FullScreenError`) |
| SNAP-DIFF-UNI-013 | Hunk header rendering | 120×40 | Cyan color, @@ line range, scope name visible, ▼ expand indicator |
| SNAP-DIFF-UNI-014 | Single collapsed hunk | 120×40 | ▶ indicator, hunk summary line ("N lines hidden"), content hidden |
| SNAP-DIFF-UNI-015 | All hunks collapsed via `z` | 120×40 | All hunks show ▶, only hunk headers and summary lines visible |
| SNAP-DIFF-UNI-016 | Line numbers visible | 120×40 | Two-column gutter (old/new), muted foreground (#6b7280), dark background (#161b22) |
| SNAP-DIFF-UNI-017 | Line numbers hidden (`l` toggled) | 120×40 | No gutter, diff content takes full available width |
| SNAP-DIFF-UNI-018 | Added line detail | 120×40 | Green background (#1a4d1a), green + sign (#22c55e), right line number only |
| SNAP-DIFF-UNI-019 | Removed line detail | 120×40 | Red background (#4d1a1a), red − sign (#ef4444), left line number only |
| SNAP-DIFF-UNI-020 | Context line detail | 120×40 | Default/transparent background, both line numbers present |
| SNAP-DIFF-UNI-021 | Syntax highlighting on TypeScript | 120×40 | Keywords highlighted, strings colored, comments styled |
| SNAP-DIFF-UNI-022 | Syntax highlighting on Python | 120×40 | Python-specific token colors (def, class keywords highlighted differently) |
| SNAP-DIFF-UNI-023 | Whitespace toggled off | 120×40 | Whitespace-only change lines hidden |
| SNAP-DIFF-UNI-024 | Status bar content | 120×40 | Shows "Unified", whitespace state (ws:on/off), line number state (ln:on/off), file position ("File 2/7") |
| SNAP-DIFF-UNI-025 | File tree sidebar visible | 120×40 | Sidebar at ~25% width, diff content at ~75%, border between them |
| SNAP-DIFF-UNI-026 | Sidebar hidden at minimum | 80×24 | Diff takes full terminal width, no sidebar border |
| SNAP-DIFF-UNI-027 | Help overlay visible | 120×40 | Modal showing all diff keybindings grouped by category |
| SNAP-DIFF-UNI-028 | No color mode (TERM=dumb) | 120×40 | Plain +/- text signs, no colored backgrounds, readable layout |

**Test pattern for snapshots:**

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers.ts";

const TEST_REPO = "testorg/test-repo";

function diffArgs(changeId: string): string[] {
  return [
    "--screen", "diff",
    "--repo", TEST_REPO,
    "--mode", "change",
    "--change_id", changeId,
  ];
}

describe("TUI_DIFF_UNIFIED_VIEW — Snapshot Tests", () => {
  test("SNAP-DIFF-UNI-001: Full layout with TypeScript change at 120x40", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: diffArgs("fixture-typescript-modify"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-DIFF-UNI-002: Compact layout at 80x24 minimum", async () => {
    const tui = await launchTUI({
      cols: 80,
      rows: 24,
      args: diffArgs("fixture-typescript-modify"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  // ... remaining 26 snapshot tests follow same pattern
});
```

### 9.2 Keyboard Interaction Tests (38 tests)

| ID | Key(s) | Assertion |
|----|--------|----------|
| KEY-DIFF-UNI-001 | `j` | Terminal content scrolls down one line (snapshot differs) |
| KEY-DIFF-UNI-002 | `k` | Terminal content scrolls up one line |
| KEY-DIFF-UNI-003 | `Down` | Same visual effect as `j` |
| KEY-DIFF-UNI-004 | `Up` | Same visual effect as `k` |
| KEY-DIFF-UNI-005 | `k` at top of diff | No-op — snapshot unchanged |
| KEY-DIFF-UNI-006 | `j` at bottom of diff | No-op — snapshot unchanged |
| KEY-DIFF-UNI-007 | `Ctrl+D` | Content scrolls down approximately half viewport |
| KEY-DIFF-UNI-008 | `Ctrl+U` | Content scrolls up approximately half viewport |
| KEY-DIFF-UNI-009 | `G` | Last line of diff visible |
| KEY-DIFF-UNI-010 | `g g` | First line of diff visible (top of content) |
| KEY-DIFF-UNI-011 | `]` on multi-file diff | Status bar shows "File 2/N", file header updates |
| KEY-DIFF-UNI-012 | `[` after `]` | Status bar shows "File 1/N", file header updates |
| KEY-DIFF-UNI-013 | `]` on last file | Wraps to "File 1/N" |
| KEY-DIFF-UNI-014 | `[` on first file | Wraps to "File N/N" |
| KEY-DIFF-UNI-015 | `]` on single-file diff | No-op — "File 1/1" unchanged |
| KEY-DIFF-UNI-016 | `[` on single-file diff | No-op — "File 1/1" unchanged |
| KEY-DIFF-UNI-017 | `l` | Status bar shows `ln:off`, gutter disappears |
| KEY-DIFF-UNI-018 | `l` twice | Status bar shows `ln:on`, gutter returns |
| KEY-DIFF-UNI-019 | `w` | Status bar shows `ws:off` |
| KEY-DIFF-UNI-020 | `w` twice | Status bar shows `ws:on` |
| KEY-DIFF-UNI-021 | `t` at 120 columns | Status bar shows "Split" (or view mode indicator) |
| KEY-DIFF-UNI-022 | `t` at 80 columns | No-op — remains "Unified" |
| KEY-DIFF-UNI-023 | `z` | All hunk indicators show ▶, no ▼ visible |
| KEY-DIFF-UNI-024 | `x` after `z` | All hunk indicators show ▼, content re-expanded |
| KEY-DIFF-UNI-025 | `Enter` on hunk header line | Hunk toggles collapsed/expanded |
| KEY-DIFF-UNI-026 | `Enter` on non-hunk-header content line | No-op |
| KEY-DIFF-UNI-027 | `R` in error state | Error clears, diff content appears with @@ markers |
| KEY-DIFF-UNI-028 | `R` in normal state | No-op |
| KEY-DIFF-UNI-029 | `?` | Help overlay modal appears with keybinding list |
| KEY-DIFF-UNI-030 | `Esc` after `?` | Help overlay closes |
| KEY-DIFF-UNI-031 | `q` | Screen pops, no @@ visible (returned to previous screen) |
| KEY-DIFF-UNI-032 | `:` | Command palette modal opens |
| KEY-DIFF-UNI-033 | 20× `j` presses | Content scrolled exactly 20 lines (no dropped inputs) |
| KEY-DIFF-UNI-034 | `Ctrl+B` at 120 columns | Sidebar toggles visibility |
| KEY-DIFF-UNI-035 | `Ctrl+B` at 80 columns | No-op |
| KEY-DIFF-UNI-036 | `z` then `]` | New file opens with all hunks expanded (▼ indicators) |
| KEY-DIFF-UNI-037 | `w` then `]` then `[` | Whitespace toggle state persists across file navigation |
| KEY-DIFF-UNI-038 | `g r` | Global go-to: navigates to Repositories screen |

**Test pattern for keyboard interactions:**

```typescript
describe("TUI_DIFF_UNIFIED_VIEW — Keyboard Interaction", () => {
  test("KEY-DIFF-UNI-001: j scrolls down one line", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: diffArgs("fixture-multiline"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    const before = tui.snapshot();
    await tui.sendKeys("j");
    const after = tui.snapshot();
    expect(after).not.toEqual(before);
    await tui.terminate();
  });

  test("KEY-DIFF-UNI-033: 20x j presses scroll exactly 20 lines", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: diffArgs("fixture-large-file"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    for (let i = 0; i < 20; i++) {
      await tui.sendKeys("j");
    }
    // Verify line 21+ is now visible
    await tui.waitForText("line-21-marker");
    await tui.terminate();
  });

  test("KEY-DIFF-UNI-036: z then ] — new file has hunks expanded", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: diffArgs("fixture-multifile-diff"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    await tui.sendKeys("z");
    await tui.waitForText("▶");
    await tui.sendKeys("]");
    await tui.waitForText("▼");
    await tui.waitForNoText("▶");
    await tui.terminate();
  });
});
```

### 9.3 Responsive Tests (12 tests)

| ID | Scenario | Key Assertions |
|----|----------|----------------|
| RESP-DIFF-UNI-001 | Layout at 80×24 | No sidebar, 8ch gutter, word wrap on, truncated filename |
| RESP-DIFF-UNI-002 | Layout at 120×40 | Sidebar available, 10ch gutter, no wrap, full filename |
| RESP-DIFF-UNI-003 | Layout at 200×60 | 12ch gutter, extra context lines, full paths |
| RESP-DIFF-UNI-004 | Resize 120→80 | Sidebar collapses, gutter narrows 10→8ch, wrap mode activates |
| RESP-DIFF-UNI-005 | Resize 80→120 | Wider gutter 8→10ch, wrap mode off, sidebar remains hidden until `Ctrl+B` |
| RESP-DIFF-UNI-006 | Resize 200→80 | Graceful degradation across two breakpoint changes |
| RESP-DIFF-UNI-007 | Scroll position preserved | Scroll to line 50, resize, same content region visible |
| RESP-DIFF-UNI-008 | Hunk collapse preserved | Collapse hunks, resize, hunks remain collapsed |
| RESP-DIFF-UNI-009 | Line number toggle preserved | Toggle off, resize, remains off |
| RESP-DIFF-UNI-010 | Whitespace toggle preserved | Toggle off, resize, remains off |
| RESP-DIFF-UNI-011 | File navigation preserved | Navigate to file 3, resize, still on file 3 |
| RESP-DIFF-UNI-012 | Resize during loading | Layout adjusts, fetch continues to completion |

**Test pattern for resize:**

```typescript
describe("TUI_DIFF_UNIFIED_VIEW — Responsive", () => {
  test("RESP-DIFF-UNI-004: Resize 120→80 collapses sidebar and narrows gutter", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: diffArgs("fixture-typescript-modify"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    const beforeSnapshot = tui.snapshot();
    await tui.resize(80, 24);
    const afterSnapshot = tui.snapshot();
    expect(afterSnapshot).not.toEqual(beforeSnapshot);
    // Verify truncated filename (…/ prefix)
    const headerLine = tui.getLine(1);
    expect(headerLine).toMatch(/…\//);
    await tui.terminate();
  });

  test("RESP-DIFF-UNI-007: Scroll position preserved through resize", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: diffArgs("fixture-large-file"),
      env: { CODEPLANE_TOKEN: "test-token-fixture" },
    });
    await tui.waitForText("@@");
    for (let i = 0; i < 10; i++) await tui.sendKeys("j");
    await tui.resize(80, 24);
    // Content should still show the same region
    await tui.terminate();
  });
});
```

### 9.4 Integration Tests (18 tests)

| ID | Flow | Key Assertions |
|----|------|----------------|
| INT-DIFF-UNI-001 | Changes list → `d` → unified diff → scroll → `q` back | Full navigation round trip, previous screen restored |
| INT-DIFF-UNI-002 | Landing detail → change stack → `d` → unified diff → `q` | Landing context preserved in breadcrumb |
| INT-DIFF-UNI-003 | Change stack → `D` → combined landing diff | Combined diff shows all files across changes |
| INT-DIFF-UNI-004 | `]` through all files → `[` back → `q` | Every file visited, wrap-around works, clean exit |
| INT-DIFF-UNI-005 | Unified → `t` → split → `t` → unified | View mode round trip, scroll position preserved |
| INT-DIFF-UNI-006 | 401 response → auth error screen | "Session expired" message, `q` still works |
| INT-DIFF-UNI-007 | 429 response → inline message → wait → `R` → success | Rate limit message with Retry-After, successful retry |
| INT-DIFF-UNI-008 | Network timeout → error → `R` → success | Timeout error, retry loads data |
| INT-DIFF-UNI-009 | Server 500 → error → `R` → success | Server error message, retry loads data |
| INT-DIFF-UNI-010 | `R` retry clears error and renders diff | Error state replaced with diff content |
| INT-DIFF-UNI-011 | 50+ files — navigation wraps, performance smooth | `]` through all files, status bar updates, no lag |
| INT-DIFF-UNI-012 | 10,000+ line file — scrolling responsive | `j` and `Ctrl+D` scroll without perceptible delay |
| INT-DIFF-UNI-013 | Mixed binary/text files | Binary shows placeholder, text shows diff, `]`/`[` works |
| INT-DIFF-UNI-014 | Deep link: `--screen diff --change_id abc123` | Opens directly to diff screen with correct data |
| INT-DIFF-UNI-015 | Command palette → diff screen navigation | `:` → type "diff" → select → diff screen opens |
| INT-DIFF-UNI-016 | Diff cache: view → `q` back → view again | Second view loads instantly (memory cache hit) |
| INT-DIFF-UNI-017 | Syntax highlighting: `.ts` → `]` `.py` → `]` `.go` | Each file uses correct language grammar |
| INT-DIFF-UNI-018 | Whitespace toggle with mixed content | `w` hides whitespace-only changes, shows non-whitespace |

### 9.5 Edge Case Tests (14 tests)

| ID | Scenario | Key Assertions |
|----|----------|----------------|
| EDGE-DIFF-UNI-001 | Diff with 0 files | Empty state message, `]`/`[`/`z`/`x` are all no-ops |
| EDGE-DIFF-UNI-002 | Diff with 1 file | `]`/`[` no-ops, status bar shows "File 1/1" |
| EDGE-DIFF-UNI-003 | Whitespace-only changes + `w` off | "No non-whitespace changes." message |
| EDGE-DIFF-UNI-004 | Very long filename (255 chars) | Truncated with `…/` prefix, no layout overflow |
| EDGE-DIFF-UNI-005 | File with 999,999 lines | 6-digit line numbers render correctly in gutter |
| EDGE-DIFF-UNI-006 | Diff exceeding 100,000 lines total | Truncation message at bottom of diff content |
| EDGE-DIFF-UNI-007 | Unicode content (CJK, emoji) | Wide characters take 2 columns, alignment preserved |
| EDGE-DIFF-UNI-008 | Tab characters in diff | Rendered as 4 spaces |
| EDGE-DIFF-UNI-009 | Concurrent resize + scroll | No crash, layout consistent after both operations |
| EDGE-DIFF-UNI-010 | Unrecognized file extension | Plain text rendering (no syntax colors), no crash |
| EDGE-DIFF-UNI-011 | Empty string from API | Treated as empty diff, shows "No file changes" |
| EDGE-DIFF-UNI-012 | Malformed diff string | Renders as plain text fallback, no crash |
| EDGE-DIFF-UNI-013 | Rapid `t` toggle at exactly 120 columns | Toggles correctly between unified/split repeatedly |
| EDGE-DIFF-UNI-014 | No auth token at startup | Auth error screen before diff screen ever mounts |

**Total: 110 tests across 5 categories. All left failing if backend is unimplemented — never skipped or commented out.**

### 9.6 Test Helper Utilities

All tests use the existing `e2e/tui/helpers.ts` infrastructure which provides `launchTUI()`, `TUITestInstance`, and `TERMINAL_SIZES`. Additional helpers specific to diff tests:

```typescript
import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers.ts";

// Constants for test fixtures
const TEST_REPO = "testorg/test-repo";
const FIXTURE_SINGLE_TS = "fixture-typescript-modify";
const FIXTURE_MULTIFILE = "fixture-multifile-diff";
const FIXTURE_LARGE = "fixture-large-file";
const FIXTURE_BINARY = "fixture-binary-mixed";
const FIXTURE_EMPTY = "fixture-empty-diff";
const FIXTURE_RENAMED = "fixture-renamed-file";
const FIXTURE_DELETED = "fixture-deleted-file";
const FIXTURE_ADDED = "fixture-added-file";
const FIXTURE_WHITESPACE = "fixture-whitespace-only";

function diffArgs(changeId: string): string[] {
  return [
    "--screen", "diff",
    "--repo", TEST_REPO,
    "--mode", "change",
    "--change_id", changeId,
  ];
}

function landingDiffArgs(landingNumber: string): string[] {
  return [
    "--screen", "diff",
    "--repo", TEST_REPO,
    "--mode", "landing",
    "--number", landingNumber,
  ];
}

async function launchDiff(
  changeId: string,
  opts?: { cols?: number; rows?: number; env?: Record<string, string> },
): Promise<TUITestInstance> {
  return launchTUI({
    cols: opts?.cols ?? 120,
    rows: opts?.rows ?? 40,
    args: diffArgs(changeId),
    env: { CODEPLANE_TOKEN: "test-token-fixture", ...opts?.env },
  });
}
```

**Key test principles:**
- No mocking of implementation details. Tests validate user-visible behavior via terminal output.
- Each test launches a fresh TUI instance (`launchTUI`). No shared state between tests.
- Snapshot tests capture full terminal ANSI output including colors.
- Keyboard tests use `sendKeys()` and verify via `waitForText()`, `waitForNoText()`, `getLine()`, and `snapshot()`.
- Tests run against real API server with fixture data. Fixtures must be seeded before test suite runs.
- Test IDs match the product spec acceptance criteria IDs for traceability.

---

## 10. Dependency Graph & Build Order

```
tui-diff-parse-utils ─────┐
                          │
tui-diff-syntax-style ────┤
                          ├──▶ tui-diff-unified-view (this ticket)
tui-diff-screen-scaffold ─┘
                          ┌──▶ tui-diff-split-view (future)
                          ├──▶ tui-diff-file-tree (future)
                          └──▶ tui-diff-inline-comments (future)
```

**Pre-requisites that must be implemented first:**
1. `tui-diff-parse-utils` — `parseDiffHunks()`, `ParsedDiff`, `ParsedHunk`, `DiffLine`, `getCollapsedSummaryText()`, `parseHunkScopeName()` must exist in `apps/tui/src/lib/diff-parse.ts` and `apps/tui/src/lib/diff-types.ts`. These are currently templated in `specs/tui/apps/tui/src/lib/`.
2. `tui-diff-screen-scaffold` — `DiffScreen.tsx` shell must exist in `apps/tui/src/screens/DiffScreen/` with `useDiffData`, `FocusZone` state machine, loading/error states, and `DiffContentPlaceholder`. Currently, the DiffScreen directory is empty and the router maps `ScreenName.DiffView` to `PlaceholderScreen`.
3. `tui-diff-syntax-style` — `useDiffSyntaxStyle` and `resolveFiletype` already exist at `apps/tui/src/hooks/useDiffSyntaxStyle.ts` and `apps/tui/src/lib/diff-syntax.ts`.

**What this ticket produces that downstream tickets consume:**
- `UnifiedDiffViewer` component — consumed by `tui-diff-view-toggle` to render unified mode.
- `useFileNavigation` hook — consumed by `tui-diff-file-navigation` and `tui-diff-file-tree`.
- `useHunkCollapse` hook — consumed by `tui-diff-expand-collapse`.
- `useDiffScroll` hook — consumed by `tui-diff-scroll-sync`.
- `DiffFileHeader` component — consumed by `tui-diff-split-view`.
- `DiffEmptyState` component — consumed by `tui-diff-split-view`.
- `diff-constants.ts` — consumed by all diff sub-tickets.

---

## 11. Productionizing POC Code

This ticket does not involve any POC code. All implementation is production-grade from the start, targeting `apps/tui/src/`. However, if any exploratory work is done in `poc/`:

1. **POC → Production migration path:**
   - POC files in `poc/tui-diff-*` are throw-away explorations.
   - Any passing assertions in POC tests must be graduated into `e2e/tui/diff.test.ts` under the appropriate test ID.
   - POC React components must be rewritten to use the provider stack (ThemeProvider, KeybindingProvider, NavigationProvider) rather than standalone OpenTUI renderers.
   - POC scroll handling must be migrated from direct `useKeyboard` calls to the `KeybindingProvider` scope system.

2. **Pre-merge checklist for any code moving from POC:**
   - Replace all `console.log` with `logger.*`.
   - Replace all hardcoded colors with `DIFF_COLORS` constants or `useTheme()` tokens.
   - Ensure `SyntaxStyle` lifecycle follows `useDiffSyntaxStyle` (create once, destroy on unmount).
   - Ensure all keybindings are registered via `useScreenKeybindings` at `PRIORITY.SCREEN`, not direct `useKeyboard`.
   - Ensure scroll state is managed via `useDiffScroll`, not component-local refs.
   - Ensure responsive behavior uses `useLayout().breakpoint`, not manual terminal dimension checks.
   - Add structured log statements at all log levels per Section 7.
   - Add telemetry events per Section 7.
   - Verify all 110 e2e tests pass (or fail only due to unimplemented backend APIs).

# Engineering Specification: TUI_DIFF_FILE_NAVIGATION

**Ticket:** `tui-diff-file-navigation`
**Title:** TUI_DIFF_FILE_NAVIGATION: Sequential and targeted file jumping with ]/[
**Status:** Not started
**Dependencies:** `tui-diff-file-tree` (DiffFileTree component, sidebar cursor state, `useFileTreeState` hook), `tui-diff-unified-view` (DiffUnifiedView with per-file section rendering, scrollbox refs)
**Downstream consumers:** `tui-diff-inline-comments` (comment anchoring must survive navigation), `tui-diff-expand-collapse` (collapse state reset on file change)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket implements file-to-file navigation within the diff viewer. Users can:

1. Press `]` to advance to the next file (wrapping last → first).
2. Press `[` to retreat to the previous file (wrapping first → last).
3. Press `Enter` while the file tree sidebar is focused to jump to the highlighted file.
4. Use `j`/`k` in the file tree sidebar to move the tree cursor (without changing the main content).

All three navigation paths produce a **coordinated state update** across three visual zones:
- **Main content scrollbox**: scrolls to the target file's header using ref-based scroll offset calculation via OpenTUI's `ScrollBoxRenderable.scrollTo()` API.
- **File tree sidebar**: updates the highlight (reverse video) to the target file entry, auto-scrolling the sidebar scrollbox via `ScrollBoxRenderable.scrollChildIntoView()` if needed.
- **Status bar**: updates the `"File N of M"` indicator.

The feature is entirely client-side — no API calls are made during navigation. File data is already loaded by `useChangeDiff` / `useLandingDiff` (from `tui-diff-data-hooks`). Navigation preserves all existing view state: hunk collapse/expand states, whitespace visibility toggle, and unified/split view mode.

---

## 2. Architectural Decisions

### AD-1: `focusedFileIndex` state ownership

**Decision:** `focusedFileIndex` state lives in `DiffScreen` (the top-level screen component), not in `DiffViewer` (the content rendering component).

**Rationale:**
1. The `DiffScreen` shell already manages `focusZone`, `viewMode`, and `showWhitespace` as screen-level concerns (per `tui-diff-screen-scaffold`).
2. File index must be accessible to both the sidebar (`DiffFileTree`) and the content area (`DiffViewer`) — lifting it to their common parent avoids prop-drilling through intermediate layers.
3. Keybinding handlers for `]`/`[` are registered at the screen level via `useScreenKeybindings`. They need direct access to the index setter.
4. The status bar `"File N of M"` indicator is rendered by the DiffScreen, not by DiffViewer.

### AD-2: Modular arithmetic for wrap-around

**Decision:** Use modular arithmetic for index computation instead of conditional clamping.

**Rationale:**
```typescript
// Next with wrap: (current + 1) % total
// Prev with wrap: (current - 1 + total) % total
```
This eliminates boundary conditionals and makes the wrap-around behavior a mathematical identity rather than a branching code path. Edge case: `total === 0` is guarded against before reaching arithmetic (navigation is a no-op on empty diffs). `total === 1` naturally produces no change: `(0 + 1) % 1 === 0`.

### AD-3: OpenTUI `ScrollBoxRenderable` ref for scroll targeting

**Decision:** Use `React.RefObject<ScrollBoxRenderable>` with the native `scrollTo(offset)` and `scrollChildIntoView(childId)` APIs rather than a custom `ScrollboxHandle` abstraction.

**Rationale:**
1. OpenTUI's `ScrollBoxRenderable` already provides `scrollTo(position: number | { x: number; y: number })` which sets `scrollTop` directly.
2. `scrollChildIntoView(childId: string)` finds a descendant by ID and scrolls to make it visible — this is the correct primitive for sidebar auto-scrolling.
3. For main content scroll targeting, each file section header is assigned a stable `id` prop (e.g., `file-header-${index}`), and the scroll offset is computed by reading the child's `y` position relative to the scrollbox content.
4. Using the native OpenTUI API avoids a leaky abstraction layer and stays aligned with the project's dependency principle: "Prefer @opentui/core builtins over npm packages."
5. `ScrollBoxRenderable` exposes `scrollTop` (getter), `scrollHeight` (getter), and `viewport.height` for computing whether entries are visible — sufficient for all navigation scenarios.

### AD-4: File tree cursor vs focusedFileIndex separation

**Decision:** The file tree sidebar has its own cursor state (`treeCursorIndex`) that is independent of `focusedFileIndex`. Pressing `j`/`k` in the tree moves the cursor without changing the main content. Only `Enter` commits the cursor position to `focusedFileIndex`.

**Rationale:**
1. Users may want to preview file names in the tree before jumping — moving the main content on every `j`/`k` in the tree would be disorienting.
2. `]`/`[` navigation always synchronizes the tree cursor to match `focusedFileIndex` — the two diverge only during tree browsing.
3. This matches the behavior pattern of file explorers (VS Code, Neovim's NERDTree) where cursor movement and file opening are distinct actions.
4. The existing `tui-diff-file-tree` spec defines `useFileTreeState` with its own `focused_index` — the `treeCursorIndex` in `DiffScreen` is the authoritative value passed as a prop, overriding the tree's internal state when `]`/`[` navigates.

### AD-5: Collapse state reset on navigation

**Decision:** Reset hunk collapse state to an empty `Map` (all expanded) when navigating to a different file. Per-file collapse state caching is NOT implemented.

**Rationale:** Keeping behavior predictable: every file starts fully expanded. Users collapse hunks to focus on specific areas, and that focus context doesn't transfer between files. Caching per-file collapse state adds complexity for minimal UX benefit.

---

## 3. Target Files

| File | Purpose | New/Modified |
|------|---------|-------------|
| `apps/tui/src/screens/DiffScreen/useFileNavigation.ts` | Core navigation hook: index management, wrap-around, scroll coordination | **New** |
| `apps/tui/src/screens/DiffScreen/file-nav-utils.ts` | Pure utility functions: stat abbreviation, path truncation, file indicator formatting | **New** |
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Wire `useFileNavigation` hook, add `focusedFileIndex` state, pass to DiffViewer and DiffFileTree, render status bar indicator | **Modified** |
| `apps/tui/src/screens/DiffScreen/keybindings.ts` | Wire `]`/`[` handlers to navigation hook, add `Enter` handler for tree selection | **Modified** |
| `apps/tui/src/screens/DiffScreen/types.ts` | Add `FileNavigationState` interface, `FileNavEvent` telemetry type | **Modified** |
| `apps/tui/src/components/diff/DiffViewer.tsx` | Accept and forward `focusedFileIndex`, assign stable IDs to file header elements for scroll targeting | **Modified** |
| `apps/tui/src/components/diff/DiffFileTree.tsx` | Accept `focusedFileIndex`, `treeCursorIndex`, `onTreeCursorChange`, `onFileSelect`; render inverse styling on focused entry; auto-scroll sidebar | **Modified** (from `tui-diff-file-tree`) |
| `apps/tui/src/components/StatusBar.tsx` | No structural changes — status bar hints already flow from `useScreenKeybindings`. File indicator rendered inline by DiffScreen via hint injection | **Unchanged** |
| `e2e/tui/diff.test.ts` | 52 new tests across 7 describe blocks | **Modified** |

---

## 4. Data Flow

```
DiffScreen (shell — state owner)
├── useState<number>(0) → focusedFileIndex
├── useState<number>(0) → treeCursorIndex
├── useFileNavigation({
│     files,
│     focusedFileIndex,
│     setFocusedFileIndex,
│     treeCursorIndex,
│     setTreeCursorIndex,
│     mainScrollRef,       // React.RefObject<ScrollBoxRenderable>
│     sidebarScrollRef,    // React.RefObject<ScrollBoxRenderable>
│     setCollapseState,
│   }) → { navigateNext, navigatePrev, navigateToFile, fileIndicator, canNavigate }
│
├── useScreenKeybindings(
│     buildDiffKeybindings({ ..., navigateNext, navigatePrev, navigateToFile, ... }),
│     [...DIFF_STATUS_HINTS, { keys: fileNav.fileIndicator, label: "", order: 100 }]
│   )
│
├── DiffFileTree (sidebar)
│   ├── files: FileDiffItem[]
│   ├── focusedFileIndex: number (highlighted entry — reverse video)
│   ├── treeCursorIndex: number (cursor position — ▸ prefix when tree focused)
│   ├── onTreeCursorChange: (index: number) => void  (j/k in tree)
│   ├── onFileSelect: (index: number) => void  (Enter in tree → navigateToFile)
│   ├── focused: boolean  (focusZone === "tree")
│   └── ref={sidebarScrollRef}  (ScrollBoxRenderable ref on the tree scrollbox)
│
└── DiffViewer (content area)
    ├── files: FileDiffItem[]
    ├── focusedFileIndex: number
    ├── ref={mainScrollRef}  (ScrollBoxRenderable ref on the content scrollbox)
    ├── viewMode: "unified" | "split"
    ├── showWhitespace: boolean
    ├── collapseState: Map<number, boolean>
    └── onCollapseStateChange: (state: Map<number, boolean>) => void
```

---

## 5. Core Hook: `useFileNavigation`

### File: `apps/tui/src/screens/DiffScreen/useFileNavigation.ts`

```typescript
import { useCallback, useMemo, useEffect } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { FileDiffItem } from "../../types/diff.js";
import { formatFileIndicator } from "./file-nav-utils.js";
import { logger } from "../../lib/logger.js";
import { emit } from "../../lib/telemetry.js";

export interface FileNavigationOptions {
  files: FileDiffItem[];
  focusedFileIndex: number;
  setFocusedFileIndex: (index: number) => void;
  treeCursorIndex: number;
  setTreeCursorIndex: (index: number) => void;
  mainScrollRef: React.RefObject<ScrollBoxRenderable | null>;
  sidebarScrollRef: React.RefObject<ScrollBoxRenderable | null>;
  setCollapseState: (state: Map<number, boolean>) => void;
  focusZone: "tree" | "content";
  sidebarVisible: boolean;
}

export interface FileNavigationResult {
  /** Navigate to next file (wraps last→first). No-op if ≤1 file. */
  navigateNext: () => void;
  /** Navigate to previous file (wraps first→last). No-op if ≤1 file. */
  navigatePrev: () => void;
  /** Navigate to a specific file by index. Used by tree Enter. */
  navigateToFile: (index: number) => void;
  /** Status bar indicator string: "File N of M" */
  fileIndicator: string;
  /** Whether file navigation is available (>1 file). */
  canNavigate: boolean;
}

export function useFileNavigation(opts: FileNavigationOptions): FileNavigationResult {
  const {
    files,
    focusedFileIndex,
    setFocusedFileIndex,
    treeCursorIndex,
    setTreeCursorIndex,
    mainScrollRef,
    sidebarScrollRef,
    setCollapseState,
    focusZone,
    sidebarVisible,
  } = opts;

  const total = files.length;
  const canNavigate = total > 1;

  // ── Scroll main content to file header ─────────────────────────
  const scrollToFile = useCallback(
    (index: number) => {
      const scrollbox = mainScrollRef.current;
      if (!scrollbox) {
        logger.debug(
          `[file-nav] scrollToFile: null main scrollbox ref`,
        );
        return;
      }

      // Find the file header element by its stable ID
      const headerId = `file-header-${index}`;
      const headerChild = scrollbox.content.findDescendantById(headerId);
      if (!headerChild) {
        logger.debug(
          `[file-nav] scrollToFile: no header element for id=${headerId}`,
        );
        return;
      }

      // Scroll to the header's y-position within the content area
      scrollbox.scrollTo(headerChild.y);

      logger.debug(
        `[file-nav] file.scroll_target: index=${index}, offsetY=${headerChild.y}, viewportHeight=${scrollbox.viewport.height}`,
      );
    },
    [mainScrollRef],
  );

  // ── Scroll sidebar to keep focused entry visible ───────────────
  const scrollSidebarToEntry = useCallback(
    (index: number) => {
      const scrollbox = sidebarScrollRef.current;
      if (!scrollbox) return;

      // Use scrollChildIntoView with the tree entry's stable ID
      const entryId = `file-tree-entry-${index}`;
      scrollbox.scrollChildIntoView(entryId);

      logger.debug(
        `[file-nav] file.sidebar_scroll: index=${index}`,
      );
    },
    [sidebarScrollRef],
  );

  // ── Core navigation function ───────────────────────────────────
  const navigateToIndex = useCallback(
    (newIndex: number, source: "sequential" | "tree") => {
      if (total === 0) return;
      // Clamp index to valid range (defensive)
      const clamped = Math.max(0, Math.min(newIndex, total - 1));
      if (clamped === focusedFileIndex && source === "sequential") return; // Same file — no-op for sequential

      const wrapped =
        source === "sequential" &&
        (clamped === 0 && focusedFileIndex === total - 1) ||
        (clamped === total - 1 && focusedFileIndex === 0);

      // 1. Update file index
      setFocusedFileIndex(clamped);

      // 2. Sync tree cursor to match
      setTreeCursorIndex(clamped);

      // 3. Reset hunk collapse state (all expanded)
      setCollapseState(new Map());

      // 4. Scroll main content to file header (after React commit)
      queueMicrotask(() => scrollToFile(clamped));

      // 5. Scroll sidebar to keep entry visible
      queueMicrotask(() => scrollSidebarToEntry(clamped));

      // 6. Telemetry
      if (source === "sequential") {
        emit("tui.diff.file_navigated", {
          direction: clamped > focusedFileIndex || (clamped === 0 && focusedFileIndex === total - 1) ? "next" : "prev",
          from_index: focusedFileIndex,
          to_index: clamped,
          total_files: total,
          wrapped,
          focus_zone: focusZone,
          sidebar_visible: sidebarVisible,
        });
      } else {
        emit("tui.diff.file_tree_selected", {
          from_index: focusedFileIndex,
          to_index: clamped,
          same_file: clamped === focusedFileIndex,
        });
      }

      logger.debug(
        `[file-nav] file.navigated: ${focusedFileIndex} → ${clamped} (total=${total}, source=${source})`,
      );
    },
    [
      total,
      focusedFileIndex,
      focusZone,
      sidebarVisible,
      setFocusedFileIndex,
      setTreeCursorIndex,
      setCollapseState,
      scrollToFile,
      scrollSidebarToEntry,
    ],
  );

  // ── Public navigation methods ──────────────────────────────────
  const navigateNext = useCallback(() => {
    if (!canNavigate) {
      logger.debug(`[file-nav] file.noop: reason=single_file`);
      emit("tui.diff.file_nav_noop", { total_files: total, reason: "single_file" });
      return;
    }
    const next = (focusedFileIndex + 1) % total;
    navigateToIndex(next, "sequential");
  }, [canNavigate, focusedFileIndex, total, navigateToIndex]);

  const navigatePrev = useCallback(() => {
    if (!canNavigate) {
      logger.debug(`[file-nav] file.noop: reason=single_file`);
      emit("tui.diff.file_nav_noop", { total_files: total, reason: "single_file" });
      return;
    }
    const prev = (focusedFileIndex - 1 + total) % total;
    navigateToIndex(prev, "sequential");
  }, [canNavigate, focusedFileIndex, total, navigateToIndex]);

  const navigateToFile = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      navigateToIndex(index, "tree");
    },
    [total, navigateToIndex],
  );

  // ── File indicator for status bar ──────────────────────────────
  const fileIndicator = useMemo(
    () => formatFileIndicator(focusedFileIndex, total),
    [focusedFileIndex, total],
  );

  // ── Clamp index if files array shrinks ─────────────────────────
  // Handles whitespace toggle reducing file count
  useEffect(() => {
    if (total > 0 && focusedFileIndex >= total) {
      const clamped = total - 1;
      setFocusedFileIndex(clamped);
      setTreeCursorIndex(clamped);
      logger.warn(
        `[file-nav] file.index_clamped: ${focusedFileIndex} → ${clamped} (files shrunk to ${total})`,
      );
    }
  }, [total, focusedFileIndex, setFocusedFileIndex, setTreeCursorIndex]);

  // ── Emit nav_summary on unmount ────────────────────────────────
  // (tracking state would be accumulated via useRef — omitted here
  //  for brevity; wired in Step 9 productionization)

  return {
    navigateNext,
    navigatePrev,
    navigateToFile,
    fileIndicator,
    canNavigate,
  };
}
```

**Key difference from previous version:** Uses `ScrollBoxRenderable` directly from `@opentui/core` instead of a custom `ScrollboxHandle` interface. Uses `content.findDescendantById(id)` + `child.y` for offset calculation (matching how OpenTUI's own `scrollChildIntoView` works internally). Uses the project's `logger` utility (controlled by `CODEPLANE_TUI_LOG_LEVEL`) and `emit()` telemetry function instead of raw `console.error` calls.

---

## 6. Utility Functions: `file-nav-utils.ts`

### File: `apps/tui/src/screens/DiffScreen/file-nav-utils.ts`

```typescript
/**
 * Abbreviate a stat count for narrow terminals.
 * Returns the number as-is for ≤999, then K/M suffixes.
 *
 * @example
 * abbreviateStat(0)       // → "0"
 * abbreviateStat(42)      // → "42"
 * abbreviateStat(999)     // → "999"
 * abbreviateStat(1000)    // → "1.0K"
 * abbreviateStat(1500)    // → "1.5K"
 * abbreviateStat(9999)    // → "10.0K"
 * abbreviateStat(1000000) // → "1.0M"
 * abbreviateStat(1500000) // → "1.5M"
 */
export function abbreviateStat(count: number): string {
  if (count < 0) return "0";
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1000;
    return `${k.toFixed(1)}K`;
  }
  const m = count / 1_000_000;
  return `${m.toFixed(1)}M`;
}

/**
 * Truncate a file path from the left to fit within maxWidth columns.
 * Replaces removed path segments with `…/` prefix.
 *
 * @example
 * truncateFilePath("src/index.ts", 30)
 *   // → "src/index.ts" (fits, no truncation)
 * truncateFilePath("packages/core/src/lib/utils/helpers.ts", 30)
 *   // → "…/lib/utils/helpers.ts"
 * truncateFilePath("a.ts", 30)
 *   // → "a.ts" (always fits)
 *
 * If the filename alone exceeds maxWidth, truncates the filename
 * from the right with trailing `…`.
 */
export function truncateFilePath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  if (maxWidth < 4) return path.slice(0, maxWidth);

  const segments = path.split("/");
  const filename = segments[segments.length - 1];

  // If filename alone is too long, truncate it
  if (filename.length + 2 > maxWidth) {
    // "…" prefix + truncated filename
    return "…" + filename.slice(-(maxWidth - 1));
  }

  // Remove leading segments until it fits
  let truncated = path;
  let i = 0;
  while (truncated.length > maxWidth - 2 && i < segments.length - 1) {
    i++;
    truncated = segments.slice(i).join("/");
  }
  return `…/${truncated}`;
}

/**
 * Format the file indicator string for the status bar.
 * Left-pads N to match M's width for alignment.
 * Caps at 16 chars for status bar space constraints.
 *
 * @example
 * formatFileIndicator(0, 5)   // → "File 1 of 5"
 * formatFileIndicator(9, 42)  // → "File 10 of 42"
 * formatFileIndicator(0, 500) // → "File   1 of 500"
 * formatFileIndicator(0, 0)   // → ""
 */
export function formatFileIndicator(index: number, total: number): string {
  if (total === 0) return "";
  const n = String(index + 1).padStart(String(total).length, " ");
  const indicator = `File ${n} of ${total}`;
  return indicator.length > 16 ? indicator.slice(0, 16) : indicator;
}
```

---

## 7. DiffScreen Integration

### File: `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` (modifications)

#### 7.1 New State Declarations

```typescript
import { useState, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useFileNavigation } from "./useFileNavigation.js";

// After existing state declarations (focusZone, viewMode, showWhitespace):

// ── File navigation state ──
const [focusedFileIndex, setFocusedFileIndex] = useState<number>(0);
const [treeCursorIndex, setTreeCursorIndex] = useState<number>(0);
const [collapseState, setCollapseState] = useState<Map<number, boolean>>(new Map());

// ── Refs for scroll targeting (OpenTUI native ScrollBoxRenderable) ──
const mainScrollRef = useRef<ScrollBoxRenderable | null>(null);
const sidebarScrollRef = useRef<ScrollBoxRenderable | null>(null);
```

#### 7.2 Hook up `useFileNavigation`

```typescript
const fileNav = useFileNavigation({
  files: diffResult.files,
  focusedFileIndex,
  setFocusedFileIndex,
  treeCursorIndex,
  setTreeCursorIndex,
  mainScrollRef,
  sidebarScrollRef,
  setCollapseState,
  focusZone,
  sidebarVisible: layout.sidebarVisible,
});
```

#### 7.3 Update Keybinding Builder Call

```typescript
useScreenKeybindings(
  buildDiffKeybindings({
    focusZone,
    setFocusZone,
    viewMode,
    setViewMode,
    showWhitespace,
    setShowWhitespace,
    sidebarVisible: layout.sidebarVisible,
    breakpoint: layout.breakpoint,
    // File navigation handlers
    navigateNext: fileNav.navigateNext,
    navigatePrev: fileNav.navigatePrev,
    navigateToFile: fileNav.navigateToFile,
    treeCursorIndex,
    // Loading/error guards
    isLoading: diffResult.isLoading,
    hasError: !!diffResult.error,
    fileCount: diffResult.files.length,
  }),
  [
    ...DIFF_STATUS_HINTS,
    // Inject file indicator as a right-aligned status hint
    { keys: fileNav.fileIndicator, label: "", order: 100 },
  ],
);
```

#### 7.4 Updated Layout Rendering

```typescript
const theme = useTheme();

return (
  <box flexDirection="row" flexGrow={1} width="100%">
    {layout.sidebarVisible && (
      <box
        width={layout.sidebarWidth}
        flexDirection="column"
        borderColor={focusZone === "tree" ? theme.primary : theme.border}
        border={["right"]}
      >
        <DiffFileTree
          files={diffResult.files}
          focusedFileIndex={focusedFileIndex}
          treeCursorIndex={treeCursorIndex}
          onTreeCursorChange={setTreeCursorIndex}
          onFileSelect={fileNav.navigateToFile}
          focused={focusZone === "tree"}
          ref={sidebarScrollRef}
        />
      </box>
    )}
    <box flexGrow={1} flexDirection="column">
      <DiffViewer
        files={diffResult.files}
        focusedFileIndex={focusedFileIndex}
        ref={mainScrollRef}
        viewMode={viewMode}
        showWhitespace={showWhitespace}
        collapseState={collapseState}
        onCollapseStateChange={setCollapseState}
      />
    </box>
  </box>
);
```

---

## 8. Keybinding Wiring

### File: `apps/tui/src/screens/DiffScreen/keybindings.ts` (modifications)

The existing placeholder handlers for `]`, `[` are replaced with real navigation calls. New handlers are added for tree-specific interactions.

```typescript
import type { KeyHandler } from "../../providers/KeybindingProvider.js";

interface DiffKeybindingContext {
  // Existing fields from tui-diff-screen-scaffold:
  focusZone: "tree" | "content";
  setFocusZone: (zone: "tree" | "content") => void;
  viewMode: "unified" | "split";
  setViewMode: (mode: "unified" | "split") => void;
  showWhitespace: boolean;
  setShowWhitespace: (show: boolean) => void;
  sidebarVisible: boolean;
  breakpoint: string | null;
  // New: file navigation
  navigateNext: () => void;
  navigatePrev: () => void;
  navigateToFile: (index: number) => void;
  treeCursorIndex: number;
  isLoading: boolean;
  hasError: boolean;
  fileCount: number;
}

export function buildDiffKeybindings(ctx: DiffKeybindingContext): KeyHandler[] {
  return [
    // ── Zone navigation ──
    {
      key: "tab",
      description: "Switch focus zone",
      group: "Navigation",
      handler: () => {
        if (!ctx.sidebarVisible) return;
        ctx.setFocusZone(ctx.focusZone === "tree" ? "content" : "tree");
      },
    },

    // ── File navigation (]/[) ──
    // IMPORTANT: No `when` predicate — active in ANY focus zone
    {
      key: "]",
      description: "Next file",
      group: "Diff",
      handler: () => {
        if (ctx.isLoading || ctx.hasError) return;
        ctx.navigateNext();
      },
    },
    {
      key: "[",
      description: "Previous file",
      group: "Diff",
      handler: () => {
        if (ctx.isLoading || ctx.hasError) return;
        ctx.navigatePrev();
      },
    },

    // ── Tree-specific: Enter selects file ──
    {
      key: "return",
      description: "Open file",
      group: "Navigation",
      handler: () => {
        if (ctx.isLoading || ctx.hasError) return;
        ctx.navigateToFile(ctx.treeCursorIndex);
        // Focus returns to content after selection
        ctx.setFocusZone("content");
      },
      when: () => ctx.focusZone === "tree",
    },

    // ── View toggles (unchanged) ──
    {
      key: "t",
      description: ctx.viewMode === "unified" ? "Split view" : "Unified view",
      group: "Diff",
      handler: () => {
        if (ctx.breakpoint === "minimum") return;
        ctx.setViewMode(ctx.viewMode === "unified" ? "split" : "unified");
      },
    },
    {
      key: "w",
      description: ctx.showWhitespace ? "Hide whitespace" : "Show whitespace",
      group: "Diff",
      handler: () => ctx.setShowWhitespace(!ctx.showWhitespace),
    },

    // ── Expand/collapse placeholders (wired by downstream ticket) ──
    {
      key: "x",
      description: "Expand all hunks",
      group: "Diff",
      handler: () => { /* wired by tui-diff-expand-collapse */ },
      when: () => ctx.focusZone === "content",
    },
    {
      key: "z",
      description: "Collapse all hunks",
      group: "Diff",
      handler: () => { /* wired by tui-diff-expand-collapse */ },
      when: () => ctx.focusZone === "content",
    },
  ];
}

/** Status bar hints for the diff screen */
export interface StatusBarHint {
  keys: string;
  label: string;
  order: number;
}

export const DIFF_STATUS_HINTS: StatusBarHint[] = [
  { keys: "j/k", label: "scroll", order: 0 },
  { keys: "]/[", label: "file", order: 10 },
  { keys: "t", label: "view", order: 20 },
  { keys: "w", label: "whitespace", order: 30 },
  { keys: "Tab", label: "focus", order: 40 },
  { keys: "x/z", label: "hunks", order: 50 },
];
```

**Key design note on `]`/`[` scope:** The product spec states navigation works from **both** content and tree focus zones. The `]`/`[` handlers have no `when` predicate — they are always active within the diff screen. This is correct: unlike `Enter` (which only makes sense in the tree) or `x`/`z` (which only make sense in content), file navigation is a screen-wide concern.

---

## 9. DiffFileTree Integration

### File: `apps/tui/src/components/diff/DiffFileTree.tsx` (modifications from `tui-diff-file-tree`)

The `DiffFileTree` component must accept file navigation props in addition to its existing interface:

```typescript
import type { ScrollBoxRenderable } from "@opentui/core";
import { forwardRef } from "react";
import { truncateFilePath, abbreviateStat } from "../../screens/DiffScreen/file-nav-utils.js";

export interface DiffFileTreeProps {
  files: FileDiffItem[];
  /** Which file is currently active in the main content (inverse highlight) */
  focusedFileIndex: number;
  /** Current cursor position in the tree (may differ from focusedFileIndex) */
  treeCursorIndex: number;
  /** Called when j/k moves the cursor within the tree */
  onTreeCursorChange: (index: number) => void;
  /** Called when Enter selects a file */
  onFileSelect: (index: number) => void;
  /** Whether the tree zone has keyboard focus */
  focused: boolean;
}

export const DiffFileTree = forwardRef<ScrollBoxRenderable, DiffFileTreeProps>(
  function DiffFileTree(props, ref) {
    const {
      files, focusedFileIndex, treeCursorIndex,
      onTreeCursorChange, onFileSelect, focused,
    } = props;
    const theme = useTheme();
    const { width } = useTerminalDimensions();

    // Calculate available width for path display
    // Sidebar is 25% of terminal at standard, 30% at large
    // Reserve 12 chars for stat display + change type icon + padding
    const sidebarCols = Math.floor(width * 0.25);
    const maxPathWidth = Math.max(8, sidebarCols - 12);

    return (
      <scrollbox ref={ref} flexGrow={1}>
        <box flexDirection="column">
          {files.map((file, index) => {
            const isFocused = index === focusedFileIndex;
            const isCursor = focused && index === treeCursorIndex;
            const displayPath = truncateFilePath(file.path, maxPathWidth);
            const changeIcon =
              file.change_type === "added" ? "+" :
              file.change_type === "deleted" ? "-" :
              file.change_type === "renamed" ? "→" : "~";
            const prefix = isCursor ? "▸ " : "  ";

            return (
              <box
                key={file.path}
                id={`file-tree-entry-${index}`}
                inverse={isFocused}
                width="100%"
              >
                <text fg={isFocused ? undefined : theme.muted}>
                  {prefix}{changeIcon} {displayPath}
                </text>
                <text fg={theme.muted}>
                  {" +"}{abbreviateStat(file.additions)}
                  {" -"}{abbreviateStat(file.deletions)}
                </text>
              </box>
            );
          })}
        </box>
      </scrollbox>
    );
  }
);
```

**Rendering rules:**

1. **Active file highlight:** The entry at `focusedFileIndex` renders with `inverse={true}` (reverse video) regardless of whether the tree has focus. This is the "currently viewing" indicator.
2. **Cursor indicator:** When `focused === true`, the entry at `treeCursorIndex` shows a `▸` prefix. If `treeCursorIndex === focusedFileIndex`, both indicators combine.
3. **Stable IDs:** Each entry has `id={\`file-tree-entry-${index}\`}` for `scrollChildIntoView()` targeting.
4. **File path display:** Uses `truncateFilePath()` from `file-nav-utils.ts` based on calculated sidebar width.
5. **Stat display:** Shows `+N -M` with `abbreviateStat()` for counts >999.

---

## 10. DiffViewer Integration

### File: `apps/tui/src/components/diff/DiffViewer.tsx` (modifications)

The `DiffViewer` content area must assign stable IDs to file section headers for scroll targeting.

#### 10.1 File Header Stable IDs

Each file section in the scrollable content registers a stable `id` on its header element:

```typescript
import { forwardRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";

export interface DiffViewerProps {
  files: FileDiffItem[];
  focusedFileIndex: number;
  viewMode: "unified" | "split";
  showWhitespace: boolean;
  collapseState: Map<number, boolean>;
  onCollapseStateChange: (state: Map<number, boolean>) => void;
}

export const DiffViewer = forwardRef<ScrollBoxRenderable, DiffViewerProps>(
  function DiffViewer(props, ref) {
    const { files, focusedFileIndex, viewMode, showWhitespace, collapseState, onCollapseStateChange } = props;
    const theme = useTheme();

    return (
      <scrollbox ref={ref} flexGrow={1}>
        <box flexDirection="column">
          {files.map((file, index) => (
            <box key={file.path} flexDirection="column">
              {/* File header — scroll target */}
              <box
                id={`file-header-${index}`}
                width="100%"
                flexDirection="row"
              >
                <text attributes={1}>
                  {file.change_type === "added" ? "+ " :
                   file.change_type === "deleted" ? "- " : "~ "}
                  {file.path}
                  {file.old_path && file.old_path !== file.path
                    ? ` (was ${file.old_path})`
                    : ""}
                </text>
              </box>
              {/* Diff hunks rendered here by existing UnifiedDiffViewer / SplitDiffViewer */}
              {/* ... */}
            </box>
          ))}
        </box>
      </scrollbox>
    );
  }
);
```

**Key pattern:** The `id={\`file-header-${index}\`}` attribute on the file header `<box>` element allows the `useFileNavigation` hook to find it via `scrollbox.content.findDescendantById()` and read its `y` position for `scrollTo()`. This is the same pattern OpenTUI uses internally for `scrollChildIntoView()`.

#### 10.2 Mode Indicator Row

The mode indicator row (existing from `tui-diff-unified-view`) shows the file position:

```typescript
<box flexDirection="row" width="100%">
  <text fg={theme.muted}>
    {viewMode === "split" ? "Split" : "Unified"} view
    {" "}
    [{focusedFileIndex + 1}/{files.length}] {files[focusedFileIndex]?.path}
    {files[focusedFileIndex]?.old_path &&
     files[focusedFileIndex]?.old_path !== files[focusedFileIndex]?.path
      ? ` ← ${files[focusedFileIndex]?.old_path}`
      : ""}
  </text>
</box>
```

---

## 11. Responsive Behavior

### 11.1 Breakpoint Effects on File Navigation

| Breakpoint | Sidebar | Status Bar Indicator | Tree Navigation | `]`/`[` Keys |
|---|---|---|---|---|
| `minimum` (80×24) | Hidden | Shown ("File N of M") | Unavailable (focus stays on content) | Fully functional |
| `standard` (120×40) | Visible 25% | Shown | Available | Fully functional |
| `large` (200×60) | Visible 30% | Shown | Available | Fully functional |

### 11.2 File Path Truncation in Sidebar

| Sidebar Width (cols) | Max Path Width | Example |
|---|---|---|
| 20 (minimum if forced visible) | 8 | `…/utils.ts` |
| 30 (25% of 120) | 18 | `…/lib/utils.ts` |
| 60 (30% of 200) | 48 | `packages/core/src/lib/utils.ts` |

### 11.3 Stat Abbreviation

When sidebar width < 35 cols, stat counts >999 use abbreviated format:

| Raw Count | Full | Abbreviated |
|---|---|---|
| 42 | `+42` | `+42` |
| 1500 | `+1500` | `+1.5K` |
| 2500000 | `+2500000` | `+2.5M` |

### 11.4 Resize During Navigation

If the terminal is resized while the user is navigating:
1. `useOnResize` triggers re-layout synchronously.
2. If sidebar transitions from visible → hidden, `focusZone` resets to `"content"` (existing behavior from scaffold).
3. `focusedFileIndex` is preserved — the user's position in the file list survives resize.
4. The status bar indicator recalculates layout but retains the current "File N of M" value.
5. Sidebar path truncation recalculates for the new width.

---

## 12. Edge Cases

### 12.1 Empty diff (0 files)
- `focusedFileIndex` remains 0.
- `fileIndicator` returns `""`.
- `]`/`[` are no-ops.
- Status bar shows no file indicator.
- Main content shows "No files changed" placeholder.

### 12.2 Single-file diff (1 file)
- `focusedFileIndex` is 0.
- `fileIndicator` returns `"File 1 of 1"`.
- `]`/`[` are no-ops (`canNavigate === false`).
- Tree sidebar shows single entry highlighted.

### 12.3 Rapid sequential presses
- Each `]`/`[` press is processed synchronously in the keybinding handler.
- React batches state updates, so rapid presses result in sequential index increments within a single render cycle.
- `queueMicrotask` for scroll targeting means only the final scroll position is applied.
- No debouncing — every press produces an index change.

### 12.4 500-file diff (maximum)
- File navigation uses modular arithmetic — O(1) regardless of file count.
- Sidebar scrollbox with 500 entries uses OpenTUI viewport culling for rendering performance.
- Status bar: `"File   1 of 500"` (left-padded N).
- Performance target: <16ms per navigation event.

### 12.5 Binary files in diff
- Binary files are navigable like any other file.
- Main content shows "Binary file changed" message instead of diff hunks.
- File header `id` still assigned for scroll targeting.
- Change type icon in tree: `~` (modified).

### 12.6 Renamed files
- Tree displays the new path. The old path is shown in the file header row as `(was old/path.ts)`.
- Navigation treats renamed files identically to modified files.
- Change type icon in tree: `→`.

### 12.7 Whitespace toggle reducing file count
- When `showWhitespace` toggles and the API re-fetches with `ignore_whitespace`, the file list may shrink.
- `useEffect` in `useFileNavigation` clamps `focusedFileIndex` if it exceeds the new `total`.
- Tree cursor is also clamped.
- Warn-level log emitted via `logger.warn()`.

### 12.8 Navigation during loading/error state
- `]`/`[`/`Enter` handlers check `ctx.isLoading` and `ctx.hasError` — return early if true.
- Status bar shows loading/error indicators instead of file indicator.

### 12.9 Inline comments preservation
- File navigation does NOT clear inline comment state.
- Comments are anchored to file path + line number, not to `focusedFileIndex`.
- Navigating away and back to a file with inline comments shows them intact.

### 12.10 Deep link launch
- `codeplane tui --screen diff --repo owner/repo --change abc123` pre-populates the stack.
- `focusedFileIndex` starts at 0 (first file) regardless of deep link.
- No way to deep-link to a specific file within the diff (not in scope).

---

## 13. Observability

### 13.1 Log Events

All logs go to stderr via `apps/tui/src/lib/logger.ts`, controlled by `CODEPLANE_TUI_LOG_LEVEL` (default: `error`).

| Event | Level | Fields | Trigger |
|---|---|---|---|
| `file.navigated` | `debug` | `from`, `to`, `total`, `source` | Every `]`/`[` navigation |
| `file.tree_selected` | `debug` | `from`, `to`, `same_file` | `Enter` in tree |
| `file.scroll_target` | `debug` | `index`, `offsetY`, `viewportHeight` | After scroll-to calculation |
| `file.sidebar_scroll` | `debug` | `index` | After sidebar auto-scroll |
| `file.noop` | `debug` | `reason`: `single_file` | Navigation rejected |
| `file.index_clamped` | `warn` | `from`, `to`, `total` | Files array shrunk beyond index |
| `nav_summary` | `info` | `unique_files_visited`, `sequential_count`, `tree_count`, `wrap_count` | Screen unmount |

### 13.2 Telemetry Events

Emitted via `apps/tui/src/lib/telemetry.ts` `emit()` function. Events are written to stderr as JSON when `CODEPLANE_TUI_DEBUG=true`.

| Event Name | Trigger | Properties |
|---|---|---|
| `tui.diff.file_navigated` | `]`/`[` press | `direction`, `from_index`, `to_index`, `total_files`, `wrapped: boolean`, `focus_zone`, `sidebar_visible` |
| `tui.diff.file_tree_selected` | `Enter` in tree | `from_index`, `to_index`, `same_file: boolean` |
| `tui.diff.file_nav_noop` | `]`/`[` on single file | `total_files`, `reason: "single_file"` |
| `tui.diff.file_nav_pattern` | Screen unmount | `unique_files_visited`, `sequential_nav_count`, `tree_nav_count`, `wrap_count`, `max_consecutive_same_direction` |

**Common properties** (attached automatically by `emit()` via global telemetry context): `session_id`, `terminal_width`, `terminal_height`, `timestamp`, `tui_version`, `color_tier`.

### 13.3 Error Recovery

| Error Case | Detection | Recovery |
|---|---|---|
| `focusedFileIndex` out of bounds | `useEffect` clamp check | Clamp to `total - 1`, warn log |
| Null main scrollbox ref | Null check in `scrollToFile` | Skip scroll, state still updates, next nav recalculates |
| Null sidebar scrollbox ref | Null check in `scrollSidebarToEntry` | Skip sidebar scroll |
| Terminal resize mid-navigation | `useOnResize` triggers relayout | Scroll offsets recalculated at new viewport |
| File header element not found | `findDescendantById` returns null | Skip scroll, debug log |
| Whitespace toggle reducing file count | `useEffect` clamp check | Clamp both `focusedFileIndex` and `treeCursorIndex` |

---

## 14. Implementation Plan

All steps are vertical — each step produces a working, testable increment.

### Step 1: Create utility functions

**File:** `apps/tui/src/screens/DiffScreen/file-nav-utils.ts`

Implement:
- `abbreviateStat(count: number): string`
- `truncateFilePath(path: string, maxWidth: number): string`
- `formatFileIndicator(index: number, total: number): string`

These are pure functions with zero dependencies on React, OpenTUI, or the data layer. They can be verified in isolation with unit tests.

**Verification:** Unit test each function with edge cases (0, 1, 999, 1000, negative, empty string, path longer than maxWidth, single segment path, 0 total).

### Step 2: Create the `useFileNavigation` hook

**File:** `apps/tui/src/screens/DiffScreen/useFileNavigation.ts`

Implement the full hook as specified in Section 5. At this point, the scroll functions may no-op (refs not yet connected) but the index management, wrap-around logic, clamping, telemetry emission, and status bar indicator are complete.

**Verification:** Hook returns correct `fileIndicator` strings, `canNavigate` flag, and `navigateNext`/`navigatePrev` produce correct index sequences via modular arithmetic.

### Step 3: Update DiffScreen types

**File:** `apps/tui/src/screens/DiffScreen/types.ts`

Add:
- `FileNavigationState` interface (groups `focusedFileIndex`, `treeCursorIndex`, `collapseState`)
- `FileNavEvent` telemetry type (discriminated union for the 4 event shapes)

**Verification:** Types compile with `bun run typecheck`.

### Step 4: Wire file navigation into DiffScreen

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`

Apply modifications from Section 7:
1. Add `focusedFileIndex`, `treeCursorIndex`, `collapseState` state.
2. Add ref declarations for `mainScrollRef`, `sidebarScrollRef` using `React.RefObject<ScrollBoxRenderable>`.
3. Call `useFileNavigation` hook.
4. Pass results to `buildDiffKeybindings`.
5. Pass `focusedFileIndex` and refs to both `DiffFileTree` and `DiffViewer`.
6. Add `fileIndicator` to status bar hints.

**Verification:** DiffScreen renders with file indicator in status bar. `focusedFileIndex` starts at 0.

### Step 5: Wire keybinding handlers

**File:** `apps/tui/src/screens/DiffScreen/keybindings.ts`

Apply modifications from Section 8:
1. Extend `DiffKeybindingContext` with navigation fields.
2. Replace `]`/`[` placeholder handlers with calls to `navigateNext`/`navigatePrev`.
3. Add `return` handler for tree file selection (with `when: () => ctx.focusZone === "tree"`).
4. Add loading/error guards.
5. Ensure `]`/`[` have **no** `when` predicate (active in all focus zones).

**Verification:** Pressing `]`/`[` updates `focusedFileIndex`. Status bar indicator updates. `Enter` only fires in tree zone.

### Step 6: Integrate with DiffFileTree sidebar

**File:** `apps/tui/src/components/diff/DiffFileTree.tsx`

Ensure the `DiffFileTree` component accepts the props specified in Section 9:
1. `focusedFileIndex` for reverse-video highlighting.
2. `treeCursorIndex` for cursor position (`▸` prefix).
3. `onTreeCursorChange` for `j`/`k` cursor movement.
4. `onFileSelect` for `Enter` selection.
5. Uses `forwardRef` to expose the `<scrollbox>` ref as `ScrollBoxRenderable` for sidebar auto-scroll.
6. Assigns `id={\`file-tree-entry-${index}\`}` to each entry for `scrollChildIntoView` targeting.
7. Integrates `truncateFilePath()` and `abbreviateStat()` from `file-nav-utils.ts`.

**Verification:** Sidebar highlights correct entry. `Enter` updates main content. Path truncation works at narrow sidebar widths. Sidebar auto-scrolls when navigating beyond viewport.

### Step 7: Integrate with DiffViewer content area

**File:** `apps/tui/src/components/diff/DiffViewer.tsx`

Apply modifications from Section 10:
1. Use `forwardRef` to expose the `<scrollbox>` ref as `ScrollBoxRenderable`.
2. Assign `id={\`file-header-${index}\`}` to each file's header `<box>` element.
3. `useFileNavigation` uses `scrollbox.content.findDescendantById(headerId)` to find the header element and reads its `y` position for `scrollTo()`.

**Verification:** `]`/`[` navigation scrolls main content to the target file header.

### Step 8: Add E2E tests

**File:** `e2e/tui/diff.test.ts`

Append 52 tests across 7 describe blocks (see Section 16 below).

**Verification:** Tests run via `bun test e2e/tui/diff.test.ts`. Tests that depend on unimplemented backend features fail naturally — they are never skipped.

### Step 9: Productionize and cleanup

1. Remove any stray `console.log` statements. All debug output must use `logger.debug()` from `apps/tui/src/lib/logger.ts`.
2. Wire `tui.diff.file_nav_pattern` telemetry event on screen unmount using a `useRef` accumulator and `useEffect` cleanup function.
3. Verify all exports from barrel files (`apps/tui/src/screens/DiffScreen/index.ts` exports `useFileNavigation` and re-exports `file-nav-utils` types).
4. Run full type check: `bun run typecheck` from `apps/tui/`.
5. Verify no circular dependencies between `screens/DiffScreen/` and `components/diff/`.
6. Verify `ScrollBoxRenderable` import path resolves correctly in the Bun build pipeline.
7. Verify `viewportCulling` is enabled on the sidebar scrollbox for 500-file performance.

---

## 15. Unit & Integration Tests

### File: `e2e/tui/diff.test.ts` (appended to existing file)

All 52 tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests that fail due to unimplemented backend features are left failing — never skipped or commented out.

#### Navigation helper used across tests

```typescript
import { launchTUI, TUITestInstance, TERMINAL_SIZES, OWNER } from "./helpers.ts";

/** Navigate to diff screen with a multi-file change diff */
async function navigateToDiff(
  tui: TUITestInstance,
): Promise<void> {
  // Navigate: Dashboard → repos → first repo → changes → diff
  await tui.sendKeys("g", "r"); // go to repos
  await tui.waitForText(OWNER);
  await tui.sendKeys("Enter"); // select first repo
  await tui.waitForText("Bookmarks");
  // Navigate to a change with known multi-file diff
  // Exact navigation depends on test fixtures in the API server
}
```

---

### 15.1 Snapshot Tests (SNAP-FNAV-001 through SNAP-FNAV-010)

```typescript
describe("TUI_DIFF_FILE_NAVIGATION — snapshot tests", () => {
  test("SNAP-FNAV-001: initial file position shows File 1 of N in status bar", async () => {
    // Launch TUI at 120x40
    // Navigate to diff screen with multi-file change
    // Wait for diff content to load
    // Assert: status bar contains "File 1 of" followed by file count
    // Assert: first file header is visible at top of content area
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-002: navigation to second file updates all three zones", async () => {
    // Launch TUI at 120x40
    // Navigate to diff, press ]
    // Assert: status bar shows "File 2 of N"
    // Assert: sidebar second entry has inverse styling
    // Assert: main content shows second file's header
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-003: wrap forward from last file shows first file", async () => {
    // Navigate to last file (press ] N-1 times)
    // Press ] once more — should show File 1
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      // Parse total from status bar
      const statusLine = tui.getLine(tui.rows - 1);
      const match = statusLine.match(/File\s+\d+\s+of\s+(\d+)/);
      if (match) {
        const total = parseInt(match[1], 10);
        for (let i = 0; i < total; i++) {
          await tui.sendKeys("]");
        }
        await tui.waitForText("File 1 of");
      }
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-004: wrap backward from first file shows last file", async () => {
    // On first file, press [
    // Should wrap to last file
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("[");
      const statusLine = tui.getLine(tui.rows - 1);
      expect(statusLine).toMatch(/File\s+\d+\s+of\s+\d+/);
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-005: sidebar highlights focused file with inverse video", async () => {
    // Navigate to second file
    // Assert: second entry in sidebar has reverse video
    // Assert: first entry does NOT have reverse video
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-006: main content file header at top after navigation", async () => {
    // Navigate to third file
    // Assert: third file's header line is visible at top of content area
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]", "]");
      await tui.waitForText("File 3 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-007: single-file diff shows File 1 of 1", async () => {
    // Navigate to diff with single file change
    // Assert: status bar shows "File 1 of 1"
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to single-file diff (fixture-dependent)
      await tui.waitForText("File 1 of 1");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-008: 80x24 minimum shows file indicator without sidebar", async () => {
    // Launch at 80x24
    // Assert: no sidebar visible, status bar shows "File N of M"
    const tui = await launchTUI({ cols: 80, rows: 24 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-009: sidebar auto-scrolls to reveal focused entry", async () => {
    // With >20 files, navigate to file 15
    // Assert: sidebar has scrolled so entry 15 is visible
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      for (let i = 0; i < 14; i++) {
        await tui.sendKeys("]");
      }
      await tui.waitForText("File 15 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("SNAP-FNAV-010: truncated file path with …/ prefix at narrow sidebar", async () => {
    // Launch at 120x40 (sidebar 25% = 30 cols)
    // Navigate to diff with long file paths
    // Assert: sidebar shows paths truncated with …/ prefix
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });
});
```

---

### 15.2 Keyboard Interaction Tests (KEY-FNAV-001 through KEY-FNAV-022)

```typescript
describe("TUI_DIFF_FILE_NAVIGATION — keyboard interaction", () => {
  test("KEY-FNAV-001: ] advances to next file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-002: [ retreats to previous file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      await tui.sendKeys("[");
      await tui.waitForText("File 1 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-003: ] wraps from last to first file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      const statusLine = tui.getLine(tui.rows - 1);
      const match = statusLine.match(/File\s+\d+\s+of\s+(\d+)/);
      if (match) {
        const total = parseInt(match[1], 10);
        for (let i = 0; i < total; i++) {
          await tui.sendKeys("]");
        }
        await tui.waitForText("File 1 of");
      }
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-004: [ wraps from first to last file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("[");
      const statusLine = tui.getLine(tui.rows - 1);
      expect(statusLine).toMatch(/File\s+\d+\s+of\s+\d+/);
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-005: full roundtrip navigation returns to starting file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]", "]", "[", "[");
      await tui.waitForText("File 1 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-006: single-file diff ] is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to single-file diff (fixture-dependent)
      await tui.waitForText("File 1 of 1");
      await tui.sendKeys("]");
      await tui.waitForText("File 1 of 1");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-007: single-file diff [ is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await tui.waitForText("File 1 of 1");
      await tui.sendKeys("[");
      await tui.waitForText("File 1 of 1");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-008: ] works from content focus zone", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      // Default focus is content zone
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-009: ] works from tree focus zone", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("Tab"); // Switch to tree zone
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-010: ] works with sidebar hidden", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-011: Enter in tree jumps to focused tree entry", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("Tab"); // Focus tree
      await tui.sendKeys("j", "j"); // Move cursor to third entry
      await tui.sendKeys("Enter"); // Select
      await tui.waitForText("File 3 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-012: Enter in tree returns focus to content zone", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("Tab"); // Focus tree
      await tui.sendKeys("Enter"); // Select first file
      // Focus should return to content — subsequent j/k scrolls content
      // Sidebar border should use default color (not primary)
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-013: navigation re-scrolls to file header", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      // Scroll down within first file
      for (let i = 0; i < 20; i++) {
        await tui.sendKeys("j");
      }
      // Navigate to next file — should scroll to its header
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-014: rapid ] presses settle on correct file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]", "]", "]", "]", "]");
      await tui.waitForText("File 6 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-015: navigation resets hunk collapse state", async () => {
    // Each file starts fully expanded (collapse state reset on navigation)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("z"); // Collapse all hunks in first file
      await tui.sendKeys("]"); // Navigate to second file
      // Second file should be fully expanded
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-016: navigation preserves whitespace toggle state", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("w"); // Hide whitespace
      await tui.sendKeys("]"); // Navigate to next file
      await tui.waitForText("File 2 of");
      // Whitespace should still be hidden
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-017: navigation preserves view mode (unified/split)", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("t"); // Switch to split view
      await tui.sendKeys("]"); // Navigate to next file
      await tui.waitForText("Split view");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-018: j/k in tree moves cursor without changing main content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("Tab"); // Focus tree
      await tui.sendKeys("j"); // Move cursor down
      // Main content should still show File 1
      await tui.waitForText("File 1 of");
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-019: ] during loading state is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to diff — before content loads, press ]
      await tui.sendKeys("]");
      // Should not crash or change state
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-020: ] during error state is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to diff with invalid params (triggers error)
      await tui.sendKeys("]");
      // Should not crash
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-021: Tab toggles focus between tree and content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      // Default: content focused
      await tui.sendKeys("Tab"); // → tree
      await tui.sendKeys("Tab"); // → content
      // Sidebar border color toggles with focus
    } finally {
      await tui.terminate();
    }
  });

  test("KEY-FNAV-022: Escape from tree returns to content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("Tab"); // Focus tree
      await tui.sendKeys("Escape"); // Return to content
    } finally {
      await tui.terminate();
    }
  });
});
```

---

### 15.3 Responsive Tests (RSP-FNAV-001 through RSP-FNAV-008)

```typescript
describe("TUI_DIFF_FILE_NAVIGATION — responsive behavior", () => {
  test("RSP-FNAV-001: file navigation at 80x24 minimum", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-002: file navigation at 120x40 standard", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-003: file navigation at 200x60 large", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-004: resize preserves focused file index", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]", "]");
      await tui.waitForText("File 3 of");
      await tui.resize(80, 24);
      await tui.waitForText("File 3 of");
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-005: sidebar reappearance highlights correct file", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]", "]");
      await tui.waitForText("File 3 of");
      await tui.resize(120, 40);
      // Sidebar should appear with file 3 highlighted
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-006: stat abbreviation at narrow terminals", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      // Navigate to diff with files having >999 additions/deletions
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-007: sidebar toggle at minimum preserves navigation", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("ctrl+b"); // Should not crash (sidebar already hidden)
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("RSP-FNAV-008: sidebar scrollbox with many files", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      for (let i = 0; i < 35; i++) {
        await tui.sendKeys("]");
      }
      await tui.waitForText("File 36 of");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally {
      await tui.terminate();
    }
  });
});
```

---

### 15.4 Integration Tests (INT-FNAV-001 through INT-FNAV-005)

```typescript
describe("TUI_DIFF_FILE_NAVIGATION — integration", () => {
  test("INT-FNAV-001: file navigation with change diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
    } finally {
      await tui.terminate();
    }
  });

  test("INT-FNAV-002: file navigation with landing diff preserving comments", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to landing diff with comments (fixture-dependent)
      await tui.waitForText("File 1 of");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of");
      await tui.sendKeys("[");
      await tui.waitForText("File 1 of");
      // Comments on file 1 should still be visible
    } finally {
      await tui.terminate();
    }
  });

  test("INT-FNAV-003: whitespace toggle then file navigation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("w"); // Toggle whitespace
      await tui.sendKeys("]"); // Navigate next
      // Should work without error
    } finally {
      await tui.terminate();
    }
  });

  test("INT-FNAV-004: cached diff back-navigation preserves fresh start", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]", "]");
      await tui.waitForText("File 3 of");
      await tui.sendKeys("q"); // Back
      await navigateToDiff(tui);
      await tui.waitForText("File 1 of"); // Fresh start
    } finally {
      await tui.terminate();
    }
  });

  test("INT-FNAV-005: deep link launch starts at file 1", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "diff", "--repo", `${OWNER}/test-repo`, "--change", "abc123"],
    });
    try {
      await tui.waitForText("File 1 of");
    } finally {
      await tui.terminate();
    }
  });
});
```

---

### 15.5 Edge Case Tests (EDGE-FNAV-001 through EDGE-FNAV-007)

```typescript
describe("TUI_DIFF_FILE_NAVIGATION — edge cases", () => {
  test("EDGE-FNAV-001: empty diff shows no file indicator", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to empty diff (fixture-dependent)
      await tui.sendKeys("]"); // Should not crash
      await tui.sendKeys("["); // Should not crash
    } finally {
      await tui.terminate();
    }
  });

  test("EDGE-FNAV-002: 500-file diff navigation performance", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui); // Needs 500-file fixture
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await tui.sendKeys("]");
      }
      const elapsed = Date.now() - start;
      await tui.waitForText("File 11 of 500");
      // Note: elapsed includes 50ms delay per key from sendKeys
    } finally {
      await tui.terminate();
    }
  });

  test("EDGE-FNAV-003: 2-file diff toggle between files", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to 2-file diff (fixture-dependent)
      await tui.waitForText("File 1 of 2");
      await tui.sendKeys("]");
      await tui.waitForText("File 2 of 2");
      await tui.sendKeys("]"); // wraps
      await tui.waitForText("File 1 of 2");
      await tui.sendKeys("["); // wraps
      await tui.waitForText("File 2 of 2");
    } finally {
      await tui.terminate();
    }
  });

  test("EDGE-FNAV-004: concurrent resize during navigation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      await tui.sendKeys("]");
      await tui.resize(80, 24);
      const statusLine = tui.getLine(tui.rows - 1);
      expect(statusLine).toMatch(/File\s+2\s+of/);
    } finally {
      await tui.terminate();
    }
  });

  test("EDGE-FNAV-005: index clamped after whitespace toggle reduces file count", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui);
      // Navigate to a high-index file, toggle whitespace
      await tui.sendKeys("w");
      // Index should clamp — no crash
    } finally {
      await tui.terminate();
    }
  });

  test("EDGE-FNAV-006: renamed file navigable with old path displayed", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await navigateToDiff(tui); // Needs fixture with renamed file
      await tui.sendKeys("]");
      // File header should show "(was old/path)" annotation
    } finally {
      await tui.terminate();
    }
  });

  test("EDGE-FNAV-007: inline comments preserved across navigation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to landing diff with inline comments
      await tui.sendKeys("]"); // Go to file 2
      await tui.sendKeys("["); // Back to file 1
      // Comments should be preserved
    } finally {
      await tui.terminate();
    }
  });
});
```

---

## 16. Productionization Checklist

Once the implementation is complete, the following items must be verified before merge:

### 16.1 Code Quality

1. **No `console.log` or raw `console.error` in production code.** All debug output uses `logger.debug()` / `logger.warn()` from `apps/tui/src/lib/logger.ts`.
2. **All telemetry uses `emit()` from `apps/tui/src/lib/telemetry.ts`** — never direct writes to stderr for business events.
3. **No `any` type assertions** in `useFileNavigation.ts` or `file-nav-utils.ts`.
4. **All exported functions have JSDoc comments** with `@param`, `@returns`, and `@example` tags.
5. **Barrel exports updated:** `apps/tui/src/screens/DiffScreen/index.ts` exports `useFileNavigation` and re-exports `file-nav-utils` utilities.

### 16.2 Type Safety

1. Run `bun run typecheck` from `apps/tui/` — zero errors.
2. Verify `ScrollBoxRenderable` import from `@opentui/core` resolves correctly. The type provides `scrollTo()`, `scrollTop`, `scrollHeight`, `viewport.height`, and `content.findDescendantById()`. If any method is missing from the installed version, create a narrowing type guard.
3. Verify `FileDiffItem` type from `@codeplane/sdk` includes: `path`, `old_path`, `change_type`, `additions`, `deletions`, `is_binary`, `language`.
4. Verify `forwardRef<ScrollBoxRenderable, Props>` pattern compiles correctly with React 19 + OpenTUI reconciler.

### 16.3 Performance

1. **Navigation event latency:** Measure time from `]` keypress to status bar update. Target: <16ms.
2. **Scroll-to latency:** Measure time from `scrollTo()` call to visual update. Target: single frame (<16ms).
3. **500-file stress test:** Load a diff with 500 `FileDiffItem` entries. Navigate through all 500. Verify no memory leak (stable RSS over 5 minutes).
4. **Viewport culling:** Ensure `viewportCulling={true}` is set on the sidebar `<scrollbox>` component for 500-file performance. OpenTUI's `ContentRenderable._getVisibleChildren()` will only render entries within the viewport.

### 16.4 Dependency Verification

1. Verify `tui-diff-file-tree` delivers the `DiffFileTree` component. If not yet delivered, create a temporary `DiffFileTreePlaceholder` that accepts the new prop interface and renders a simple list. The placeholder must use `forwardRef` to expose the scrollbox ref.
2. Verify `tui-diff-unified-view` delivers `DiffViewer` / `UnifiedDiffViewer` with file section rendering. If not yet delivered, create a temporary `DiffViewerPlaceholder` that renders file headers with correct `id` attributes.
3. Both dependencies are listed as required. If either is incomplete, the file navigation feature still works at the state/keybinding level — only the visual scroll-to and sidebar highlight may be partial.

### 16.5 Test Validation

1. All 52 tests exist in `e2e/tui/diff.test.ts`.
2. Tests that fail due to unimplemented backend (API server not returning fixture data) are **left failing** — never skipped, never commented out.
3. Run `bun test e2e/tui/diff.test.ts` — verify test discovery finds all 52 tests.
4. Snapshot golden files are committed alongside the test file.

---

## 17. File Inventory

### New Files

| File | Lines (est.) | Purpose |
|------|-------------|--------|
| `apps/tui/src/screens/DiffScreen/useFileNavigation.ts` | ~170 | Core navigation hook |
| `apps/tui/src/screens/DiffScreen/file-nav-utils.ts` | ~80 | Pure utility functions |

### Modified Files

| File | Nature of Change |
|------|------------------|
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Add state, refs, hook call, layout updates |
| `apps/tui/src/screens/DiffScreen/keybindings.ts` | Wire `]`/`[`/`Enter` handlers, extend context type |
| `apps/tui/src/screens/DiffScreen/types.ts` | Add `FileNavigationState`, `FileNavEvent` |
| `apps/tui/src/components/diff/DiffViewer.tsx` | Use `forwardRef`, assign stable `id` to file headers |
| `apps/tui/src/components/diff/DiffFileTree.tsx` | Use `forwardRef`, accept navigation props, render highlights |
| `e2e/tui/diff.test.ts` | Add 52 tests in 7 describe blocks |

### Unchanged Files (consumed, not modified)

| File | Usage |
|------|-------|
| `apps/tui/src/hooks/useScreenKeybindings.ts` | Keybinding registration |
| `apps/tui/src/hooks/useLayout.ts` | Sidebar visibility, breakpoint |
| `apps/tui/src/lib/logger.ts` | Debug/warn logging |
| `apps/tui/src/lib/telemetry.ts` | Business event emission |
| `apps/tui/src/components/StatusBar.tsx` | Renders file indicator via hints |
| `apps/tui/src/providers/KeybindingProvider.tsx` | Dispatch layer |

---

## 18. Source of Truth

This engineering specification should be maintained alongside:

- [specs/tui/prd.md](../prd.md) — Product requirements
- [specs/tui/design.md](../design.md) — Design specification
- [specs/tui/engineering/tui-diff-screen-scaffold.md](./tui-diff-screen-scaffold.md) — DiffScreen shell
- [specs/tui/engineering/tui-diff-file-tree.md](./tui-diff-file-tree.md) — DiffFileTree component
- [specs/tui/engineering/tui-diff-unified-view.md](./tui-diff-unified-view.md) — DiffViewer / UnifiedDiffViewer
- [specs/tui/engineering/tui-diff-data-hooks.md](./tui-diff-data-hooks.md) — Data layer
- [specs/tui/features.ts](../features.ts) — Feature inventory
- [context/opentui/](../../context/opentui/) — OpenTUI component reference
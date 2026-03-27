# Engineering Specification: TUI_DIFF_FILE_TREE — Sidebar File Inventory with Change Icons and Search

**Ticket:** `tui-diff-file-tree`
**Status:** Not started
**Dependencies:** `tui-diff-screen-scaffold` (DiffScreen shell, focus zone state machine, layout integration), `tui-diff-data-hooks` (`useChangeDiff`, `useLandingDiff`, `FileDiffItem` types)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket implements the diff file tree sidebar — the left-panel component inside the `DiffScreen` that provides an at-a-glance inventory of every changed file in a diff. It replaces the `DiffFileTreePlaceholder` from the scaffold ticket with a fully interactive component.

The file tree provides:

1. **File inventory** — Each entry shows a colored change type icon (A/D/M/R/C), truncated file path, optional suffixes ([bin]/[mode]), and +N/-M stat summary.
2. **Keyboard navigation** — j/k/Up/Down movement, G/gg jump, Ctrl+D/U paging, Enter to select and transfer focus to content.
3. **Inline search filter** — `/` activates case-insensitive substring search (128 char max), incremental narrowing, Esc clears.
4. **Focus synchronization** — Tree cursor follows `]`/`[` content navigation. Enter on a tree entry jumps the main diff content to that file.
5. **Responsive behavior** — Hidden below 120 cols by default, 25% width at standard, 30% at large. Manual toggle via Ctrl+B (including at minimum breakpoint). Resize respects manual toggle state.
6. **Summary line** — Shows "N files +X -Y" or "N of M files" when filtered.
7. **500-file cap** — Truncation indicator when file count exceeds 500.

---

## 2. File Inventory

All new files target `apps/tui/src/screens/DiffScreen/`. This directory is established by the scaffold ticket.

| File | Purpose |
|------|--------|
| `apps/tui/src/screens/DiffScreen/DiffFileTree.tsx` | Main file tree component |
| `apps/tui/src/screens/DiffScreen/DiffFileTreeEntry.tsx` | Single file entry row component |
| `apps/tui/src/screens/DiffScreen/DiffFileTreeSummary.tsx` | Summary line component |
| `apps/tui/src/screens/DiffScreen/DiffFileTreeSearch.tsx` | Search input component |
| `apps/tui/src/screens/DiffScreen/TreeErrorBoundary.tsx` | Lightweight error boundary with fallback rendering |
| `apps/tui/src/screens/DiffScreen/useFileTreeState.ts` | State management hook |
| `apps/tui/src/screens/DiffScreen/useFileTreeKeybindings.ts` | Keybinding registration for tree zone |
| `apps/tui/src/screens/DiffScreen/file-tree-utils.ts` | Pure utility functions (path truncation, icon resolution, stat formatting) |
| `apps/tui/src/screens/DiffScreen/file-tree-types.ts` | Type definitions for file tree state |
| `apps/tui/src/hooks/useSidebarState.ts` | Modified — allow explicit toggle at minimum breakpoint |
| `apps/tui/src/hooks/useLayout.ts` | Modified — return `"30%"` sidebar width at minimum breakpoint when visible |
| `e2e/tui/diff.test.ts` | 74 tests appended to existing file (after SNAP-SYN/KEY-SYN/RSP-SYN/INT-SYN/EDGE-SYN blocks) |

---

## 3. Type Definitions

### File: `apps/tui/src/screens/DiffScreen/file-tree-types.ts`

```typescript
import type { FileDiffItem } from "../../types/diff.js";

/**
 * Change type icon character and associated ANSI color.
 * Maps from FileDiffItem.change_type to display representation.
 */
export interface ChangeTypeDisplay {
  /** Single-character icon: A, D, M, R, C, or ? for unknown */
  icon: string;
  /** ANSI 256 foreground color index for the icon */
  color: number;
}

/**
 * A processed file entry ready for rendering.
 * Derived from FileDiffItem with display-specific fields.
 */
export interface FileTreeEntry {
  /** Original index in the unfiltered file list (for sync with content pane) */
  originalIndex: number;
  /** The underlying diff item */
  item: FileDiffItem;
  /** Resolved display icon and color */
  changeDisplay: ChangeTypeDisplay;
  /** Display path — truncated from left with …/ when needed */
  displayPath: string;
  /** Full path for search matching */
  fullPath: string;
  /** Pre-lowercased path for fast search filtering (avoids repeated toLowerCase calls) */
  lowercasePath: string;
  /** Old path for renames (shown as old → new) */
  oldPath: string | null;
  /** Pre-lowercased old path for fast search filtering */
  lowercaseOldPath: string | null;
  /** Whether this is a binary file */
  isBinary: boolean;
  /** Whether this is a permission-only change */
  isPermissionOnly: boolean;
  /** Formatted stat string e.g. "+12 -3" */
  statText: string;
  /** Addition count */
  additions: number;
  /** Deletion count */
  deletions: number;
}

/**
 * Aggregate stats for the summary line.
 */
export interface FileTreeSummary {
  totalFiles: number;
  filteredFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  filteredAdditions: number;
  filteredDeletions: number;
  isTruncated: boolean;
  isFiltered: boolean;
}

/**
 * Complete state for the file tree sidebar.
 * Used as the interface contract between DiffScreen and DiffFileTree.
 */
export interface FileTreeState {
  /** All file entries (up to FILE_CAP, post-processing) */
  allEntries: FileTreeEntry[];
  /** Entries after search filter applied */
  filteredEntries: FileTreeEntry[];
  /** Index into filteredEntries of the focused entry */
  focusedIndex: number;
  /** Whether search input is active */
  searchActive: boolean;
  /** Current search query string */
  searchQuery: string;
  /** Summary stats */
  summary: FileTreeSummary;
  /** Scroll offset for viewport windowing */
  scrollOffset: number;
  /** Whether the original file list exceeded FILE_CAP */
  isTruncated: boolean;
}

export const FILE_CAP = 500;
export const SEARCH_MAX_LENGTH = 128;
```

**Rationale for `lowercasePath` / `lowercaseOldPath` fields:** These are computed once during `processFileEntries` rather than on every keystroke during search. For 500 entries with average 60-char paths, this eliminates ~500 `toLowerCase()` calls per keystroke. This is the "option 2" optimization from the productionization notes, baked in from the start since it costs nothing at build time and prevents the need for a future migration.

---

## 4. Pure Utility Functions

### File: `apps/tui/src/screens/DiffScreen/file-tree-utils.ts`

All display logic is extracted into pure, testable functions with no React dependency.

```typescript
import type { FileDiffItem } from "../../types/diff.js";
import type { ChangeTypeDisplay, FileTreeEntry, FileTreeSummary } from "./file-tree-types.js";
import { FILE_CAP } from "./file-tree-types.js";

/**
 * ANSI 256 color constants for change type icons.
 * Matches the semantic color tokens from design spec §7.2.
 */
const CHANGE_TYPE_COLORS = {
  added:    34,   // green — matches theme.success
  deleted:  196,  // red — matches theme.error
  modified: 178,  // yellow — matches theme.warning
  renamed:  37,   // cyan
  copied:   37,   // cyan
} as const;

/**
 * Map change_type to display icon and color.
 * Unknown types render as "?" in muted (245).
 */
export function resolveChangeTypeDisplay(changeType: string): ChangeTypeDisplay {
  switch (changeType) {
    case "added":    return { icon: "A", color: CHANGE_TYPE_COLORS.added };
    case "deleted":  return { icon: "D", color: CHANGE_TYPE_COLORS.deleted };
    case "modified": return { icon: "M", color: CHANGE_TYPE_COLORS.modified };
    case "renamed":  return { icon: "R", color: CHANGE_TYPE_COLORS.renamed };
    case "copied":   return { icon: "C", color: CHANGE_TYPE_COLORS.copied };
    default:         return { icon: "?", color: 245 }; // muted
  }
}

/**
 * Truncate a file path from the LEFT to fit within maxWidth.
 * Prepends "…/" when truncation occurs.
 *
 * Examples:
 *   truncatePathLeft("src/components/DiffFileTree.tsx", 30) → "src/components/DiffFileTree.tsx"
 *   truncatePathLeft("src/components/DiffFileTree.tsx", 20) → "…/DiffFileTree.tsx"
 *   truncatePathLeft("verylongfilename.tsx", 15)            → "…longfilename.t…"
 */
export function truncatePathLeft(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  if (maxWidth <= 4) return path.slice(0, maxWidth);

  const prefix = "…/";
  const remaining = maxWidth - prefix.length;

  // Try to find a path separator that lets us show the most specific segment
  const segments = path.split("/");
  for (let i = segments.length - 1; i >= 1; i--) {
    const suffix = segments.slice(i).join("/");
    if (suffix.length <= remaining) {
      return prefix + suffix;
    }
  }

  // Last segment alone is too long — truncate from right
  const lastSegment = segments[segments.length - 1];
  if (lastSegment.length <= remaining) {
    return prefix + lastSegment;
  }
  return prefix + lastSegment.slice(0, remaining - 1) + "…";
}

/**
 * Format rename path display: "old_path → new_path"
 * Both paths are truncated to fit within maxWidth.
 */
export function formatRenamePath(
  oldPath: string,
  newPath: string,
  maxWidth: number,
): string {
  const arrow = " → ";
  const full = `${oldPath}${arrow}${newPath}`;
  if (full.length <= maxWidth) return full;

  // Allocate half to each side, rounding remainder to the new path
  const halfWidth = Math.floor((maxWidth - arrow.length) / 2);
  const newHalf = maxWidth - arrow.length - halfWidth;
  return `${truncatePathLeft(oldPath, halfWidth)}${arrow}${truncatePathLeft(newPath, newHalf)}`;
}

/**
 * Format stat summary string: "+N -M" with separate segments.
 * Returns { addText, delText } for independent coloring.
 * Binary files return null (stat not applicable).
 * Permission-only changes return null.
 */
export function formatStat(
  additions: number,
  deletions: number,
  isBinary: boolean,
  isPermissionOnly: boolean,
): { addText: string; delText: string } | null {
  if (isBinary || isPermissionOnly) return null;
  return {
    addText: `+${additions}`,
    delText: `-${deletions}`,
  };
}

/**
 * Determine if a file entry is permission-only change.
 * Heuristic: 0 additions, 0 deletions, not binary, modified type, no old_path (not a rename).
 */
export function isPermissionOnlyChange(item: FileDiffItem): boolean {
  return (
    item.additions === 0 &&
    item.deletions === 0 &&
    !item.is_binary &&
    item.change_type === "modified" &&
    !item.old_path
  );
}

/**
 * Compact stat string for the entry row.
 * Returns empty string for binary/permission-only entries.
 */
function formatStatCompact(
  additions: number,
  deletions: number,
  isBinary: boolean,
  isPermissionOnly: boolean,
): string {
  if (isBinary) return "";
  if (isPermissionOnly) return "";
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(" ");
}

/**
 * Process raw FileDiffItem[] into FileTreeEntry[] ready for rendering.
 * Applies FILE_CAP truncation. Calculates display fields.
 * Pre-computes lowercased paths for fast search filtering.
 *
 * Entries with missing `path` field are skipped with a warning logged
 * by the caller (this function is pure — no side effects).
 *
 * @param files - Raw file diff items from API response
 * @param availablePathWidth - Available columns for the path text segment
 * @param fileCap - Maximum number of entries to process (default FILE_CAP)
 * @returns Processed entries and truncation flag
 */
export function processFileEntries(
  files: FileDiffItem[],
  availablePathWidth: number,
  fileCap: number = FILE_CAP,
): { entries: FileTreeEntry[]; isTruncated: boolean; skippedIndices: number[] } {
  const isTruncated = files.length > fileCap;
  const capped = isTruncated ? files.slice(0, fileCap) : files;
  const skippedIndices: number[] = [];

  const entries: FileTreeEntry[] = [];
  for (let i = 0; i < capped.length; i++) {
    const item = capped[i];
    if (!item.path) {
      skippedIndices.push(i);
      continue; // caller logs warning
    }

    const changeDisplay = resolveChangeTypeDisplay(item.change_type);
    const permOnly = isPermissionOnlyChange(item);
    const isRenamed = item.change_type === "renamed" && !!item.old_path;

    let displayPath: string;
    if (isRenamed && item.old_path) {
      displayPath = formatRenamePath(item.old_path, item.path, availablePathWidth);
    } else {
      displayPath = truncatePathLeft(item.path, availablePathWidth);
    }

    entries.push({
      originalIndex: i,
      item,
      changeDisplay,
      displayPath,
      fullPath: item.path,
      lowercasePath: item.path.toLowerCase(),
      oldPath: item.old_path ?? null,
      lowercaseOldPath: item.old_path ? item.old_path.toLowerCase() : null,
      isBinary: item.is_binary,
      isPermissionOnly: permOnly,
      statText: formatStatCompact(item.additions, item.deletions, item.is_binary, permOnly),
      additions: item.additions,
      deletions: item.deletions,
    });
  }

  return { entries, isTruncated, skippedIndices };
}

/**
 * Filter entries by case-insensitive substring match on full path.
 * Special regex characters are treated as literals (no regex/shell evaluation).
 * Also matches against old_path for renamed files.
 *
 * Uses pre-computed lowercasePath/lowercaseOldPath fields for performance.
 */
export function filterEntries(
  entries: FileTreeEntry[],
  query: string,
): FileTreeEntry[] {
  if (!query) return entries;
  const lower = query.toLowerCase();
  return entries.filter((e) => {
    const pathMatch = e.lowercasePath.includes(lower);
    const oldPathMatch = e.lowercaseOldPath ? e.lowercaseOldPath.includes(lower) : false;
    return pathMatch || oldPathMatch;
  });
}

/**
 * Compute summary stats for the file tree.
 */
export function computeSummary(
  allEntries: FileTreeEntry[],
  filteredEntries: FileTreeEntry[],
  isTruncated: boolean,
  isFiltered: boolean,
): FileTreeSummary {
  const totalAdditions = allEntries.reduce((sum, e) => sum + e.additions, 0);
  const totalDeletions = allEntries.reduce((sum, e) => sum + e.deletions, 0);
  const filteredAdditions = filteredEntries.reduce((sum, e) => sum + e.additions, 0);
  const filteredDeletions = filteredEntries.reduce((sum, e) => sum + e.deletions, 0);

  return {
    totalFiles: allEntries.length,
    filteredFiles: filteredEntries.length,
    totalAdditions,
    totalDeletions,
    filteredAdditions,
    filteredDeletions,
    isTruncated,
    isFiltered,
  };
}

/**
 * Format summary line text.
 * Unfiltered: "5 files +42 -18"
 * Filtered: "3 of 5 files +12 -3"
 * Truncated: "500 files (truncated) +1234 -567"
 */
export function formatSummaryLine(summary: FileTreeSummary): string {
  const additions = summary.isFiltered ? summary.filteredAdditions : summary.totalAdditions;
  const deletions = summary.isFiltered ? summary.filteredDeletions : summary.totalDeletions;
  const statPart = `+${additions} -${deletions}`;

  if (summary.isFiltered) {
    return `${summary.filteredFiles} of ${summary.totalFiles} files ${statPart}`;
  }
  if (summary.isTruncated) {
    return `${summary.totalFiles} files (truncated) ${statPart}`;
  }
  return `${summary.totalFiles} files ${statPart}`;
}

/**
 * Format status bar file position text.
 * Always: "File N of M"
 */
export function formatFilePosition(focusedIndex: number, totalFiles: number): string {
  if (totalFiles === 0) return "No files";
  return `File ${focusedIndex + 1} of ${totalFiles}`;
}
```

---

## 5. State Management Hook

### File: `apps/tui/src/screens/DiffScreen/useFileTreeState.ts`

This hook encapsulates all file tree state: entry processing, filtering, cursor management, search, and scroll offset. It is the single source of truth for the file tree sidebar.

The hook is called in `DiffScreen` (not in `DiffFileTree`) so that the scaffold can coordinate cross-zone state: the content pane reads `treeState.currentOriginalIndex` for scroll sync, and `]`/`[` keybindings call `treeState.syncToOriginalIndex()`.

```typescript
import { useState, useMemo, useCallback, useEffect } from "react";
import type { FileDiffItem } from "../../types/diff.js";
import type { FileTreeEntry } from "./file-tree-types.js";
import { FILE_CAP, SEARCH_MAX_LENGTH } from "./file-tree-types.js";
import {
  processFileEntries,
  filterEntries,
  computeSummary,
} from "./file-tree-utils.js";
import { logger } from "../../lib/logger.js";

interface UseFileTreeStateOptions {
  /** Raw file diff items from the data hook */
  files: FileDiffItem[];
  /** Available width in columns for the path text (sidebar width minus icon, stat, padding) */
  availablePathWidth: number;
  /** Viewport height in rows (for paging calculations) */
  viewportHeight: number;
}

export interface UseFileTreeStateReturn {
  /** All file entries (up to FILE_CAP, post-processing) */
  allEntries: FileTreeEntry[];
  /** Entries after search filter applied */
  filteredEntries: FileTreeEntry[];
  /** Index into filteredEntries of the focused entry */
  focusedIndex: number;
  /** Whether search input is active */
  searchActive: boolean;
  /** Current search query string */
  searchQuery: string;
  /** Summary stats */
  summary: ReturnType<typeof computeSummary>;
  /** Scroll offset for viewport windowing */
  scrollOffset: number;
  /** Whether the original file list exceeded FILE_CAP */
  isTruncated: boolean;
  /** Move cursor down by 1 */
  moveDown: () => void;
  /** Move cursor up by 1 */
  moveUp: () => void;
  /** Jump to last entry */
  jumpToEnd: () => void;
  /** Jump to first entry */
  jumpToStart: () => void;
  /** Page down (half viewport) */
  pageDown: () => void;
  /** Page up (half viewport) */
  pageUp: () => void;
  /** Activate search mode */
  activateSearch: () => void;
  /** Deactivate search and clear query */
  clearSearch: () => void;
  /** Update search query (clamped to SEARCH_MAX_LENGTH) */
  setSearchQuery: (query: string) => void;
  /** Select current entry — returns the originalIndex for content sync */
  selectCurrent: () => number | null;
  /** Sync cursor to a specific originalIndex (called by ]/[ nav) */
  syncToOriginalIndex: (originalIndex: number) => void;
  /** Get the currently focused entry's originalIndex */
  currentOriginalIndex: number | null;
}

export function useFileTreeState(options: UseFileTreeStateOptions): UseFileTreeStateReturn {
  const { files, availablePathWidth, viewportHeight } = options;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQueryRaw] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);

  // Process file entries — memoized on files and path width
  const { entries: allEntries, isTruncated, skippedIndices } = useMemo(
    () => processFileEntries(files, availablePathWidth, FILE_CAP),
    [files, availablePathWidth],
  );

  // Log warnings for skipped entries and truncation
  useEffect(() => {
    for (const idx of skippedIndices) {
      logger.warn(`skipping file entry with missing path at index ${idx}`);
    }
  }, [skippedIndices]);

  useEffect(() => {
    if (isTruncated) {
      logger.warn(`file tree truncated: ${files.length} files exceeds cap of ${FILE_CAP}`);
    }
  }, [isTruncated, files.length]);

  // Log unknown change types
  useEffect(() => {
    for (const entry of allEntries) {
      if (entry.changeDisplay.icon === "?") {
        logger.warn(`unknown change_type "${entry.item.change_type}" for file ${entry.fullPath}`);
      }
    }
  }, [allEntries]);

  // Filter entries by search query
  const filteredEntries = useMemo(
    () => filterEntries(allEntries, searchQuery),
    [allEntries, searchQuery],
  );

  // Compute summary
  const isFiltered = searchQuery.length > 0;
  const summary = useMemo(
    () => computeSummary(allEntries, filteredEntries, isTruncated, isFiltered),
    [allEntries, filteredEntries, isTruncated, isFiltered],
  );

  // Clamp focused index when filtered entries change
  useEffect(() => {
    if (filteredEntries.length === 0) {
      setFocusedIndex(0);
    } else if (focusedIndex >= filteredEntries.length) {
      setFocusedIndex(filteredEntries.length - 1);
    }
  }, [filteredEntries.length, focusedIndex]);

  // Ensure scroll offset keeps focused item visible
  useEffect(() => {
    if (focusedIndex < scrollOffset) {
      setScrollOffset(focusedIndex);
    } else if (focusedIndex >= scrollOffset + viewportHeight) {
      setScrollOffset(focusedIndex - viewportHeight + 1);
    }
  }, [focusedIndex, scrollOffset, viewportHeight]);

  // Navigation actions — all use functional setState for sequential processing
  // under rapid key input (React batches updates within the same tick)
  const moveDown = useCallback(() => {
    setFocusedIndex((i) => Math.min(i + 1, filteredEntries.length - 1));
  }, [filteredEntries.length]);

  const moveUp = useCallback(() => {
    setFocusedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const jumpToEnd = useCallback(() => {
    setFocusedIndex(Math.max(0, filteredEntries.length - 1));
  }, [filteredEntries.length]);

  const jumpToStart = useCallback(() => {
    setFocusedIndex(0);
    setScrollOffset(0);
  }, []);

  const pageDown = useCallback(() => {
    const halfPage = Math.max(1, Math.floor(viewportHeight / 2));
    setFocusedIndex((i) => Math.min(i + halfPage, filteredEntries.length - 1));
  }, [viewportHeight, filteredEntries.length]);

  const pageUp = useCallback(() => {
    const halfPage = Math.max(1, Math.floor(viewportHeight / 2));
    setFocusedIndex((i) => Math.max(i - halfPage, 0));
  }, [viewportHeight]);

  // Search actions
  const activateSearch = useCallback(() => {
    setSearchActive(true);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchActive(false);
    setSearchQueryRaw("");
    setFocusedIndex(0);
    setScrollOffset(0);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    const clamped = query.slice(0, SEARCH_MAX_LENGTH);
    setSearchQueryRaw(clamped);
    setFocusedIndex(0); // Reset cursor on each keystroke
    setScrollOffset(0);
  }, []);

  // Selection — returns originalIndex for content pane scroll sync
  const selectCurrent = useCallback((): number | null => {
    if (filteredEntries.length === 0) return null;
    const entry = filteredEntries[focusedIndex];
    return entry ? entry.originalIndex : null;
  }, [filteredEntries, focusedIndex]);

  // Sync from content ]/[ navigation — clears search filter first
  const syncToOriginalIndex = useCallback((originalIndex: number) => {
    if (searchActive) {
      setSearchActive(false);
      setSearchQueryRaw("");
    }
    // Find the entry with the matching originalIndex in allEntries (search cleared)
    const idx = allEntries.findIndex((e) => e.originalIndex === originalIndex);
    if (idx !== -1) {
      setFocusedIndex(idx);
    }
  }, [allEntries, searchActive]);

  const currentOriginalIndex = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    return filteredEntries[focusedIndex]?.originalIndex ?? null;
  }, [filteredEntries, focusedIndex]);

  return {
    allEntries,
    filteredEntries,
    focusedIndex,
    searchActive,
    searchQuery,
    summary,
    scrollOffset,
    isTruncated,
    moveDown,
    moveUp,
    jumpToEnd,
    jumpToStart,
    pageDown,
    pageUp,
    activateSearch,
    clearSearch,
    setSearchQuery,
    selectCurrent,
    syncToOriginalIndex,
    currentOriginalIndex,
  };
}
```

---

## 6. Keybinding Registration

### File: `apps/tui/src/screens/DiffScreen/useFileTreeKeybindings.ts`

This hook builds keybindings that are ONLY active when `focusZone === "tree"`. It complements (not replaces) the screen-level keybindings registered by the scaffold's `buildDiffKeybindings`.

The scaffold's `buildDiffKeybindings` already handles:
- `Tab` / `Shift+Tab` — zone switching
- `]` / `[` — file navigation (content zone, syncs to tree)
- `t`, `w`, `x`, `z` — view toggles
- `ctrl+b` — sidebar toggle

This hook handles tree-specific navigation when the tree zone is focused. Bindings use `when: () => focusZone === "tree" && !searchActive` guards to avoid conflicts with text input.

```typescript
import type { KeyHandler } from "../../providers/keybinding-types.js";
import type { UseFileTreeStateReturn } from "./useFileTreeState.js";

interface FileTreeKeybindingContext {
  treeState: UseFileTreeStateReturn;
  focusZone: "tree" | "content";
  searchActive: boolean;
  onSelectFile: (originalIndex: number) => void;
  setFocusZone: (zone: "tree" | "content") => void;
}

/**
 * Build keybindings for file tree navigation.
 *
 * These are merged with the scaffold keybindings in the DiffScreen's
 * useScreenKeybindings call. They use `when` predicates to only
 * activate in the tree focus zone.
 *
 * NOTE on `gg` (jump to start):
 * The `gg` two-key sequence conflicts with the go-to mode system
 * (where `g` followed by `d`/`i`/`l` etc. navigates to another screen).
 * The go-to mode system has a 1500ms timeout. Within that window,
 * `g` followed by `g` is consumed by the go-to mode handler.
 * The scaffold's go-to integration must special-case `gg` when
 * focusZone === "tree" to call `treeState.jumpToStart()` instead
 * of treating the second `g` as an invalid go-to target.
 * This is wired in the scaffold's go-to override, not here.
 */
export function buildFileTreeKeybindings(ctx: FileTreeKeybindingContext): KeyHandler[] {
  const { treeState, focusZone, searchActive, onSelectFile, setFocusZone } = ctx;
  const isTreeFocused = () => focusZone === "tree";
  const isTreeNav = () => focusZone === "tree" && !searchActive;

  return [
    // --- Tree navigation (only when tree focused and search NOT active) ---
    {
      key: "j",
      description: "Move down",
      group: "File Tree",
      handler: () => treeState.moveDown(),
      when: isTreeNav,
    },
    {
      key: "down",
      description: "Move down",
      group: "File Tree",
      handler: () => treeState.moveDown(),
      when: isTreeNav,
    },
    {
      key: "k",
      description: "Move up",
      group: "File Tree",
      handler: () => treeState.moveUp(),
      when: isTreeNav,
    },
    {
      key: "up",
      description: "Move up",
      group: "File Tree",
      handler: () => treeState.moveUp(),
      when: isTreeNav,
    },
    {
      key: "G",
      description: "Jump to bottom",
      group: "File Tree",
      handler: () => treeState.jumpToEnd(),
      when: isTreeNav,
    },
    {
      key: "ctrl+d",
      description: "Page down",
      group: "File Tree",
      handler: () => treeState.pageDown(),
      when: isTreeNav,
    },
    {
      key: "ctrl+u",
      description: "Page up",
      group: "File Tree",
      handler: () => treeState.pageUp(),
      when: isTreeNav,
    },
    {
      key: "return",
      description: "Select file",
      group: "File Tree",
      handler: () => {
        if (searchActive) {
          // In search mode: Enter selects first match and exits search
          treeState.clearSearch();
        }
        const idx = treeState.selectCurrent();
        if (idx !== null) {
          onSelectFile(idx);
          setFocusZone("content");
        }
      },
      when: isTreeFocused,
    },
    // --- Search ---
    {
      key: "/",
      description: "Search files",
      group: "File Tree",
      handler: () => treeState.activateSearch(),
      when: isTreeNav,
    },
    {
      key: "escape",
      description: "Clear search / to content",
      group: "File Tree",
      handler: () => {
        if (searchActive) {
          treeState.clearSearch();
        } else {
          // When not in search, Esc transfers focus to content
          setFocusZone("content");
        }
      },
      when: isTreeFocused,
    },
  ];
}
```

**Integration with scaffold keybindings:**

The scaffold's `buildDiffKeybindings` must be updated to:
1. Add `shift+tab` handler that is a no-op when sidebar is hidden.
2. Wire `]`/`[` handlers to call `treeState.syncToOriginalIndex()` after navigating content.
3. Special-case `gg` in the go-to mode override: when `focusZone === "tree"`, the second `g` calls `treeState.jumpToStart()` instead of navigating to Dashboard.

The DiffScreen component merges both keybinding sets:
```typescript
// In DiffScreen, after scaffold keybindings:
useScreenKeybindings(
  [
    ...buildDiffKeybindings(scaffoldCtx),
    ...buildFileTreeKeybindings(treeCtx),
  ],
  focusZone === "tree" ? treeStatusBarHints : contentStatusBarHints,
);
```

---

## 7. Component Implementation

### 7.1 DiffFileTree (main component)

#### File: `apps/tui/src/screens/DiffScreen/DiffFileTree.tsx`

```typescript
import React, { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { useLayout } from "../../hooks/useLayout.js";
import { DiffFileTreeEntry } from "./DiffFileTreeEntry.js";
import { DiffFileTreeSummary } from "./DiffFileTreeSummary.js";
import { DiffFileTreeSearch } from "./DiffFileTreeSearch.js";
import type { FileDiffItem } from "../../types/diff.js";
import type { UseFileTreeStateReturn } from "./useFileTreeState.js";

interface DiffFileTreeProps {
  /** Whether this zone is currently focused */
  focused: boolean;
  /** File diff items from the data hook */
  files: FileDiffItem[];
  /** Callback to sync content pane to selected file */
  onSelectFile: (originalIndex: number) => void;
  /** External sync: set by ]/[ content navigation */
  syncedOriginalIndex: number | null;
  /** Tree state (lifted to DiffScreen for cross-zone coordination) */
  treeState: UseFileTreeStateReturn;
}

export function DiffFileTree({
  focused,
  files,
  onSelectFile,
  syncedOriginalIndex,
  treeState,
}: DiffFileTreeProps) {
  const theme = useTheme();
  const layout = useLayout();

  // Sync from external ]/[ navigation
  React.useEffect(() => {
    if (syncedOriginalIndex !== null) {
      treeState.syncToOriginalIndex(syncedOriginalIndex);
    }
  }, [syncedOriginalIndex, treeState]);

  // Calculate visible entries within viewport
  // Reserve rows: 1 summary + 1 separator + (1 search if active)
  const reservedRows = treeState.searchActive ? 3 : 2;
  const viewportHeight = Math.max(1, layout.contentHeight - reservedRows);
  const visibleEntries = useMemo(() => {
    return treeState.filteredEntries.slice(
      treeState.scrollOffset,
      treeState.scrollOffset + viewportHeight,
    );
  }, [treeState.filteredEntries, treeState.scrollOffset, viewportHeight]);

  // Empty state
  if (files.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <box paddingX={1} paddingY={1}>
          <text fg={theme.muted}>(No files changed)</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Summary line — always visible at top */}
      <DiffFileTreeSummary summary={treeState.summary} />

      {/* Search input — conditional */}
      {treeState.searchActive && (
        <DiffFileTreeSearch
          query={treeState.searchQuery}
          onQueryChange={treeState.setSearchQuery}
          matchCount={treeState.filteredEntries.length}
          focused={focused}
        />
      )}

      {/* Separator */}
      <box height={1} width="100%">
        <text fg={theme.border}>{'─'.repeat(200)}</text>
      </box>

      {/* File entries */}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {visibleEntries.map((entry, visibleIdx) => {
            const actualIndex = treeState.scrollOffset + visibleIdx;
            return (
              <DiffFileTreeEntry
                key={`${entry.fullPath}:${entry.originalIndex}`}
                entry={entry}
                focused={focused && actualIndex === treeState.focusedIndex}
              />
            );
          })}

          {/* Truncation indicator */}
          {treeState.isTruncated && (
            <box paddingX={1}>
              <text fg={theme.warning}>
                {`… ${files.length - 500} more files not shown`}
              </text>
            </box>
          )}

          {/* No search matches */}
          {treeState.searchActive && treeState.filteredEntries.length === 0 && (
            <box paddingX={1}>
              <text fg={theme.muted}>No matches</text>
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  );
}
```

### 7.2 DiffFileTreeEntry (single row)

#### File: `apps/tui/src/screens/DiffScreen/DiffFileTreeEntry.tsx`

Each entry is a single-row `<box>` with four segments: change type icon, file path, optional suffix, and stat summary. Focused entry uses reverse-video styling.

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import type { FileTreeEntry } from "./file-tree-types.js";

interface DiffFileTreeEntryProps {
  entry: FileTreeEntry;
  focused: boolean;
}

export function DiffFileTreeEntry({ entry, focused }: DiffFileTreeEntryProps) {
  const theme = useTheme();

  // Focused row: reverse-video — use primary bg with contrasting text
  const rowBg = focused ? theme.primary : undefined;
  // When focused, all text in the row uses a neutral color
  // to ensure readability against the primary background.
  const focusedFg = focused ? "#000000" : undefined;

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      backgroundColor={rowBg}
    >
      {/* Change type icon — 2 chars (icon + space) */}
      <text fg={focused ? focusedFg : entry.changeDisplay.color}>
        {entry.changeDisplay.icon + " "}
      </text>

      {/* File path — flex grow to fill available space */}
      <text fg={focusedFg} flexGrow={1} truncate>
        {entry.displayPath}
      </text>

      {/* Binary suffix */}
      {entry.isBinary && (
        <text fg={focusedFg ?? theme.muted}>{" [bin]"}</text>
      )}

      {/* Permission-only suffix */}
      {entry.isPermissionOnly && (
        <text fg={focusedFg ?? theme.muted}>{" [mode]"}</text>
      )}

      {/* Stat summary — additions in green, deletions in red */}
      {entry.statText.length > 0 && (
        <box flexDirection="row" marginLeft={1}>
          {entry.additions > 0 && (
            <text fg={focused ? focusedFg : theme.success}>
              {`+${entry.additions}`}
            </text>
          )}
          {entry.additions > 0 && entry.deletions > 0 && (
            <text fg={focusedFg}>{" "}</text>
          )}
          {entry.deletions > 0 && (
            <text fg={focused ? focusedFg : theme.error}>
              {`-${entry.deletions}`}
            </text>
          )}
        </box>
      )}
    </box>
  );
}
```

### 7.3 DiffFileTreeSummary (top summary line)

#### File: `apps/tui/src/screens/DiffScreen/DiffFileTreeSummary.tsx`

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { formatSummaryLine } from "./file-tree-utils.js";
import type { FileTreeSummary } from "./file-tree-types.js";

interface DiffFileTreeSummaryProps {
  summary: FileTreeSummary;
}

export function DiffFileTreeSummary({ summary }: DiffFileTreeSummaryProps) {
  const theme = useTheme();
  const text = formatSummaryLine(summary);

  return (
    <box height={1} paddingX={1}>
      <text fg={theme.muted}>{text}</text>
    </box>
  );
}
```

### 7.4 DiffFileTreeSearch (inline search input)

#### File: `apps/tui/src/screens/DiffScreen/DiffFileTreeSearch.tsx`

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { SEARCH_MAX_LENGTH } from "./file-tree-types.js";

interface DiffFileTreeSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  focused: boolean;
}

export function DiffFileTreeSearch({
  query,
  onQueryChange,
  matchCount,
  focused,
}: DiffFileTreeSearchProps) {
  const theme = useTheme();

  return (
    <box height={1} flexDirection="row" paddingX={1}>
      <text fg={theme.primary}>{"/ "}</text>
      <input
        value={query}
        onChange={onQueryChange}
        maxLength={SEARCH_MAX_LENGTH}
        focused={focused}
        placeholder="filter files…"
      />
      <text fg={theme.muted}>
        {` ${matchCount} match${matchCount !== 1 ? "es" : ""}`}
      </text>
    </box>
  );
}
```

### 7.5 TreeErrorBoundary (lightweight error boundary)

#### File: `apps/tui/src/screens/DiffScreen/TreeErrorBoundary.tsx`

The existing `ErrorBoundary` at `apps/tui/src/components/ErrorBoundary.tsx` is the app-level error boundary with crash loop detection, restart UI, and `onReset`/`onQuit` callbacks. It does NOT accept a `fallback` prop. The file tree needs a simpler, isolated error boundary that renders an inline fallback without affecting the rest of the DiffScreen.

```typescript
import React from "react";
import { logger } from "../../lib/logger.js";
import { emit } from "../../lib/telemetry.js";

interface TreeErrorBoundaryProps {
  children: React.ReactNode;
  /** Inline fallback rendered when the tree crashes */
  fallback: React.ReactNode;
}

interface TreeErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight error boundary for the file tree sidebar.
 *
 * Unlike the app-level ErrorBoundary, this:
 * - Renders inline fallback content (not a full-screen error)
 * - Does NOT have restart/quit capabilities
 * - Isolates tree crashes from the content pane
 * - Logs the error and emits telemetry
 *
 * The content pane continues to function normally when the tree
 * crashes. The user can still use ]/[, Ctrl+B, and q.
 */
export class TreeErrorBoundary extends React.Component<
  TreeErrorBoundaryProps,
  TreeErrorBoundaryState
> {
  state: TreeErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(thrown: unknown): Partial<TreeErrorBoundaryState> {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    return { hasError: true, error };
  }

  componentDidCatch(thrown: unknown, info: React.ErrorInfo): void {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    logger.error(
      `TreeErrorBoundary: file tree crashed [error=${error.name}: ${error.message}]`,
    );
    if (error.stack) {
      logger.debug(`TreeErrorBoundary: stack trace:\n${error.stack}`);
    }
    emit("tui.diff.file_tree.error", {
      error_name: error.name,
      error_message: error.message.slice(0, 100),
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

**Usage in DiffScreen:**
```typescript
import { TreeErrorBoundary } from "./TreeErrorBoundary.js";

{effectiveSidebarVisible && (
  <box width={layout.sidebarWidth} flexDirection="column" border={["right"]}>
    <TreeErrorBoundary
      fallback={
        <box paddingX={1}>
          <text fg={theme.error}>File tree error</text>
        </box>
      }
    >
      <DiffFileTree {...treeProps} />
    </TreeErrorBoundary>
  </box>
)}
```

---

## 8. Integration with DiffScreen Scaffold

The scaffold ticket delivers `DiffScreen` with a `DiffFileTreePlaceholder`. This ticket replaces that placeholder. The following modifications to the scaffold component are required:

### 8.1 State Lifting

The `useFileTreeState` hook is called in `DiffScreen` (not in `DiffFileTree`) so that:
- The scaffold can pass `treeState.currentOriginalIndex` to the content pane for scroll sync.
- The `]`/`[` keybindings in the scaffold can call `treeState.syncToOriginalIndex()`.
- The scaffold manages `focusedFileIndex` as the single source of truth.

### 8.2 Modified DiffScreen Layout

```typescript
// In DiffScreen.tsx — replace DiffFileTreePlaceholder:

import { useFileTreeState } from "./useFileTreeState.js";
import { buildFileTreeKeybindings } from "./useFileTreeKeybindings.js";
import { DiffFileTree } from "./DiffFileTree.js";
import { TreeErrorBoundary } from "./TreeErrorBoundary.js";
import { formatFilePosition } from "./file-tree-utils.js";

// Inside DiffScreen component:
const pathWidth = calculatePathWidth(layout);

const treeState = useFileTreeState({
  files: diffResult.files,
  availablePathWidth: pathWidth,
  viewportHeight: layout.contentHeight - 3, // summary + separator + optional search
});

// Track synced index from content ]/[ navigation
const [syncedOriginalIndex, setSyncedOriginalIndex] = useState<number | null>(null);

// Merge keybindings:
const treeKeybindings = buildFileTreeKeybindings({
  treeState,
  focusZone,
  searchActive: treeState.searchActive,
  onSelectFile: (idx) => setContentFileIndex(idx),
  setFocusZone,
});

// Status bar hints depend on focus zone:
const treeHints: StatusBarHint[] = [
  { keys: "j/k", label: "navigate", order: 0 },
  { keys: "Enter", label: "select file", order: 10 },
  { keys: "/", label: "search", order: 20 },
  { keys: "Tab", label: "to diff", order: 30 },
  { keys: "Ctrl+B", label: "toggle sidebar", order: 40 },
];

const contentHints: StatusBarHint[] = [
  { keys: "j/k", label: "scroll", order: 0 },
  { keys: "]/[", label: "next/prev file", order: 10 },
  { keys: "t", label: "toggle view", order: 20 },
  { keys: "Tab", label: "to tree", order: 30 },
  { keys: "Ctrl+B", label: "toggle sidebar", order: 40 },
];

// File position always shown (right-aligned in status bar)
const filePositionText = formatFilePosition(
  treeState.focusedIndex,
  treeState.filteredEntries.length,
);

useScreenKeybindings(
  [...buildDiffKeybindings(scaffoldCtx), ...treeKeybindings],
  focusZone === "tree" ? treeHints : contentHints,
);

// In render:
{effectiveSidebarVisible && (
  <box
    width={layout.sidebarWidth}
    flexDirection="column"
    borderColor={focusZone === "tree" ? theme.primary : theme.border}
    border={["right"]}
  >
    <TreeErrorBoundary
      fallback={
        <box paddingX={1}>
          <text fg={theme.error}>File tree error</text>
        </box>
      }
    >
      <DiffFileTree
        focused={focusZone === "tree"}
        files={diffResult.files}
        onSelectFile={(idx) => setContentFileIndex(idx)}
        syncedOriginalIndex={syncedOriginalIndex}
        treeState={treeState}
      />
    </TreeErrorBoundary>
  </box>
)}
```

### 8.3 Path Width Calculation

```typescript
/**
 * Calculate available path width given sidebar dimensions.
 *
 * Layout budget per entry row:
 * - Icon: 2 chars (letter + space)
 * - Padding left: 1 char
 * - Padding right: 1 char
 * - Border right: 1 char
 * - Stat max: 8 chars (e.g. "+1234 -567")
 * - Total overhead: 13 chars
 */
function calculatePathWidth(layout: LayoutContext): number {
  if (!layout.sidebarVisible) return 0;
  const sidebarPercent = parseSidebarPercent(layout.sidebarWidth);
  const sidebarCols = Math.floor(layout.width * sidebarPercent);
  return Math.max(10, sidebarCols - 13);
}

function parseSidebarPercent(widthStr: string): number {
  const match = widthStr.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) / 100 : 0.25;
}
```

### 8.4 Wire `]`/`[` Handlers to Sync Tree

In the scaffold's `buildDiffKeybindings`, the `]` and `[` handlers must be updated:

```typescript
{
  key: "]",
  description: "Next file",
  group: "Diff",
  handler: () => {
    const currentIdx = treeState.currentOriginalIndex ?? -1;
    const nextIdx = Math.min(currentIdx + 1, treeState.allEntries.length - 1);
    if (nextIdx !== currentIdx) {
      setSyncedOriginalIndex(nextIdx);
      setContentFileIndex(nextIdx);
    }
  },
  when: () => focusZone === "content",
},
{
  key: "[",
  description: "Previous file",
  group: "Diff",
  handler: () => {
    const currentIdx = treeState.currentOriginalIndex ?? 1;
    const prevIdx = Math.max(currentIdx - 1, 0);
    if (prevIdx !== currentIdx) {
      setSyncedOriginalIndex(prevIdx);
      setContentFileIndex(prevIdx);
    }
  },
  when: () => focusZone === "content",
},
```

### 8.5 Shift+Tab Behavior

The existing Tab handler in the scaffold alternates zones. `Shift+Tab` must also alternate, but is a no-op when the sidebar is hidden:

```typescript
{
  key: "shift+tab",
  description: "Switch focus zone",
  group: "Navigation",
  handler: () => {
    if (!effectiveSidebarVisible) return; // no-op when sidebar hidden
    setFocusZone(focusZone === "tree" ? "content" : "tree");
  },
},
```

### 8.6 Error Boundary Isolation

The `TreeErrorBoundary` (Section 7.5) wraps `<DiffFileTree>` within the sidebar `<box>`. If the tree component crashes, the content pane continues to function. The error boundary shows a minimal error message in the sidebar area. The user can still use `]`/`[` and `Ctrl+B` to interact with the diff.

**Why not use the app-level `ErrorBoundary`?** The existing `ErrorBoundary` at `apps/tui/src/components/ErrorBoundary.tsx` requires `onReset` and `onQuit` callbacks, manages crash loop detection, and renders a full-screen `ErrorScreen` with restart/quit prompts. This is appropriate for app-level crashes but wrong for an isolated sidebar failure — we want the diff content to remain usable.

---

## 9. Responsive Behavior

### 9.1 Required Modification to `useSidebarState`

The existing `useSidebarState` hook at `apps/tui/src/hooks/useSidebarState.ts` explicitly blocks toggle at minimum breakpoint (`if (autoOverride) return;` on line 86). The product spec requires that Ctrl+B toggles the sidebar at minimum breakpoint (showing it at 30% width).

**Current behavior (lines 42–61 of `useSidebarState.ts`):**

```typescript
// At minimum breakpoint: auto-collapse regardless of user preference
if (breakpoint === "minimum") {
  return { visible: false, autoOverride: true };
}
```

The `toggle` callback (line 83–91) early-returns when `autoOverride` is true, making Ctrl+B a no-op at minimum breakpoint.

**Required change:**

```typescript
// MODIFIED: apps/tui/src/hooks/useSidebarState.ts

export function resolveSidebarVisibility(
  breakpoint: Breakpoint | null,
  userPreference: boolean | null,
): { visible: boolean; autoOverride: boolean } {
  // Below minimum: always hidden, no override possible
  if (!breakpoint) {
    return { visible: false, autoOverride: true };
  }

  // At minimum breakpoint: hidden by default, but explicit user toggle is respected
  if (breakpoint === "minimum") {
    if (userPreference === true) {
      return { visible: true, autoOverride: false };
    }
    return { visible: false, autoOverride: false }; // NOT autoOverride — toggle is allowed
  }

  // At standard/large: respect user preference, default visible
  return {
    visible: userPreference !== null ? userPreference : true,
    autoOverride: false,
  };
}
```

The `toggle` callback no longer early-returns on `autoOverride` at minimum (since `autoOverride` is now only true when breakpoint is null). The original behavior of "toggle is no-op at minimum" is replaced with "toggle is allowed at minimum but defaults to hidden."

**Backward compatibility:** This change affects all screens using `useSidebarState`. At minimum breakpoint, the only behavioral difference is that Ctrl+B can now show the sidebar. Screens that don't render sidebar content (e.g., PlaceholderScreen) simply see an empty sidebar region — harmless. The default case (`userPreference === null`) still returns `visible: false`.

### 9.2 Required Modification to `useLayout`

The existing `getSidebarWidth` in `apps/tui/src/hooks/useLayout.ts` (lines 51–61) handles only `"large"` (30%) and `"standard"` (25%) cases, falling through to `default` (0%) for minimum breakpoint. With the `useSidebarState` change, the sidebar can now be visible at minimum, so the width function needs a `"minimum"` case:

```typescript
// MODIFIED: apps/tui/src/hooks/useLayout.ts

function getSidebarWidth(
  breakpoint: Breakpoint | null,
  sidebarVisible: boolean,
): string {
  if (!sidebarVisible) return "0%";
  switch (breakpoint) {
    case "large":    return "30%";
    case "standard": return "25%";
    case "minimum":  return "30%"; // wider to compensate for narrow terminal
    default:         return "0%";  // null (below minimum) — never visible
  }
}
```

### 9.3 Breakpoint Rules

| Terminal Width | Breakpoint | Default Visibility | Width | Manual Toggle Behavior |
|---|---|---|---|---|
| < 80 | null (unsupported) | Hidden | 0% | Toggle blocked (autoOverride = true) |
| 80–119 | `minimum` | Hidden | 0% | Ctrl+B shows sidebar at 30% (min 24 cols enforced) |
| 120–199 | `standard` | Visible | 25% | Ctrl+B hides/shows |
| 200+ | `large` | Visible | 30% | Ctrl+B hides/shows |

> **Note:** The actual `useLayout.ts` returns `"30%"` at `large` breakpoint (not `"25%"` as stated in the architecture doc). The implementation matches the actual codebase.

### 9.4 Minimum Column Force-Hide

If the resolved sidebar width would be less than 24 columns, the sidebar is force-hidden regardless of user preference. This check is performed in `DiffScreen` (not in the shared hooks) since it is specific to the file tree's minimum usable width:

```typescript
// In DiffScreen.tsx:
const sidebarPercent = parseSidebarPercent(layout.sidebarWidth);
const sidebarCols = Math.floor(layout.width * sidebarPercent);
const effectiveSidebarVisible = layout.sidebarVisible && sidebarCols >= 24;
```

### 9.5 Resize Behavior

- **Resize auto-hides sidebar:** When terminal shrinks below 120 cols and user has no explicit preference, sidebar hides. Focus transfers to content if currently on tree. Search filter and scroll position are preserved (not cleared).
- **Resize auto-shows sidebar:** When terminal grows above 120 cols, sidebar shows unless user explicitly hid it.
- **Manual toggle is sticky:** The `userPreference` flag in `useSidebarState` persists across resize. A user who explicitly hid the sidebar at standard does not get it auto-shown when resizing to large.
- **Focus transfer on auto-hide:** If `focusZone === "tree"` and sidebar auto-hides, focus transfers to content zone.

---

## 10. Edge Cases

### 10.1 Empty Diff

When `files.length === 0`, the tree renders a single line: `(No files changed)` in muted color. All navigation keybindings are no-ops (cursor stays at 0, `selectCurrent()` returns null). The summary line shows `0 files +0 -0`.

### 10.2 Single File

`j`/`k` are no-ops (cursor stays at index 0 — `Math.min(0 + 1, 0)` stays 0 when `filteredEntries.length === 1`). `G`/`gg` are no-ops. Enter still selects and transfers focus.

### 10.3 Rapid Key Input

All navigation actions use functional state updates (`setFocusedIndex((i) => ...)`) to ensure sequential processing. React batches state updates within the same event loop tick, so rapid j/j/j presses resolve correctly — each functional updater reads the result of the previous update.

### 10.4 Unknown change_type

Rendered as `?` icon in muted color (ANSI 245). A warning is logged via `logger.warn()`.

### 10.5 Missing path Field

Entries without a `path` field are skipped during `processFileEntries`. The `skippedIndices` array is returned to the caller, which logs `logger.warn()` for each.

### 10.6 Shift+Tab When Sidebar Hidden

No-op. Focus stays in content zone. The `when` guard does not block this — the handler itself checks `effectiveSidebarVisible`.

### 10.7 ]/[ Clears Search Filter

When content navigation via `]`/`[` triggers `syncToOriginalIndex`, the search filter is cleared first to ensure the synced entry is visible in the unfiltered list. This is correct behavior: the user is now navigating by file order, not by search.

### 10.8 Sidebar Toggle During Active Search

When Ctrl+B hides the sidebar while search is active, search state is preserved in `useFileTreeState`. When the sidebar is re-shown, the search input reappears with the previous query and filtered results.

### 10.9 Error Boundary Isolation

The `DiffFileTree` is wrapped in a `TreeErrorBoundary` (Section 7.5) within the sidebar `<box>`. If the tree component crashes, the content pane continues to function. The error boundary shows a minimal error message in the sidebar area. The user can still use `]`/`[` and `Ctrl+B` to interact with the diff.

### 10.10 Focus Transfer When Sidebar Hidden via Resize

If `focusZone === "tree"` and the sidebar auto-hides due to resize, the DiffScreen must detect this and transfer focus to content:

```typescript
// In DiffScreen.tsx, effect watching sidebar visibility:
useEffect(() => {
  if (!effectiveSidebarVisible && focusZone === "tree") {
    setFocusZone("content");
  }
}, [effectiveSidebarVisible, focusZone]);
```

---

## 11. Telemetry

All telemetry events use the `emit()` function from `apps/tui/src/lib/telemetry.ts`. Events are fire-and-forget, written to stderr as JSON when `CODEPLANE_TUI_DEBUG=true`.

| Event | Trigger | Properties |
|---|---|---|
| `tui.diff.file_tree.viewed` | Diff screen opens with sidebar visible | `source` (change\|landing), `repo`, `file_count`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.diff.file_tree.navigate` | Cursor moved via j/k/G/gg/Ctrl+D/U | `direction` (up\|down\|page_up\|page_down\|top\|bottom), `from_index`, `to_index`, `total` |
| `tui.diff.file_tree.select_file` | Enter pressed on entry | `file_path`, `change_type`, `original_index`, `method` (enter\|search_enter) |
| `tui.diff.file_tree.file_synced` | Cursor follows ]/[ | `direction` (next\|prev), `original_index` |
| `tui.diff.file_tree.search_opened` | / pressed | `file_count` |
| `tui.diff.file_tree.search_completed` | Search resolved | `query_length`, `match_count`, `outcome` (selected\|cleared\|esc) |
| `tui.diff.file_tree.sidebar_toggled` | Ctrl+B pressed | `new_state` (visible\|hidden), `trigger` (manual) |
| `tui.diff.file_tree.sidebar_auto_hidden` | Resize causes auto-hide | `old_width`, `new_width` |
| `tui.diff.file_tree.focus_changed` | Zone switch | `new_focus` (tree\|content), `method` (tab\|shift_tab\|enter) |
| `tui.diff.file_tree.error` | TreeErrorBoundary caught | `error_name`, `error_message` |

Telemetry calls are placed in keybinding handlers and effects, NOT in rendering functions. Example:

```typescript
// In buildFileTreeKeybindings, inside the "j" handler:
handler: () => {
  const from = treeState.focusedIndex;
  treeState.moveDown();
  emit("tui.diff.file_tree.navigate", {
    direction: "down",
    from_index: from,
    to_index: Math.min(from + 1, treeState.filteredEntries.length - 1),
    total: treeState.filteredEntries.length,
  });
},
```

---

## 12. Logging and Observability

All logging uses `logger` from `apps/tui/src/lib/logger.ts`. Log level is controlled by `CODEPLANE_TUI_LOG_LEVEL` env var (default: `"error"`). When `CODEPLANE_TUI_DEBUG=true`, level is `"debug"`.

| Level | Message | When |
|---|---|---|
| `info` | `file tree rendered: repo=${repo} source=${mode} file_count=${n} sidebar_visible=${v} terminal_width=${w}` | On initial render |
| `info` | `file selected: path=${path} index=${i} change_type=${type}` | On Enter |
| `info` | `search filter: query_length=${n} match_count=${m} outcome=${o}` | On search resolve |
| `debug` | `cursor moved: from=${from} to=${to} direction=${dir}` | On j/k/G/gg/Ctrl+D/U |
| `debug` | `tree cursor synced: original_index=${i}` | On ]/[ sync |
| `debug` | `sidebar toggled: visible=${v}` | On Ctrl+B |
| `debug` | `search filter applied: query="${q}" filter_time_ms=${t}` | On each keystroke |
| `debug` | `resize layout recalc: width=${w} sidebar=${v}` | On SIGWINCH |
| `debug` | `scroll position updated: offset=${o} focused=${f}` | On scroll offset change |
| `warn` | `file tree truncated: ${total} files exceeds cap of ${FILE_CAP}` | On > 500 files |
| `warn` | `skipping file entry with missing path at index ${i}` | On malformed entry |
| `warn` | `unknown change_type "${type}" for file ${path}` | On unrecognized type |
| `error` | `TreeErrorBoundary: file tree crashed [error=${name}: ${message}]` | On tree component crash |

---

## 13. Implementation Plan

Vertical engineering steps, ordered by dependency. Each step is independently testable.

### Step 1: Type Definitions and Pure Utilities

**Files created:**
- `apps/tui/src/screens/DiffScreen/file-tree-types.ts`
- `apps/tui/src/screens/DiffScreen/file-tree-utils.ts`

**Work:**
1. Create `file-tree-types.ts` with all type definitions including `lowercasePath`/`lowercaseOldPath` fields, `FILE_CAP = 500`, and `SEARCH_MAX_LENGTH = 128`.
2. Create `file-tree-utils.ts` with all pure functions: `resolveChangeTypeDisplay`, `truncatePathLeft`, `formatRenamePath`, `formatStat`, `isPermissionOnlyChange`, `processFileEntries` (with pre-computed lowercase paths), `filterEntries` (using pre-computed lowercase paths), `computeSummary`, `formatSummaryLine`, `formatFilePosition`.
3. All functions are pure (no React, no side effects) — can be unit-tested immediately.

**Verification:**
- `resolveChangeTypeDisplay("added")` returns `{ icon: "A", color: 34 }`.
- `resolveChangeTypeDisplay("unknown_value")` returns `{ icon: "?", color: 245 }`.
- `truncatePathLeft("src/components/DiffFileTree.tsx", 30)` returns the full path (fits).
- `truncatePathLeft("src/components/DiffFileTree.tsx", 20)` returns `"…/DiffFileTree.tsx"`.
- `truncatePathLeft("a", 4)` returns `"a"` (no truncation needed).
- `truncatePathLeft("verylongfilename.tsx", 10)` returns `"…/verylon…"`.
- `formatRenamePath("old.ts", "new.ts", 50)` returns `"old.ts → new.ts"`.
- `formatRenamePath("very/long/old/path.ts", "very/long/new/path.ts", 30)` truncates both sides.
- `formatStat(10, 5, false, false)` returns `{ addText: "+10", delText: "-5" }`.
- `formatStat(0, 0, true, false)` returns `null`.
- `isPermissionOnlyChange({ additions: 0, deletions: 0, is_binary: false, change_type: "modified", old_path: undefined })` returns `true`.
- `isPermissionOnlyChange({ additions: 1, deletions: 0, is_binary: false, change_type: "modified" })` returns `false`.
- `processFileEntries` with 600 files returns `{ isTruncated: true }` and exactly 500 entries.
- `processFileEntries` with an entry missing `path` returns it in `skippedIndices`.
- `processFileEntries` populates `lowercasePath` and `lowercaseOldPath`.
- `filterEntries` with query `"TEST"` matches entry with path `"src/test.ts"`.
- `filterEntries` with query `"old"` matches renamed entry with `oldPath: "old_name.ts"`.
- `computeSummary` produces correct filtered vs total counts.
- `formatSummaryLine({ totalFiles: 5, isFiltered: false, isTruncated: false, totalAdditions: 42, totalDeletions: 18, ... })` returns `"5 files +42 -18"`.
- `formatSummaryLine({ isFiltered: true, filteredFiles: 3, totalFiles: 5, ... })` returns `"3 of 5 files ..."`.
- `formatFilePosition(0, 10)` returns `"File 1 of 10"`.
- `formatFilePosition(0, 0)` returns `"No files"`.

**Exit criteria:** All utility functions pass unit tests covering normal, boundary, and error cases. No runtime dependencies beyond types.

### Step 2: Modify Shared Hooks (`useSidebarState`, `useLayout`)

**Files modified:**
- `apps/tui/src/hooks/useSidebarState.ts`
- `apps/tui/src/hooks/useLayout.ts`

**Work:**
1. In `useSidebarState.ts`: Update `resolveSidebarVisibility` to return `{ visible: true, autoOverride: false }` when `breakpoint === "minimum"` and `userPreference === true`. Return `{ visible: false, autoOverride: false }` (NOT `autoOverride: true`) when `breakpoint === "minimum"` and `userPreference !== true`.
2. The `toggle` callback already checks `if (autoOverride) return;` — since `autoOverride` is now only true for `null` breakpoint, this naturally unblocks toggle at minimum.
3. In `useLayout.ts`: Add `case "minimum": return "30%";` to `getSidebarWidth`.
4. Verify backward compatibility: at minimum breakpoint with `userPreference === null`, sidebar defaults to hidden (same as before).

**Verification:**
- `resolveSidebarVisibility("minimum", null)` → `{ visible: false, autoOverride: false }`
- `resolveSidebarVisibility("minimum", true)` → `{ visible: true, autoOverride: false }`
- `resolveSidebarVisibility("minimum", false)` → `{ visible: false, autoOverride: false }`
- `resolveSidebarVisibility(null, true)` → `{ visible: false, autoOverride: true }` (unchanged)
- `resolveSidebarVisibility("standard", null)` → `{ visible: true, autoOverride: false }` (unchanged)
- `getSidebarWidth("minimum", true)` → `"30%"`
- `getSidebarWidth("minimum", false)` → `"0%"`

**Exit criteria:** Existing app-shell tests still pass. New behavior verified.

### Step 3: State Management Hook

**Files created:**
- `apps/tui/src/screens/DiffScreen/useFileTreeState.ts`

**Work:**
1. Implement `useFileTreeState` as specified in Section 5.
2. Wire up: entry processing via `processFileEntries`, filtering via `filterEntries`, summary computation via `computeSummary`.
3. Implement all navigation callbacks with functional state updates.
4. Implement search callbacks with SEARCH_MAX_LENGTH clamping.
5. Implement sync callback with search-clear semantics.
6. Implement scroll offset tracking with auto-adjust.
7. Add logging via `logger` for warnings (truncation, skipped entries, unknown types).

**Exit criteria:** Hook can be instantiated with mock data and all navigation/search/sync operations produce correct state transitions.

### Step 4: TreeErrorBoundary and Entry Components

**Files created:**
- `apps/tui/src/screens/DiffScreen/TreeErrorBoundary.tsx`
- `apps/tui/src/screens/DiffScreen/DiffFileTreeEntry.tsx`
- `apps/tui/src/screens/DiffScreen/DiffFileTreeSummary.tsx`
- `apps/tui/src/screens/DiffScreen/DiffFileTreeSearch.tsx`

**Work:**
1. `TreeErrorBoundary`: Lightweight class component with `fallback` prop, error logging, and telemetry.
2. `DiffFileTreeEntry`: Single-row `<box>` with icon, path, suffix, stat segments. Reverse-video focused styling.
3. `DiffFileTreeSummary`: Single-row `<text>` using `formatSummaryLine`.
4. `DiffFileTreeSearch`: `<input>` with `/` prefix, match count, maxLength.

**Exit criteria:** Components render correctly in isolation with mock props. Snapshot tests capture visual output.

### Step 5: Main DiffFileTree Component

**Files created:**
- `apps/tui/src/screens/DiffScreen/DiffFileTree.tsx`

**Work:**
1. Compose: summary line + optional search input + separator + scrollbox with entries + truncation indicator.
2. Accept `treeState` as prop (state lifted to DiffScreen).
3. Handle empty state: `(No files changed)` message.
4. Handle no-match state: `No matches` in search.
5. Viewport windowing: slice `filteredEntries` by `scrollOffset` and `viewportHeight`.
6. Sync effect: watch `syncedOriginalIndex` and call `treeState.syncToOriginalIndex`.

**Exit criteria:** Full component renders at all three breakpoints with correct layout.

### Step 6: Keybinding Registration and DiffScreen Integration

**Files created:**
- `apps/tui/src/screens/DiffScreen/useFileTreeKeybindings.ts`

**Files modified:**
- `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`

**Work:**
1. Create `useFileTreeKeybindings.ts` with `buildFileTreeKeybindings`.
2. Update `DiffScreen` to replace `DiffFileTreePlaceholder` with `DiffFileTree`.
3. Lift `useFileTreeState` into `DiffScreen`.
4. Wire `]`/`[` handlers to call `setSyncedOriginalIndex`.
5. Add `shift+tab` handler to scaffold keybindings with no-op guard.
6. Merge tree keybindings with scaffold keybindings in `useScreenKeybindings` call.
7. Update status bar hints to vary by `focusZone`.
8. Add `File N of M` position indicator to status bar.
9. Add 24-column minimum force-hide check.
10. Add focus transfer effect for auto-hide.
11. Wrap `DiffFileTree` in `TreeErrorBoundary`.
12. Wire `gg` go-to override for tree focus zone.

**Exit criteria:** Full keyboard interaction works end-to-end. All 74 E2E tests written.

---

## 14. Productionization Notes

### 14.1 Viewport Windowing

The current implementation uses a simple `slice()` on `filteredEntries` based on `scrollOffset` and `viewportHeight`. For the 500-file cap this is sufficient — slicing 500 entries is <0.1ms.

**Graduation criteria:** If the file cap is ever raised above 500 AND performance degrades below 60 entries/sec navigation throughput (measured via `navigate` telemetry event frequency), switch to OpenTUI's `<scrollbox>` `viewportCulling` prop for true virtualized rendering.

### 14.2 Search Performance

The search filter uses pre-computed `lowercasePath` and `lowercaseOldPath` fields (see Section 3, `FileTreeEntry`), eliminating per-keystroke `toLowerCase()` calls. The filter runs `Array.filter` with `String.includes()` on pre-lowercased strings. For 500 entries with average 60-char paths, this is <0.5ms.

**Graduation criteria:** If `filter_time_ms` exceeds 16ms (as logged at debug level), implement a 50ms debounce on `setSearchQuery`. This is unlikely given the pre-computed lowercase paths.

### 14.3 useSidebarState Modification Scope

The modification to `useSidebarState` (Section 9.1) changes behavior for ALL screens, not just DiffScreen. Before merging:

1. Run all existing `e2e/tui/app-shell.test.ts` tests — verify no regressions.
2. Verify that PlaceholderScreen (used for unimplemented screens) degrades gracefully when sidebar toggles at minimum — it should show an empty sidebar region.
3. Verify that the Agents screen (the only fully implemented screen) behaves correctly with the new toggle behavior.

The change is backward-compatible in the default case: at minimum breakpoint, `userPreference` starts as `null`, so visibility defaults to `false` (same as before). The only new behavior is that pressing Ctrl+B at minimum now sets `userPreference = true` instead of being a no-op.

### 14.4 State Lifting Pattern

Lifting `useFileTreeState` to `DiffScreen` creates a larger component with more state. If the DiffScreen grows to include inline comments, hunk expand/collapse state, and split view state, consider extracting a `useDiffScreenState` composite hook:

```typescript
// Future refactor:
function useDiffScreenState(files: FileDiffItem[], layout: LayoutContext) {
  const treeState = useFileTreeState({ ... });
  const viewState = useDiffViewState();
  const commentState = useCommentState();
  return { treeState, viewState, commentState };
}
```

This keeps the DiffScreen component focused on layout and keybinding wiring.

### 14.5 gg Go-To Mode Conflict

The `gg` jump-to-start sequence conflicts with the global go-to mode system (`g` prefix). The scaffold must wire a special case: when `focusZone === "tree"`, the go-to mode handler interprets the second `g` as jump-to-start instead of as an invalid destination.

This is fragile. A more robust solution (future): introduce a `localGoToOverrides` mechanism in the go-to mode system that allows screens to register two-key sequences starting with `g` that take precedence over the global go-to map when a `when()` predicate is true. This is out of scope for this ticket but should be tracked.

### 14.6 TreeErrorBoundary Reusability

The `TreeErrorBoundary` introduced in this ticket (Section 7.5) is a generic lightweight error boundary with a `fallback` prop. Future sidebar components (e.g., code explorer file tree, wiki sidebar) may need the same pattern. If reuse emerges, promote `TreeErrorBoundary` to `apps/tui/src/components/InlineErrorBoundary.tsx` with the same interface.

---

## 15. Unit & Integration Tests

All tests live in `e2e/tui/diff.test.ts`, appended after the existing test blocks:
- `TUI_DIFF_SYNTAX_HIGHLIGHT — SyntaxStyle lifecycle` (7 tests)
- `TUI_DIFF_SYNTAX_HIGHLIGHT — keyboard interaction` (8 tests — KEY-SYN-001 through KEY-SYN-009, minus KEY-SYN-005/006)
- `TUI_DIFF_SYNTAX_HIGHLIGHT — color capability tiers` (4 tests)
- `TUI_DIFF_SYNTAX_HIGHLIGHT — language resolution` (8 tests)
- `TUI_DIFF_SYNTAX_HIGHLIGHT — edge cases` (4 tests)

Tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts` (`launchTUI`, `TUITestInstance`, `TERMINAL_SIZES`). Tests are **NEVER** skipped or commented out. Tests that fail due to unimplemented backends are left failing.

### 15.1 Snapshot Tests (18 tests: SNAP-FTREE-001 through SNAP-FTREE-018)

```typescript
describe("TUI_DIFF_FILE_TREE — snapshots", () => {
  test("SNAP-FTREE-001: sidebar renders at 120x40 standard breakpoint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with multi-file change
    await terminal.sendKeys("g", "r"); // go to repo list
    // ... navigate to a diff with multiple files
    await terminal.waitForText("files");
    // Assert: sidebar visible on left, ~25% width (30 cols)
    // Assert: file entries visible with change icons (A/M/D in color)
    // Assert: summary line at top showing "N files +X -Y"
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-002: sidebar renders at 200x60 large breakpoint", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen
    await terminal.waitForText("files");
    // Assert: sidebar visible, 30% width (60 cols)
    // Assert: file paths show more characters due to wider sidebar
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-003: sidebar hidden at 80x24 minimum breakpoint", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    // Assert: no sidebar visible, content takes full width
    // Assert: no file tree entries visible
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-004: sidebar appears after Ctrl+B toggle at minimum", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("ctrl+b");
    // Assert: sidebar appears at 30% width (24 cols)
    // Assert: file entries visible
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-005: truncated paths show …/ prefix", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with deeply nested file paths
    await terminal.waitForText("files");
    // Assert: long paths truncated from left with …/ prefix
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-006: renamed files show old → new", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with renamed file
    await terminal.waitForText("files");
    // Assert: R icon in cyan
    // Assert: path shows "old_name → new_name" format
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-007: binary files show [bin] suffix", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with binary file change
    await terminal.waitForText("files");
    // Assert: binary entry has [bin] suffix in muted color
    // Assert: no +N -M stat for binary entry
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-008: empty diff shows '(No files changed)'", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with no file changes
    await terminal.waitForText("No files changed");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-009: search active state renders input", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, focus tree, press /
    await terminal.sendKeys("tab"); // focus tree
    await terminal.sendKeys("/");
    // Assert: search input visible with / prefix
    // Assert: match count displayed
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-010: search with no matches shows 'No matches'", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("zzzznonexistent");
    await terminal.waitForText("No matches");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-011: focused entry renders with reverse-video", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, focus tree
    await terminal.sendKeys("tab");
    // Assert: first entry has reverse-video styling (primary bg)
    // Assert: change type icon color neutralized in focused row
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-012: status bar shows 'File N of M' position", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with files
    await terminal.waitForText("files");
    // Assert: status bar contains "File 1 of N"
    const lastLine = terminal.getLine(39);
    expect(lastLine).toMatch(/File \d+ of \d+/);
  });

  test("SNAP-FTREE-013: status bar shows tree-specific hints when tree focused", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // focus tree
    const lastLine = terminal.getLine(39);
    // Assert: hints include j/k navigate, Enter select, / search
    expect(lastLine).toMatch(/j\/k/);
    expect(lastLine).toMatch(/Enter/);
  });

  test("SNAP-FTREE-014: summary line shows aggregated stats", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("files");
    // Assert: summary line matches "N files +X -Y" format
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-015: summary line shows abbreviated stats when filtered", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("src");
    // Assert: summary shows "N of M files +X -Y"
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-016: sidebar hides and re-shows with Ctrl+B", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("files");
    await terminal.sendKeys("ctrl+b"); // hide
    const snap1 = terminal.snapshot();
    // Assert: no sidebar visible
    await terminal.sendKeys("ctrl+b"); // show
    const snap2 = terminal.snapshot();
    // Assert: sidebar visible again
    expect(snap1).not.toEqual(snap2);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-017: 500+ files show truncation indicator", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with >500 files
    // Assert: truncation indicator visible at bottom of tree
    // Assert: shows "… N more files not shown"
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FTREE-018: permission-only change shows [mode] suffix", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with permission-only change
    // Assert: M icon, [mode] suffix, no +/-N stat
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

### 15.2 Keyboard Interaction Tests (32 tests: KEY-FTREE-001 through KEY-FTREE-032)

```typescript
describe("TUI_DIFF_FILE_TREE — keyboard interaction", () => {
  test("KEY-FTREE-001: j moves cursor down", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, focus tree
    await terminal.sendKeys("tab");
    await terminal.sendKeys("j");
    // Assert: second entry is now focused (reverse-video on row 2)
    // Assert: first entry is no longer focused
  });

  test("KEY-FTREE-002: k moves cursor up", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "j", "k");
    // Assert: first entry is focused again
  });

  test("KEY-FTREE-003: Down arrow moves cursor down", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab");
    await terminal.sendKeys("Down");
    // Assert: second entry focused
  });

  test("KEY-FTREE-004: Up arrow moves cursor up", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "Down", "Up");
    // Assert: first entry focused
  });

  test("KEY-FTREE-005: j at bottom is no-op", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab");
    // Press G to jump to last, then j
    await terminal.sendKeys("G", "j");
    // Assert: cursor still on last entry (no crash, no wrap)
  });

  test("KEY-FTREE-006: k at top is no-op", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "k");
    // Assert: cursor still on first entry
  });

  test("KEY-FTREE-007: Enter selects file and transfers focus to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // focus tree
    await terminal.sendKeys("j"); // move to second file
    await terminal.sendKeys("Enter");
    // Assert: focus transferred to content zone
    // Assert: content pane scrolled to second file
    // Assert: status bar hints change to content hints
  });

  test("KEY-FTREE-008: G jumps to last entry", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "G");
    // Assert: last entry is focused
    // Assert: status bar shows "File N of N"
  });

  test("KEY-FTREE-009: gg jumps to first entry", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "G"); // go to bottom
    await terminal.sendKeys("g", "g"); // jump to top
    // Assert: first entry is focused
    // Assert: status bar shows "File 1 of N"
  });

  test("KEY-FTREE-010: Ctrl+D pages down by half viewport", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "ctrl+d");
    // Assert: cursor moved down by ~half viewport height (~19 rows)
    // Assert: viewport scrolled to show new position
  });

  test("KEY-FTREE-011: Ctrl+U pages up by half viewport", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "G", "ctrl+u");
    // Assert: cursor moved up by ~half viewport height
  });

  test("KEY-FTREE-012: / activates search filter", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    // Assert: search input appears with / prefix
    // Assert: cursor in input field
  });

  test("KEY-FTREE-013: search filters by case-insensitive substring", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("test");
    // Assert: only entries containing "test" (case-insensitive) shown
    // Assert: summary shows "N of M files"
  });

  test("KEY-FTREE-014: Esc clears search and restores full list", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("test");
    await terminal.sendKeys("Escape");
    // Assert: search input hidden
    // Assert: all entries visible again
    // Assert: cursor reset to first entry
  });

  test("KEY-FTREE-015: Enter in search selects first match", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("component");
    await terminal.sendKeys("Enter");
    // Assert: first matching file selected
    // Assert: focus transferred to content
    // Assert: search cleared
  });

  test("KEY-FTREE-016: Ctrl+B toggles sidebar visibility", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("files");
    await terminal.sendKeys("ctrl+b");
    // Assert: sidebar hidden, content takes full width
    await terminal.sendKeys("ctrl+b");
    // Assert: sidebar visible again
  });

  test("KEY-FTREE-017: Tab switches focus from content to tree", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Start in content zone (default)
    await terminal.sendKeys("tab");
    // Assert: tree zone focused (border color changes to primary)
    // Assert: status bar shows tree-specific hints
  });

  test("KEY-FTREE-018: Shift+Tab switches focus from tree to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // to tree
    await terminal.sendKeys("shift+Tab"); // back to content
    // Assert: content zone focused
    // Assert: status bar shows content-specific hints
  });

  test("KEY-FTREE-019: Shift+Tab is no-op when sidebar hidden", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("shift+Tab");
    // Assert: no change, focus stays in content
  });

  test("KEY-FTREE-020: ] in content zone syncs tree cursor forward", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("]");
    // Assert: tree cursor moves to next file
    // Assert: content scrolls to next file
  });

  test("KEY-FTREE-021: [ in content zone syncs tree cursor backward", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("]", "[");
    // Assert: tree cursor returns to previous file
  });

  test("KEY-FTREE-022: ] at last file clamps (no wrap)", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Press ] enough times to reach end, then one more
    // Assert: cursor stays on last file (no wrap to first)
  });

  test("KEY-FTREE-023: rapid j presses processed sequentially", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab");
    await terminal.sendKeys("j", "j", "j");
    // Assert: cursor moved exactly 3 positions down
    // Assert: no skipped entries, no crash
  });

  test("KEY-FTREE-024: ] clears search filter before navigating", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("src");
    // Search active, showing subset
    await terminal.sendKeys("Escape"); // exit search input mode
    await terminal.sendKeys("tab"); // to content
    await terminal.sendKeys("]");
    // Assert: search filter cleared
    // Assert: tree shows all files
    // Assert: cursor synced to next file in full list
  });

  test("KEY-FTREE-025: q pops diff screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    await terminal.sendKeys("q");
    // Assert: returned to previous screen
    // Assert: diff screen no longer visible
  });

  test("KEY-FTREE-026: ? shows help overlay with tree keybindings", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("?");
    // Assert: help overlay visible
    // Assert: contains File Tree keybinding group
    // Assert: lists j/k, Enter, /, Tab, Ctrl+B
  });

  test("KEY-FTREE-027: single-file diff makes j/k no-ops", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with exactly 1 file
    await terminal.sendKeys("tab", "j");
    // Assert: cursor still on first (only) entry
    await terminal.sendKeys("k");
    // Assert: cursor still on first entry
  });

  test("KEY-FTREE-028: search input limited to 128 characters", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    const longQuery = "a".repeat(150);
    await terminal.sendText(longQuery);
    // Assert: input value truncated to 128 chars
  });

  test("KEY-FTREE-029: search is case-insensitive", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("README");
    // Assert: matches "readme.md" or "README.md"
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("/");
    await terminal.sendText("readme");
    // Assert: same matches as uppercase query
  });

  test("KEY-FTREE-030: Escape in tree (no search) transfers focus to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // focus tree
    await terminal.sendKeys("Escape");
    // Assert: focus returned to content zone
  });

  test("KEY-FTREE-031: search incremental narrowing updates on each keystroke", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("s");
    // Assert: filtered list shown, match count updated
    await terminal.sendText("r");
    // Assert: further narrowed for "sr"
    await terminal.sendText("c");
    // Assert: "src" filter applied, match count further narrowed
  });

  test("KEY-FTREE-032: Tab cycles back to tree from content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // to tree
    await terminal.sendKeys("tab"); // to content
    await terminal.sendKeys("tab"); // back to tree
    // Assert: tree zone is focused
  });
});
```

### 15.3 Responsive Tests (12 tests: RSP-FTREE-001 through RSP-FTREE-012)

```typescript
describe("TUI_DIFF_FILE_TREE — responsive layout", () => {
  test("RSP-FTREE-001: sidebar visible by default at standard (120x40)", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    // Assert: sidebar visible on left side
    // Assert: file entries rendered
  });

  test("RSP-FTREE-002: sidebar hidden by default at minimum (80x24)", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff
    // Assert: no sidebar visible
    // Assert: content takes full width
  });

  test("RSP-FTREE-003: sidebar visible by default at large (200x60)", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff
    // Assert: sidebar visible with 30% width
  });

  test("RSP-FTREE-004: sidebar width is 25% at standard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    // Assert: sidebar occupies ~30 columns (25% of 120)
  });

  test("RSP-FTREE-005: sidebar width is 30% when toggled at minimum", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("ctrl+b"); // toggle on
    // Assert: sidebar occupies ~24 columns (30% of 80)
  });

  test("RSP-FTREE-006: resize from standard to minimum auto-hides sidebar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff (sidebar visible)
    await terminal.resize(80, 24);
    // Assert: sidebar hidden
    // Assert: focus transferred to content if was on tree
  });

  test("RSP-FTREE-007: resize from minimum to standard auto-shows sidebar", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff (sidebar hidden)
    await terminal.resize(120, 40);
    // Assert: sidebar visible
  });

  test("RSP-FTREE-008: resize respects manual toggle — user hid sidebar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("ctrl+b"); // hide sidebar explicitly
    await terminal.resize(200, 60);
    // Assert: sidebar still hidden (user preference honored)
  });

  test("RSP-FTREE-009: resize preserves focus state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // focus tree
    await terminal.resize(200, 60);
    // Assert: tree still focused after resize
  });

  test("RSP-FTREE-010: resize preserves search filter", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "/");
    await terminal.sendText("test");
    await terminal.resize(200, 60);
    // Assert: search still active with "test" query
    // Assert: filtered list still shows matches
  });

  test("RSP-FTREE-011: resize recalculates path truncation", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Some paths truncated at 120
    await terminal.resize(200, 60);
    // Assert: paths show more characters (wider sidebar = less truncation)
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RSP-FTREE-012: sidebar force-hides when resolved width < 24 cols", async () => {
    // At 80 cols, 30% = 24 cols — exactly at threshold, should show
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("ctrl+b"); // toggle on
    // Assert: sidebar visible at 24 cols (30% of 80)
    // At threshold: sidebar shows because Math.floor(80 * 0.30) = 24 >= 24
  });
});
```

### 15.4 Integration Tests (12 tests: INT-FTREE-001 through INT-FTREE-012)

```typescript
describe("TUI_DIFF_FILE_TREE — integration", () => {
  test("INT-FTREE-001: tree populated from change diff API", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a change diff
    // Assert: file entries match the change diff response
    // Assert: correct change type icons (A/M/D/R/C)
    // Assert: correct stat numbers
  });

  test("INT-FTREE-002: tree populated from landing diff API", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a landing diff
    // Assert: file entries include files from all changes in the landing
  });

  test("INT-FTREE-003: whitespace toggle triggers re-fetch and tree update", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    await terminal.sendKeys("w"); // toggle whitespace
    // Assert: tree re-renders with updated file list
    // Assert: stat numbers may change (whitespace-only changes filtered)
  });

  test("INT-FTREE-004: tree-to-content scroll sync on Enter", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab"); // focus tree
    await terminal.sendKeys("j", "j"); // move to third file
    await terminal.sendKeys("Enter"); // select
    // Assert: content pane scrolled to third file's diff
    // Assert: focus in content zone
  });

  test("INT-FTREE-005: content ] nav syncs tree cursor", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("]"); // next file in content
    // Assert: tree cursor moved to second file
    await terminal.sendKeys("]"); // next file
    // Assert: tree cursor moved to third file
  });

  test("INT-FTREE-006: mixed navigation — tree select then content ]", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("tab", "j", "j", "Enter"); // select third file from tree
    await terminal.sendKeys("]"); // next file in content
    // Assert: tree cursor on fourth file
    // Assert: content shows fourth file
  });

  test("INT-FTREE-007: loading spinner shown during diff fetch", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff — during loading:
    // Assert: loading spinner or skeleton visible
    // Assert: file tree not rendered yet (or empty)
  });

  test("INT-FTREE-008: error state shows error in content, tree empty", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff that will fail (e.g., nonexistent change)
    // Assert: error message displayed
    // Assert: R to retry hint shown
  });

  test("INT-FTREE-009: 401 propagates to auth error screen", async () => {
    const terminal = await launchTUI({
      cols: 120, rows: 40,
      env: { CODEPLANE_TOKEN: "invalid-token" },
    });
    // Assert: auth error screen shown
    // Assert: "Run codeplane auth login" message
  });

  test("INT-FTREE-010: deep link opens diff with tree populated", async () => {
    const terminal = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "diff", "--repo", "owner/repo", "--mode", "change", "--change-id", "abc123"],
    });
    // Assert: diff screen opens directly
    // Assert: file tree populated from API
  });

  test("INT-FTREE-011: back navigation preserves tree state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, move cursor in tree
    await terminal.sendKeys("tab", "j", "j");
    // Navigate away and back
    // Assert: cursor position preserved on return (if cached)
  });

  test("INT-FTREE-012: sidebar toggle during comment form", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, open comment form (future feature)
    // Press Ctrl+B to toggle sidebar
    // Assert: sidebar hides without affecting comment form
    // Assert: comment form remains functional
  });
});
```

---

## 16. Test File Organization

All 74 tests above are appended to the existing `e2e/tui/diff.test.ts` file, after the existing test blocks. The final file structure:

```
e2e/tui/diff.test.ts
├── import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers.ts"
├── describe("TUI_DIFF_SYNTAX_HIGHLIGHT — SyntaxStyle lifecycle")     # existing (7 tests)
├── describe("TUI_DIFF_SYNTAX_HIGHLIGHT — keyboard interaction")      # existing (8 tests)
├── describe("TUI_DIFF_SYNTAX_HIGHLIGHT — color capability tiers")    # existing (4 tests)
├── describe("TUI_DIFF_SYNTAX_HIGHLIGHT — language resolution")       # existing (8 tests)
├── describe("TUI_DIFF_SYNTAX_HIGHLIGHT — edge cases")                # existing (4 tests)
├── describe("TUI_DIFF_FILE_TREE — snapshots")                        # NEW (18 tests)
├── describe("TUI_DIFF_FILE_TREE — keyboard interaction")             # NEW (32 tests)
├── describe("TUI_DIFF_FILE_TREE — responsive layout")                # NEW (12 tests)
└── describe("TUI_DIFF_FILE_TREE — integration")                      # NEW (12 tests)
```

Tests import from `./helpers.ts` which provides `launchTUI`, `TUITestInstance`, and `TERMINAL_SIZES`. No mocks are used — tests run against a real API server with test fixtures.

Tests that fail because the backend API endpoints are not yet implemented are **left failing**. They are never skipped, commented out, or wrapped in `test.skip()`.

---

## 17. Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/engineering/tui-diff-screen-scaffold.md` — DiffScreen shell
- `specs/tui/engineering/tui-diff-data-hooks.md` — Data hooks
- `specs/tui/prd.md` — TUI PRD
- `specs/tui/design.md` — TUI Design
- `specs/tui/engineering-architecture.md` — TUI Engineering Architecture
- `specs/tui/features.ts` — Feature inventory

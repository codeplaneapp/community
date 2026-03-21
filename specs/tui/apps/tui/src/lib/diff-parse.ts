import { parsePatch } from "diff";
import type {
  DiffLine,
  DiffLineType,
  ParsedDiff,
  ParsedHunk,
  SplitLinePair,
} from "./diff-types";

/**
 * Validate a patch string for known problematic patterns.
 * Returns null if valid, or an error message string.
 */
export function validatePatch(patch: string | undefined | null): string | null {
  if (!patch) return null;
  if (/Binary files .* differ/i.test(patch)) {
    return "Binary file \u2014 cannot display diff.";
  }
  return null;
}

/**
 * Parse the scope name from a hunk header string.
 * E.g., "@@ -42,7 +42,12 @@ function setup()" \u2192 "function setup()"
 */
export function parseHunkScopeName(headerLine: string): string | null {
  const match = headerLine.match(/^@@[^@]+@@(.*)$/);
  if (!match) return null;
  const scope = match[1].trim();
  return scope.length > 0 ? scope : null;
}

function createFillerLine(): DiffLine {
  return {
    content: "",
    type: "filler",
    oldLineNumber: null,
    newLineNumber: null,
  };
}

/**
 * Convert a hunk's unified lines into paired left/right lines with filler
 * insertion for split view vertical alignment.
 */
export function buildSplitPairs(lines: DiffLine[]): SplitLinePair[] {
  const pairs: SplitLinePair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === "context") {
      pairs.push({ left: line, right: line });
      i++;
      continue;
    }

    // Change block
    const removes: DiffLine[] = [];
    const adds: DiffLine[] = [];

    while (i < lines.length && lines[i].type === "remove") {
      removes.push(lines[i]);
      i++;
    }

    while (i < lines.length && lines[i].type === "add") {
      adds.push(lines[i]);
      i++;
    }

    const maxLen = Math.max(removes.length, adds.length);
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        left: j < removes.length ? removes[j] : createFillerLine(),
        right: j < adds.length ? adds[j] : createFillerLine(),
      });
    }
  }

  return pairs;
}

/**
 * Build a Map<number, number> from visual line indices to actual file line numbers.
 */
export function buildLineMap(
  hunks: ParsedHunk[],
  mode: "unified" | "split-left" | "split-right"
): Map<number, number> {
  const map = new Map<number, number>();
  let visualIndex = 0;

  for (const hunk of hunks) {
    if (mode === "unified") {
      for (const line of hunk.lines) {
        if (line.type === "remove" && line.oldLineNumber !== null) {
          map.set(visualIndex, line.oldLineNumber);
        } else if ((line.type === "context" || line.type === "add") && line.newLineNumber !== null) {
          map.set(visualIndex, line.newLineNumber);
        }
        visualIndex++;
      }
    } else if (mode === "split-left") {
      for (const pair of hunk.splitPairs) {
        if (pair.left.type !== "filler" && pair.left.oldLineNumber !== null) {
          map.set(visualIndex, pair.left.oldLineNumber);
        }
        visualIndex++;
      }
    } else if (mode === "split-right") {
      for (const pair of hunk.splitPairs) {
        if (pair.right.type !== "filler" && pair.right.newLineNumber !== null) {
          map.set(visualIndex, pair.right.newLineNumber);
        }
        visualIndex++;
      }
    }
  }

  return map;
}

/**
 * Compute the visual line offsets for each hunk, accounting for collapsed hunks.
 */
export function getHunkVisualOffsets(
  hunks: ParsedHunk[],
  collapseState?: Map<number, boolean>
): number[] {
  const offsets: number[] = [];
  let currentOffset = 0;

  for (let i = 0; i < hunks.length; i++) {
    offsets.push(currentOffset);
    const isCollapsed = collapseState?.get(i);
    if (isCollapsed) {
      currentOffset += 1;
    } else {
      currentOffset += hunks[i].totalLineCount;
    }
  }

  return offsets;
}

/**
 * Determine which hunk contains the current scroll position.
 */
export function getFocusedHunkIndex(
  scrollPosition: number,
  hunkVisualOffsets: number[]
): number {
  if (hunkVisualOffsets.length === 0) return -1;
  if (scrollPosition < hunkVisualOffsets[0]) return 0;

  let left = 0;
  let right = hunkVisualOffsets.length - 1;
  let ans = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (hunkVisualOffsets[mid] <= scrollPosition) {
      ans = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return ans;
}

/**
 * Compute the collapsed hunk summary text.
 */
export function getCollapsedSummaryText(
  hunk: ParsedHunk,
  terminalWidth: number
): string {
  const count = hunk.totalLineCount;
  if (terminalWidth < 120) {
    return `${count} hidden`;
  }
  
  if (count === 1) {
    return `1 line hidden (line ${hunk.oldStart})`;
  }
  
  const endLine = hunk.oldStart + count - 1;
  return `${count} lines hidden (lines ${hunk.oldStart}\u2013${endLine})`;
}

/**
 * Parse a unified diff patch string into structured hunks with paired
 * left/right line arrays for split view alignment.
 */
export function parseDiffHunks(patch: string | undefined | null): ParsedDiff {
  const emptyResult: ParsedDiff = {
    hunks: [],
    isEmpty: true,
    error: null,
    unifiedLineMap: new Map(),
    splitLeftLineMap: new Map(),
    splitRightLineMap: new Map(),
    hunkVisualOffsets: [],
  };

  if (!patch || patch.trim() === "") {
    return emptyResult;
  }

  const validationError = validatePatch(patch);
  if (validationError) {
    return { ...emptyResult, isEmpty: false, error: validationError };
  }

  let structuredPatches;
  try {
    structuredPatches = parsePatch(patch);
  } catch (error: any) {
    return { ...emptyResult, isEmpty: false, error: `Error parsing diff: ${error.message}` };
  }

  if (!structuredPatches || structuredPatches.length === 0) {
    return emptyResult;
  }

  const patchData = structuredPatches[0];
  if (!patchData.hunks || patchData.hunks.length === 0) {
    return { ...emptyResult, isEmpty: false, error: "Error parsing diff: Malformed patch" };
  }

  const hunks: ParsedHunk[] = [];

  for (let i = 0; i < patchData.hunks.length; i++) {
    const rawHunk = patchData.hunks[i];
    const oldStart = Math.max(1, rawHunk.oldStart);
    const newStart = Math.max(1, rawHunk.newStart);
    
    const oldLinesCount = rawHunk.oldLines ?? 0;
    const newLinesCount = rawHunk.newLines ?? 0;

    // We can infer header if not available.
    // 'diff' package might have 'hunk.hunk' or similar, but let's build a default just in case
    const headerPrefix = `@@ -${oldStart},${oldLinesCount} +${newStart},${newLinesCount} @@`;
    const scopeName = null; // Can't easily infer scope from rawHunk.lines without knowing what diff outputs exactly if it strips header.
    // Wait, parsePatch does not return the hunk header in rawHunk.lines.
    // If the diff gives us old lines, etc. we just use the prefix.
    const header = headerPrefix;
    
    const lines: DiffLine[] = [];
    let currentOld = oldStart;
    let currentNew = newStart;
    let totalLineCount = 0;

    for (const rawLine of rawHunk.lines) {
      if (rawLine.startsWith("\\")) {
        continue;
      }
      totalLineCount++;
      
      let type: DiffLineType = "context";
      let content = rawLine;

      if (rawLine.startsWith("+")) {
        type = "add";
        content = rawLine.slice(1);
        lines.push({ type, content, oldLineNumber: null, newLineNumber: currentNew++ });
      } else if (rawLine.startsWith("-")) {
        type = "remove";
        content = rawLine.slice(1);
        lines.push({ type, content, oldLineNumber: currentOld++, newLineNumber: null });
      } else {
        type = "context";
        if (rawLine.startsWith(" ")) {
          content = rawLine.slice(1);
        }
        lines.push({ type, content, oldLineNumber: currentOld++, newLineNumber: currentNew++ });
      }
    }

    const splitPairs = buildSplitPairs(lines);

    hunks.push({
      index: i,
      oldStart,
      oldLines: oldLinesCount,
      newStart,
      newLines: newLinesCount,
      header,
      scopeName,
      lines,
      splitPairs,
      totalLineCount,
    });
  }

  const result: ParsedDiff = {
    hunks,
    isEmpty: false,
    error: null,
    unifiedLineMap: buildLineMap(hunks, "unified"),
    splitLeftLineMap: buildLineMap(hunks, "split-left"),
    splitRightLineMap: buildLineMap(hunks, "split-right"),
    hunkVisualOffsets: getHunkVisualOffsets(hunks),
  };

  return result;
}

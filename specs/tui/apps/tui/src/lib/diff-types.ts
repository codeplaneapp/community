/**
 * The type of a line in a diff.
 * - "context": unchanged line (space prefix in unified diff)
 * - "add": addition line (+ prefix)
 * - "remove": deletion line (- prefix)
 * - "filler": padding line inserted for split-view alignment (no real content)
 */
export type DiffLineType = "context" | "add" | "remove" | "filler";

/**
 * A single line in a parsed diff hunk, used by both unified and split views.
 */
export interface DiffLine {
  /** The line content (without the +/-/space prefix) */
  content: string;
  /** The type of line */
  type: DiffLineType;
  /** Old file line number (present on "remove" and "context" lines; absent on "add" and "filler") */
  oldLineNumber: number | null;
  /** New file line number (present on "add" and "context" lines; absent on "remove" and "filler") */
  newLineNumber: number | null;
}

/**
 * A paired line for split view rendering: left (old) and right (new).
 * Both sides are always present. Filler lines appear when one side lacks
 * a corresponding line.
 */
export interface SplitLinePair {
  /** Left pane line (old file side). Type is "remove", "context", or "filler". */
  left: DiffLine;
  /** Right pane line (new file side). Type is "add", "context", or "filler". */
  right: DiffLine;
}

/**
 * A structured hunk parsed from a unified diff patch.
 */
export interface ParsedHunk {
  /** 0-based index of this hunk within the file's patch */
  index: number;
  /** Starting line number in the old file */
  oldStart: number;
  /** Number of lines from the old file in this hunk */
  oldLines: number;
  /** Starting line number in the new file */
  newStart: number;
  /** Number of lines from the new file in this hunk */
  newLines: number;
  /** The hunk header text (e.g., "@@ -42,7 +42,12 @@ function setup()") */
  header: string;
  /** Optional scope/function name from the hunk header (text after the second @@) */
  scopeName: string | null;
  /** Lines in this hunk for unified view rendering */
  lines: DiffLine[];
  /** Paired left/right lines for split view rendering (with filler insertion) */
  splitPairs: SplitLinePair[];
  /** Total line count: additions + deletions + context (used for collapse summary) */
  totalLineCount: number;
}

/**
 * The complete parsed output for a single file's diff patch.
 */
export interface ParsedDiff {
  /** All hunks in this file's diff */
  hunks: ParsedHunk[];
  /** Whether the patch string was empty or missing */
  isEmpty: boolean;
  /** Parse error message, if any */
  error: string | null;
  /**
   * Map from visual line index (0-based, across all hunks in unified view)
   * to the actual file line number. Used for gutter rendering.
   * Key: visual line index in the flattened unified output.
   * Value: the corresponding file line number (old for deletions, new for additions/context).
   */
  unifiedLineMap: Map<number, number>;
  /**
   * Map from visual line index in the left split pane (0-based, across all hunks)
   * to the old file line number. Filler lines are absent from this map.
   */
  splitLeftLineMap: Map<number, number>;
  /**
   * Map from visual line index in the right split pane (0-based, across all hunks)
   * to the new file line number. Filler lines are absent from this map.
   */
  splitRightLineMap: Map<number, number>;
  /**
   * Cumulative visual line offsets for each hunk boundary in unified view.
   * hunkVisualOffsets[i] = visual line index where hunk i begins.
   * Used for focusedHunkIndex derivation.
   */
  hunkVisualOffsets: number[];
}

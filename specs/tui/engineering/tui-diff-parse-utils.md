# Engineering Specification: tui-diff-parse-utils

**Ticket:** tui-diff-parse-utils
**Title:** Diff parsing utilities: hunk splitting, line mapping, filler insertion
**Status:** Not started
**Dependencies:** None (0 upstream)
**Downstream consumers:** tui-diff-unified-view, tui-diff-split-view, tui-diff-line-numbers, tui-diff-expand-collapse

---

## Overview

This ticket implements the shared pure-function diff parsing utilities that sit between the raw `FileDiffItem.patch` data (unified diff string from the API) and the React component layer. These utilities convert raw unified diff patches into structured data suitable for both the unified and split diff views, provide line number mapping for the gutter, insert filler lines for split-view vertical alignment, and derive focused hunk indices from scroll position.

All utilities are **pure functions with zero React dependencies**. They operate on strings, arrays, and plain objects. They are consumed by the `DiffUnifiedView`, `DiffSplitView`, `DiffScreen`, and expand/collapse components.

---

## Target Files

| File | Purpose |
|------|---------|
| `apps/tui/src/lib/diff-types.ts` | Type definitions for all diff parse output structures |
| `apps/tui/src/lib/diff-parse.ts` | Pure-function implementations of all parsing utilities |

---

## Primary Input Type

The primary input is `FileDiffItem` from `@codeplane/sdk`:

```typescript
// packages/sdk/src/services/repohost.ts lines 57-68
export interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: string;
  patch?: string;          // ← Raw unified diff string (the primary input)
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}
```

The `patch` field contains a standard unified diff string with `@@` hunk headers and `+`/`-`/` ` prefixed lines. This is the same format consumed by the `diff` npm package's `parsePatch()` function, which OpenTUI's `DiffRenderable` already uses internally (see `context/opentui/packages/core/src/renderables/Diff.ts` line 7).

---

## Architectural Decision: Reuse `parsePatch` from `diff` npm package

The `diff` npm package is already a transitive dependency via `@opentui/core`. OpenTUI's `DiffRenderable` uses `parsePatch` from `diff` to convert unified diff strings into `StructuredPatch` objects with typed `Hunk` arrays.

**Decision:** Reuse `parsePatch` from the `diff` package as the first-stage parser, then transform its `StructuredPatch` output into the TUI-specific `ParsedHunk` and `DiffLine` structures. This avoids reimplementing hunk-header regex parsing that is already battle-tested in the `diff` package, while giving the TUI full control over the downstream data shapes needed for split-view alignment, line mapping, and collapse tracking.

**Rationale:**
1. `parsePatch` is already available as a transitive dependency — no new dependency added.
2. The `diff` package's `Hunk` type provides `oldStart`, `newStart`, `oldLines`, `newLines`, and a `lines` string array — exactly the raw fields needed.
3. The TUI layer adds: paired left/right line arrays, filler line insertion, visual-line-to-file-line mapping, and focused-hunk derivation — none of which `parsePatch` provides.
4. The SDK's `parseGitDiff` function (lines 951-1028 in `repohost.ts`) is NOT exported and operates on full `diff --git` output, not individual `patch` strings. It is unsuitable for reuse here.

---

## Implementation Plan

### Step 1: Define type structures in `apps/tui/src/lib/diff-types.ts`

Create all type definitions consumed by downstream diff components.

```typescript
// apps/tui/src/lib/diff-types.ts

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
```

### Step 2: Implement `parseDiffHunks()` in `apps/tui/src/lib/diff-parse.ts`

The primary parsing function. Converts a raw unified diff `patch` string into a `ParsedDiff`.

```typescript
// apps/tui/src/lib/diff-parse.ts
import { parsePatch } from "diff";
import type {
  DiffLine,
  DiffLineType,
  ParsedDiff,
  ParsedHunk,
  SplitLinePair,
} from "./diff-types";

/**
 * Parse a unified diff patch string into structured hunks with paired
 * left/right line arrays for split view alignment.
 *
 * Pure function. No React dependencies.
 *
 * @param patch - The raw unified diff patch string (from FileDiffItem.patch).
 *                May be undefined, null, or empty.
 * @returns A ParsedDiff containing structured hunks, line maps, and visual offsets.
 */
export function parseDiffHunks(patch: string | undefined | null): ParsedDiff;
```

**Algorithm:**

1. **Guard empty/null input:** If `patch` is falsy or whitespace-only, return `{ hunks: [], isEmpty: true, error: null, ... }` with empty maps.

2. **Parse with `parsePatch`:** Call `parsePatch(patch)`. This returns `StructuredPatch[]`. Take the first element (a single file's patch produces one `StructuredPatch`). If the array is empty, return the empty result.

3. **Handle parse errors:** Wrap `parsePatch` in try/catch. On error, return `{ hunks: [], isEmpty: false, error: error.message, ... }`.

4. **Iterate hunks:** For each `Hunk` from the `StructuredPatch`:
   a. Extract `oldStart`, `newStart`, `oldLines`, `newLines`.
   b. Clamp `oldStart` and `newStart` to minimum 1: `Math.max(1, oldStart)`.
   c. Parse the header string: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@` with optional scope name.
   d. Build the `lines: DiffLine[]` array for unified view:
      - Track `currentOld` and `currentNew` counters starting from `oldStart` and `newStart`.
      - For each line string in `hunk.lines`:
        - First char `+` → `{ type: "add", content: rest, oldLineNumber: null, newLineNumber: currentNew++ }`
        - First char `-` → `{ type: "remove", content: rest, oldLineNumber: currentOld++, newLineNumber: null }`
        - First char ` ` → `{ type: "context", content: rest, oldLineNumber: currentOld++, newLineNumber: currentNew++ }`
        - First char `\` → Skip (no-newline-at-end marker).
   e. Build the `splitPairs: SplitLinePair[]` array using `buildSplitPairs()` (Step 3).
   f. Compute `totalLineCount` as the count of non-`\`-prefixed lines in the hunk.

5. **Build line maps:** After all hunks are parsed:
   - Build `unifiedLineMap` by iterating all hunks' `lines` sequentially, incrementing a global visual index. For each line, map `visualIndex → line.newLineNumber ?? line.oldLineNumber`.
   - Build `splitLeftLineMap` by iterating all hunks' `splitPairs` sequentially. For each pair where `pair.left.type !== "filler"` and `pair.left.oldLineNumber !== null`, map `visualIndex → pair.left.oldLineNumber`. For context lines on the left, use `pair.left.oldLineNumber`.
   - Build `splitRightLineMap` analogously: for each pair where `pair.right.type !== "filler"` and `pair.right.newLineNumber !== null`, map `visualIndex → pair.right.newLineNumber`.

6. **Build hunk visual offsets:** Accumulate `hunkVisualOffsets[]` where each entry is the cumulative count of unified lines before this hunk.

### Step 3: Implement `buildSplitPairs()` — filler line insertion

This function converts a hunk's unified lines into paired left/right lines with filler insertion for vertical alignment. This is the core alignment algorithm for split view.

```typescript
/**
 * Convert a hunk's unified lines into paired left/right lines with filler
 * insertion for split view vertical alignment.
 *
 * The algorithm groups consecutive additions and deletions into "change blocks",
 * then pads the shorter side with filler lines so both sides have equal length.
 * Context lines appear identically on both sides.
 *
 * Pure function.
 *
 * @param lines - The hunk's DiffLine[] from unified parsing.
 * @returns Array of SplitLinePair for split view rendering.
 */
export function buildSplitPairs(lines: DiffLine[]): SplitLinePair[];
```

**Algorithm:**

This mirrors the algorithm in OpenTUI's `DiffRenderable.buildSplitView()` (Diff.ts lines 420-520) but operates on our `DiffLine` types instead of raw strings:

1. Walk through lines sequentially.
2. When encountering a **context line**: emit a `SplitLinePair` with the same line on both left and right (both typed as "context").
3. When encountering a **change block** (contiguous sequence of "remove" and "add" lines):
   a. Collect all consecutive "remove" lines into a `removes[]` array.
   b. Collect all subsequent consecutive "add" lines into an `adds[]` array.
   c. Let `maxLen = Math.max(removes.length, adds.length)`.
   d. For each index `j` from 0 to `maxLen - 1`:
      - Left side: `removes[j]` if `j < removes.length`, otherwise a filler line.
      - Right side: `adds[j]` if `j < adds.length`, otherwise a filler line.
   e. Emit each pair as a `SplitLinePair`.

**Filler line construction:**

```typescript
function createFillerLine(): DiffLine {
  return {
    content: "",
    type: "filler",
    oldLineNumber: null,
    newLineNumber: null,
  };
}
```

### Step 4: Implement `buildLineMap()` — visual-to-file line number mapping

```typescript
/**
 * Build a Map<number, number> from visual line indices to actual file line numbers.
 *
 * In unified view: visual index is the 0-based position in the flattened list
 * of all hunk lines. Additions map to new file line numbers. Deletions map to
 * old file line numbers. Context lines map to new file line numbers.
 *
 * In split view: separate maps for left (old) and right (new) panes.
 * Filler lines are excluded from the map (no entry for that visual index).
 *
 * Pure function.
 *
 * @param hunks - The parsed hunks from parseDiffHunks().
 * @param mode - "unified" | "split-left" | "split-right"
 * @returns Map from visual line index to file line number.
 */
export function buildLineMap(
  hunks: ParsedHunk[],
  mode: "unified" | "split-left" | "split-right"
): Map<number, number>;
```

**Algorithm:**

- For `"unified"`: Iterate `hunks[*].lines`, maintaining a global visual index. For each line:
  - `"context"` or `"add"`: map to `line.newLineNumber` (skip if null).
  - `"remove"`: map to `line.oldLineNumber` (skip if null).
- For `"split-left"`: Iterate `hunks[*].splitPairs`, maintaining a global visual index. For each pair:
  - If `pair.left.type !== "filler"` and `pair.left.oldLineNumber !== null`: map visual index → `pair.left.oldLineNumber`.
  - For context lines, use `pair.left.oldLineNumber`.
- For `"split-right"`: Analogous, using `pair.right.newLineNumber`.

### Step 5: Implement `getFocusedHunkIndex()` — derive focused hunk from scroll position

```typescript
/**
 * Determine which hunk contains the current scroll position.
 *
 * Uses the hunkVisualOffsets array to binary-search for the hunk
 * whose visual line range contains the given scroll position.
 *
 * Pure function.
 *
 * @param scrollPosition - The current visual line index at the top of the viewport (0-based).
 * @param hunkVisualOffsets - Array where hunkVisualOffsets[i] is the visual line index
 *                           where hunk i begins. From ParsedDiff.hunkVisualOffsets.
 * @returns The 0-based hunk index, or -1 if no hunks exist.
 */
export function getFocusedHunkIndex(
  scrollPosition: number,
  hunkVisualOffsets: number[]
): number;
```

**Algorithm:**

Binary search on `hunkVisualOffsets` to find the largest index `i` where `hunkVisualOffsets[i] <= scrollPosition`:

1. If `hunkVisualOffsets` is empty, return -1.
2. If `scrollPosition < hunkVisualOffsets[0]`, return 0 (before first hunk, associate with first).
3. Binary search for the rightmost offset ≤ `scrollPosition`.
4. Return that index.

This value feeds directly into the expand/collapse feature's `hunkCollapseState: Map<string, Map<number, boolean>>` (from TUI_DIFF_EXPAND_COLLAPSE spec line 179).

### Step 6: Implement `getHunkVisualOffsets()` — compute hunk boundaries accounting for collapse state

```typescript
/**
 * Compute the visual line offsets for each hunk, accounting for collapsed hunks.
 *
 * When a hunk is collapsed, it occupies exactly 1 visual line (the summary line)
 * instead of its full line count. This function recalculates offsets to reflect
 * the current collapse state.
 *
 * Pure function.
 *
 * @param hunks - The parsed hunks.
 * @param collapseState - Map<number, boolean> where key is hunk index and true = collapsed.
 *                        Missing entries = expanded (default).
 * @returns Array where result[i] is the visual line offset of hunk i.
 */
export function getHunkVisualOffsets(
  hunks: ParsedHunk[],
  collapseState?: Map<number, boolean>
): number[];
```

**Algorithm:**

Accumulate offsets. For each hunk `i`:
- If `collapseState?.get(i)` is true: hunk occupies 1 visual line (summary).
- Otherwise: hunk occupies `hunks[i].totalLineCount` visual lines.
- `offsets[i]` = sum of all preceding visual line counts.

### Step 7: Implement edge-case utilities

```typescript
/**
 * Parse the scope name from a hunk header string.
 * E.g., "@@ -42,7 +42,12 @@ function setup()" → "function setup()"
 *
 * @param headerLine - The raw hunk header line from the diff patch.
 * @returns The scope name string, or null if no scope name is present.
 */
export function parseHunkScopeName(headerLine: string): string | null;

/**
 * Compute the collapsed hunk summary text.
 *
 * @param hunk - The parsed hunk.
 * @param terminalWidth - Current terminal width for format selection.
 * @returns Summary string, e.g., "7 lines hidden (lines 42–48)" or "7 hidden" at narrow widths.
 */
export function getCollapsedSummaryText(
  hunk: ParsedHunk,
  terminalWidth: number
): string;

/**
 * Validate a patch string for known problematic patterns.
 * Returns null if valid, or an error message string.
 *
 * Checks: binary marker detection ("Binary files ... differ"),
 * empty string, single-line files, malformed hunk headers.
 */
export function validatePatch(patch: string | undefined | null): string | null;
```

---

## File Structure

```
apps/tui/src/lib/
├── diff-types.ts       # Type definitions (ParsedHunk, DiffLine, SplitLinePair, ParsedDiff)
├── diff-parse.ts       # Pure function implementations
└── diff-syntax.ts      # (existing) Color palettes, tier detection, filetype resolution
```

---

## Downstream Consumer Integration

### `DiffUnifiedView` (tui-diff-unified-view)

Consumes:
- `parseDiffHunks(file.patch)` → `ParsedDiff`
- `parsedDiff.hunks[*].lines` for rendering unified diff lines
- `parsedDiff.unifiedLineMap` for gutter line numbers
- `parsedDiff.hunkVisualOffsets` for scroll-based hunk focusing

### `DiffSplitView` (tui-diff-split-view)

Consumes:
- `parseDiffHunks(file.patch)` → `ParsedDiff`
- `parsedDiff.hunks[*].splitPairs` for paired left/right rendering with filler alignment
- `parsedDiff.splitLeftLineMap` and `parsedDiff.splitRightLineMap` for dual gutter line numbers
- `parsedDiff.hunkVisualOffsets` for scroll-based hunk focusing

### `DiffExpandCollapse` (tui-diff-expand-collapse)

Consumes:
- `getFocusedHunkIndex(scrollPosition, parsedDiff.hunkVisualOffsets)` to determine which hunk `z` collapses
- `getHunkVisualOffsets(hunks, collapseState)` to recalculate visual offsets after collapse/expand
- `getCollapsedSummaryText(hunk, terminalWidth)` for the summary line text
- `parsedDiff.hunks[i].totalLineCount` for the "N lines hidden" value

### `DiffLineNumbers` (tui-diff-line-numbers)

Consumes:
- `parsedDiff.unifiedLineMap` for unified gutter
- `parsedDiff.splitLeftLineMap` and `parsedDiff.splitRightLineMap` for split gutters
- Line maps are `Map<number, number>` and directly feed into OpenTUI's `LineNumberRenderable.setLineNumbers()`

---

## Relationship to OpenTUI's DiffRenderable

OpenTUI's `DiffRenderable` (Diff.ts) has its own internal parsing in `buildUnifiedView()` and `buildSplitView()`. The TUI-layer parse utilities exist **in parallel** — they parse the same patch string but produce TUI-specific data structures for:

1. **Collapse state management**: OpenTUI's `DiffRenderable` has no concept of collapsible hunks. The TUI layer needs structured hunk boundaries and visual offsets to implement `z`/`Z`/`x`/`X` collapse behavior.

2. **Focused hunk derivation**: Determining which hunk the scroll position is in requires `hunkVisualOffsets` that account for collapse state. This is TUI-layer logic.

3. **Line number maps as first-class data**: OpenTUI computes line numbers internally during `buildView()`, but the TUI layer needs the maps externally for gutter width calculations, truncation decisions, and gutter tier selection (4/5/6 chars based on max line number).

4. **Pre-computed split pairs**: The TUI layer needs access to the split pair structure before passing to OpenTUI's `<diff>` component, for things like inline comment positioning and collapse summary line generation.

The TUI layer utilities do NOT replace OpenTUI's internal parsing. Both run, but the TUI utilities drive the React component logic while OpenTUI's internal parsing drives the low-level rendering.

---

## Edge Cases

### Empty patch

```typescript
parseDiffHunks(undefined) → { hunks: [], isEmpty: true, error: null, ... }
parseDiffHunks(null) → { hunks: [], isEmpty: true, error: null, ... }
parseDiffHunks("") → { hunks: [], isEmpty: true, error: null, ... }
parseDiffHunks("   \n  ") → { hunks: [], isEmpty: true, error: null, ... }
```

### Single-line file

A patch with one addition:
```
@@ -0,0 +1,1 @@
+hello world
```
Produces one `ParsedHunk` with `lines: [{ type: "add", content: "hello world", newLineNumber: 1, oldLineNumber: null }]` and `splitPairs: [{ left: filler, right: addLine }]`.

### Binary file marker

```
Binary files a/image.png and b/image.png differ
```

`parsePatch()` returns an empty array for this. `validatePatch()` detects the binary marker and returns `"Binary file — cannot display diff."`.

### No-newline-at-end-of-file marker

Lines starting with `\` (e.g., `\ No newline at end of file`) are skipped during parsing and do not appear in `DiffLine[]` output.

### Hunk with only additions (new file)

All split pairs have `left: filler`. `splitLeftLineMap` is empty. `splitRightLineMap` has entries for every visual line.

### Hunk with only deletions (deleted file)

All split pairs have `right: filler`. `splitRightLineMap` is empty. `splitLeftLineMap` has entries for every visual line.

### Interleaved additions and deletions

The change-block grouping algorithm handles this correctly. In a unified diff, deletions always appear before additions within a change block. The `parsePatch` output preserves this ordering. The split pair builder groups them and pads the shorter side.

### Large hunk (>500 lines)

No special treatment. All data structures are arrays and maps. Performance is O(n) in line count. Memory allocation is proportional to line count. The downstream virtual scrolling in OpenTUI handles rendering performance.

### Malformed patch

If `parsePatch()` throws, `parseDiffHunks` catches and returns `{ hunks: [], isEmpty: false, error: "Error parsing diff: ..." }`.

### Negative or zero oldStart/newStart

Line numbers clamp to 1 minimum: `Math.max(1, oldStart)`. This handles malformed API responses.

---

## Performance Constraints

| Operation | Budget | Complexity |
|-----------|--------|------------|
| `parseDiffHunks()` for 10,000-line patch | < 50ms | O(n) in total lines |
| `buildSplitPairs()` for 500-line hunk | < 5ms | O(n) in hunk lines |
| `buildLineMap()` for 10,000 lines | < 10ms | O(n) in total lines |
| `getFocusedHunkIndex()` | < 0.1ms | O(log h) where h = hunk count |
| `getHunkVisualOffsets()` | < 0.1ms | O(h) where h = hunk count |

All functions allocate their output once (no intermediate copies). Maps are pre-sized where possible. No per-line closures or object spread.

---

## Productionization Notes

### No POC required

This ticket has zero external dependencies beyond the `diff` npm package which is already a transitive dependency. The `parsePatch` API is stable and well-documented. No proof-of-concept is needed.

### Module initialization

Both files (`diff-types.ts` and `diff-parse.ts`) have zero module-level side effects. All exports are types or pure functions. Import cost is negligible.

### Memory

`ParsedDiff` objects are intended to be created once per file diff view and cached for the lifetime of the diff screen session. On file navigation (`]`/`[`), the previous file's `ParsedDiff` can be retained in a bounded cache (up to the 500-item memory cap from the architecture spec). On whitespace toggle (`w`), the `ParsedDiff` is recomputed from the new patch data.

### Tree-shaking

All exports are named exports. Consumers import only the functions they need. Dead code elimination removes unused functions.

### Testing isolation

All functions are pure — they take inputs and return outputs with no side effects. Unit tests use direct function calls with assert on return values. No mocks needed. No React rendering needed.

---

## Unit & Integration Tests

Test file: `e2e/tui/diff.test.ts`

All tests are appended to the existing `e2e/tui/diff.test.ts` file within a new `describe("TUI_DIFF_PARSE_UTILS", ...)` block. Tests use `@microsoft/tui-test` with `bun:test` runner. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Pure function unit tests (run without terminal, direct import)

These tests import the functions directly and assert on return values. No TUI rendering is involved.

#### `parseDiffHunks` tests (15 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| PARSE-001 | `parseDiffHunks returns empty result for undefined patch` | `parseDiffHunks(undefined)` → `{ hunks: [], isEmpty: true, error: null }` |
| PARSE-002 | `parseDiffHunks returns empty result for null patch` | `parseDiffHunks(null)` → `{ hunks: [], isEmpty: true, error: null }` |
| PARSE-003 | `parseDiffHunks returns empty result for empty string` | `parseDiffHunks("")` → `{ hunks: [], isEmpty: true, error: null }` |
| PARSE-004 | `parseDiffHunks returns empty result for whitespace-only string` | `parseDiffHunks("  \n  ")` → `{ hunks: [], isEmpty: true, error: null }` |
| PARSE-005 | `parseDiffHunks parses single hunk with additions and deletions` | Standard patch → 1 hunk with correct `oldStart`, `newStart`, `oldLines`, `newLines`, and `lines` array |
| PARSE-006 | `parseDiffHunks parses multiple hunks` | Patch with 3 hunks → `hunks.length === 3`, each with correct boundaries |
| PARSE-007 | `parseDiffHunks assigns correct line types` | Addition → `"add"`, deletion → `"remove"`, context → `"context"` |
| PARSE-008 | `parseDiffHunks assigns correct line numbers` | Additions get newLineNumber; deletions get oldLineNumber; context gets both |
| PARSE-009 | `parseDiffHunks strips prefix from content` | `+hello` → `content: "hello"`, ` world` → `content: "world"` |
| PARSE-010 | `parseDiffHunks skips no-newline-at-eof markers` | `\ No newline at end of file` lines are not in output |
| PARSE-011 | `parseDiffHunks handles addition-only patch` | New file patch → all lines type `"add"`, all `oldLineNumber: null` |
| PARSE-012 | `parseDiffHunks handles deletion-only patch` | Deleted file patch → all lines type `"remove"`, all `newLineNumber: null` |
| PARSE-013 | `parseDiffHunks handles single-line patch` | `@@ -0,0 +1,1 @@\n+x` → 1 hunk, 1 line, `newLineNumber: 1` |
| PARSE-014 | `parseDiffHunks returns error for malformed patch` | Garbage input → `{ hunks: [], isEmpty: false, error: "..." }` |
| PARSE-015 | `parseDiffHunks computes correct totalLineCount` | Hunk with 3 adds + 2 removes + 5 context → `totalLineCount: 10` |

#### `buildSplitPairs` tests (12 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SPLIT-001 | `buildSplitPairs pairs context lines identically` | Context line → `left.type === "context"`, `right.type === "context"`, same content |
| SPLIT-002 | `buildSplitPairs pairs equal removes and adds` | 2 removes + 2 adds → 2 pairs, left = remove, right = add |
| SPLIT-003 | `buildSplitPairs inserts left filler for excess adds` | 1 remove + 3 adds → 3 pairs; pair[1].left and pair[2].left are fillers |
| SPLIT-004 | `buildSplitPairs inserts right filler for excess removes` | 3 removes + 1 add → 3 pairs; pair[1].right and pair[2].right are fillers |
| SPLIT-005 | `buildSplitPairs handles addition-only hunk` | All adds → all left sides are fillers |
| SPLIT-006 | `buildSplitPairs handles deletion-only hunk` | All removes → all right sides are fillers |
| SPLIT-007 | `buildSplitPairs handles context-only hunk` | All context → no fillers, identical left and right |
| SPLIT-008 | `buildSplitPairs handles interleaved change blocks` | remove, add, context, remove, remove, add → correct pairing with fillers |
| SPLIT-009 | `buildSplitPairs preserves line numbers through fillers` | Filler lines have `oldLineNumber: null` and `newLineNumber: null` |
| SPLIT-010 | `buildSplitPairs handles empty lines array` | `[]` → `[]` |
| SPLIT-011 | `buildSplitPairs handles single context line` | 1 context → 1 pair, no fillers |
| SPLIT-012 | `buildSplitPairs handles large change block (100 removes, 50 adds)` | 100 pairs; first 50 pairs: left=remove, right=add; last 50 pairs: left=remove, right=filler |

#### `buildLineMap` tests (10 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| LMAP-001 | `unified line map maps additions to new line numbers` | Add lines → map value is newLineNumber |
| LMAP-002 | `unified line map maps deletions to old line numbers` | Remove lines → map value is oldLineNumber |
| LMAP-003 | `unified line map maps context to new line numbers` | Context lines → map value is newLineNumber |
| LMAP-004 | `unified line map is contiguous across hunks` | 2 hunks → visual indices continue from first hunk into second |
| LMAP-005 | `split-left line map excludes filler lines` | Filler lines on left → no entry in map for those visual indices |
| LMAP-006 | `split-right line map excludes filler lines` | Filler lines on right → no entry in map |
| LMAP-007 | `split-left maps to old line numbers` | Remove and context → old file line numbers |
| LMAP-008 | `split-right maps to new line numbers` | Add and context → new file line numbers |
| LMAP-009 | `line map is empty for empty hunks` | `[]` → empty map |
| LMAP-010 | `line map handles multi-hunk with gaps` | Hunks at lines 10-15 and 50-55 → map has gap in line numbers |

#### `getFocusedHunkIndex` tests (8 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| FOCUS-001 | `returns -1 for empty offsets` | `getFocusedHunkIndex(0, [])` → `-1` |
| FOCUS-002 | `returns 0 when position is before first hunk` | `getFocusedHunkIndex(0, [5, 20, 40])` → `0` |
| FOCUS-003 | `returns 0 when position is exactly at first hunk` | `getFocusedHunkIndex(5, [5, 20, 40])` → `0` |
| FOCUS-004 | `returns 1 when position is in second hunk` | `getFocusedHunkIndex(25, [5, 20, 40])` → `1` |
| FOCUS-005 | `returns last index when position is in last hunk` | `getFocusedHunkIndex(50, [5, 20, 40])` → `2` |
| FOCUS-006 | `returns correct index for position exactly at hunk boundary` | `getFocusedHunkIndex(20, [5, 20, 40])` → `1` |
| FOCUS-007 | `returns 0 for single hunk` | `getFocusedHunkIndex(10, [0])` → `0` |
| FOCUS-008 | `handles large offset arrays (100 hunks)` | Binary search correctness at scale |

#### `getHunkVisualOffsets` tests (7 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| OFFSET-001 | `returns empty array for empty hunks` | `getHunkVisualOffsets([])` → `[]` |
| OFFSET-002 | `returns [0] for single hunk` | 1 hunk → `[0]` |
| OFFSET-003 | `accumulates line counts for expanded hunks` | 3 hunks (10, 20, 15 lines) → `[0, 10, 30]` |
| OFFSET-004 | `collapsed hunk occupies 1 visual line` | Hunk 1 collapsed → `[0, 1, 21]` instead of `[0, 10, 30]` |
| OFFSET-005 | `all hunks collapsed` | 3 hunks collapsed → `[0, 1, 2]` |
| OFFSET-006 | `no collapse state defaults to all expanded` | `getHunkVisualOffsets(hunks, undefined)` matches `getHunkVisualOffsets(hunks, new Map())` |
| OFFSET-007 | `mixed collapse state` | Hunks 0=expanded(10), 1=collapsed(1), 2=expanded(15) → `[0, 10, 11]` |

#### `getCollapsedSummaryText` tests (5 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SUMM-001 | `full format at 120+ columns` | `getCollapsedSummaryText(hunk, 120)` → `"7 lines hidden (lines 42–48)"` |
| SUMM-002 | `abbreviated format below 120 columns` | `getCollapsedSummaryText(hunk, 80)` → `"7 hidden"` |
| SUMM-003 | `singular form for 1 line` | 1-line hunk, 120 cols → `"1 line hidden (line 42)"` |
| SUMM-004 | `uses en-dash not hyphen` | Line range uses `–` (U+2013) not `-` |
| SUMM-005 | `full integer for large line counts` | 1500-line hunk → `"1500 lines hidden (lines 42–1541)"` no abbreviation |

#### `parseHunkScopeName` tests (4 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SCOPE-001 | `extracts scope name after second @@` | `"@@ -1,3 +1,5 @@ function foo()"` → `"function foo()"` |
| SCOPE-002 | `returns null when no scope name` | `"@@ -1,3 +1,5 @@"` → `null` |
| SCOPE-003 | `returns null for empty scope` | `"@@ -1,3 +1,5 @@ "` → `null` (whitespace-only) |
| SCOPE-004 | `preserves full scope text` | `"@@ -1,3 +1,5 @@ class Foo extends Bar {}"` → `"class Foo extends Bar {}"` |

#### `validatePatch` tests (5 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| VAL-001 | `returns null for valid patch` | Standard patch → `null` |
| VAL-002 | `returns null for undefined` | `undefined` → `null` (empty is valid, not an error) |
| VAL-003 | `detects binary marker` | `"Binary files a/x and b/x differ"` → error string |
| VAL-004 | `detects binary marker with paths` | Various binary marker formats detected |
| VAL-005 | `returns null for patch with only context` | Context-only patch → `null` |

### Integration tests (TUI rendering, `@microsoft/tui-test`)

These tests launch the TUI and verify that parsed diff data renders correctly through the component layer.

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-PARSE-001 | `parsed hunks render correct line numbers in unified view` | Launch TUI → navigate to diff → verify gutter line numbers match expected values from `parseDiffHunks` output |
| INT-PARSE-002 | `split view filler lines appear at correct positions` | Launch TUI at 120×40 → toggle to split → verify blank gutter cells (filler lines) appear where expected |
| INT-PARSE-003 | `focused hunk index updates on scroll` | Launch TUI → navigate to diff with 3+ hunks → scroll with `j` × N → press `z` → verify correct hunk collapses |
| INT-PARSE-004 | `collapsed hunk summary shows correct line count` | Launch TUI → collapse a hunk → verify summary text matches `getCollapsedSummaryText()` output |
| INT-PARSE-005 | `line maps correct across file navigation` | Navigate from file 1 to file 2 with `]` → verify gutter resets to file 2's line numbers |
| INT-PARSE-006 | `empty patch renders empty diff message` | Navigate to a diff with empty patch → verify "No file changes in this diff." appears |

### Snapshot tests (TUI rendering at multiple sizes)

| Test ID | Test name | Terminal size | Description |
|---------|-----------|--------------|-------------|
| SNAP-PARSE-001 | `unified diff line numbers at 80x24` | 80×24 | Snapshot verifying line numbers from `unifiedLineMap` render correctly in 4-char gutter |
| SNAP-PARSE-002 | `split diff filler alignment at 120x40` | 120×40 | Snapshot verifying filler lines create correct vertical alignment between panes |
| SNAP-PARSE-003 | `collapsed hunk summary at 80x24` | 80×24 | Snapshot verifying abbreviated summary `"▶ ⋯ N hidden"` from `getCollapsedSummaryText` |
| SNAP-PARSE-004 | `collapsed hunk summary at 120x40` | 120×40 | Snapshot verifying full summary `"▶ ⋯ N lines hidden (lines X–Y)"` |

### Test data fixtures

Tests use inline patch strings as fixtures. Example:

```typescript
const SIMPLE_PATCH = `--- a/file.ts
+++ b/file.ts
@@ -10,5 +10,8 @@ function setup()
 import { config } from "./config"
-const val = 1
+const val = computeValue()
+const extra = validate(val)
 return val

`;

const MULTI_HUNK_PATCH = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line1
+newline
 line2
 line3
@@ -20,3 +21,2 @@
 line20
-removed
 line22
`;

const NEW_FILE_PATCH = `--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+line1
+line2
+line3
`;

const DELETED_FILE_PATCH = `--- a/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3
`;
```

---

## Acceptance Criteria Mapping

| Acceptance criterion | Implementation | Test coverage |
|---------------------|----------------|---------------|
| `parseDiffHunks()` converts unified patches to structured hunk objects with `oldStart`, `newStart`, `oldLines`, `newLines` | `parseDiffHunks()` in Step 2 | PARSE-005, PARSE-006 |
| Paired left/right line arrays for split view alignment | `buildSplitPairs()` in Step 3 | SPLIT-001 through SPLIT-012 |
| `Map<number, number>` line number mapping (visual → actual) | `buildLineMap()` in Step 4 | LMAP-001 through LMAP-010 |
| Filler line insertion for split view vertical alignment | `buildSplitPairs()` filler logic | SPLIT-003, SPLIT-004, SPLIT-005, SPLIT-006, INT-PARSE-002 |
| `focusedHunkIndex` derivation from scroll position | `getFocusedHunkIndex()` in Step 5 | FOCUS-001 through FOCUS-008, INT-PARSE-003 |
| Edge case: empty patches | Guard in `parseDiffHunks()` | PARSE-001, PARSE-002, PARSE-003, PARSE-004, INT-PARSE-006 |
| Edge case: single-line files | Standard parsing | PARSE-013 |
| Edge case: binary markers | `validatePatch()` in Step 7 | VAL-003, VAL-004 |
| Pure-function constraint (no React dependencies) | All exports are plain TS functions/types | All PARSE, SPLIT, LMAP, FOCUS, OFFSET tests import directly |

---

## Source of Truth

This engineering spec should be maintained alongside:

- [specs/tui/prd.md](../prd.md) — TUI product requirements
- [specs/tui/design.md](../design.md) — TUI design specification
- [specs/tui/engineering/tui-diff-syntax-style.md](./tui-diff-syntax-style.md) — Diff syntax highlighting spec
- [specs/tui/TUI_DIFF_SPLIT_VIEW.md](../TUI_DIFF_SPLIT_VIEW.md) — Split view feature spec
- [specs/tui/TUI_DIFF_EXPAND_COLLAPSE.md](../TUI_DIFF_EXPAND_COLLAPSE.md) — Expand/collapse feature spec
- [specs/tui/TUI_DIFF_LINE_NUMBERS.md](../TUI_DIFF_LINE_NUMBERS.md) — Line numbers feature spec
- [specs/tui/TUI_DIFF_UNIFIED_VIEW.md](../TUI_DIFF_UNIFIED_VIEW.md) — Unified view feature spec
- [specs/tui/TUI_DIFF_SCROLL_SYNC.md](../TUI_DIFF_SCROLL_SYNC.md) — Scroll sync feature spec
- [context/opentui/packages/core/src/renderables/Diff.ts](../../../context/opentui/packages/core/src/renderables/Diff.ts) — OpenTUI DiffRenderable reference

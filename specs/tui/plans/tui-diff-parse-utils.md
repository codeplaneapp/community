# Implementation Plan: tui-diff-parse-utils

## Overview
This plan details the implementation of the diff parsing utilities for the Codeplane TUI. These pure functions will convert raw unified diff patches into structured data for unified and split views, provide line mapping, and manage filler lines for vertical alignment. The implementation avoids React coupling and reuses `@opentui/core`'s underlying `diff` package.

## Step 1: Define Type Structures
**File:** `apps/tui/src/lib/diff-types.ts`

Create the type definitions that will be consumed by downstream diff components.
- **`DiffLineType`**: Define as `"context" | "add" | "remove" | "filler"`.
- **`DiffLine`**: Interface containing `content` (string), `type` (DiffLineType), `oldLineNumber` (number | null), and `newLineNumber` (number | null).
- **`SplitLinePair`**: Interface containing `left` and `right` `DiffLine` objects.
- **`ParsedHunk`**: Interface with hunk metadata (`index`, `oldStart`, `oldLines`, `newStart`, `newLines`, `header`, `scopeName`), `lines` array, `splitPairs` array, and `totalLineCount`.
- **`ParsedDiff`**: Interface containing `hunks`, `isEmpty`, `error`, `unifiedLineMap`, `splitLeftLineMap`, `splitRightLineMap`, and `hunkVisualOffsets`.

## Step 2: Implement Main Parse Logic
**File:** `apps/tui/src/lib/diff-parse.ts`

Import `parsePatch` from `diff` and the types from `diff-types.ts`.
- **`parseDiffHunks(patch)`**:
  1. Handle empty/null input returning an empty `ParsedDiff` with `isEmpty: true`.
  2. Validate the patch using `validatePatch`. If invalid, return the error message.
  3. Parse the string using `parsePatch`. Handle parse errors with a try/catch block, returning `error` if one occurs.
  4. Iterate over the parsed `Hunk` objects:
     - Extract line numbers (clamped to min 1).
     - Parse the header and scope name (using `parseHunkScopeName`).
     - Convert lines to `DiffLine` objects based on prefix (`+`, `-`, ` `), skipping `\` (no newline at EOF).
     - Call `buildSplitPairs` to generate `splitPairs`.
     - Calculate `totalLineCount` (ignoring `\` prefixed lines).
  5. Build the `unifiedLineMap`, `splitLeftLineMap`, and `splitRightLineMap` using `buildLineMap`.
  6. Compute `hunkVisualOffsets` using `getHunkVisualOffsets` (without collapse state).

## Step 3: Implement Split Pairs and Filler Insertion
**File:** `apps/tui/src/lib/diff-parse.ts`

- **`buildSplitPairs(lines)`**:
  - Iterate sequentially over the lines.
  - Context lines create a pair with the same line on both sides.
  - Group contiguous blocks of `"remove"` and `"add"` lines.
  - For each change block, pad the shorter side with filler lines (where `oldLineNumber` and `newLineNumber` are null, content is `""`, and type is `"filler"`) to ensure the left and right sides are of equal length.

## Step 4: Implement Line Mapping Utilities
**File:** `apps/tui/src/lib/diff-parse.ts`

- **`buildLineMap(hunks, mode)`**:
  - `unified`: Map visual index to `newLineNumber` (for `"context"`/`"add"`) or `oldLineNumber` (for `"remove"`).
  - `split-left`: Map visual index to `oldLineNumber`, excluding `"filler"` lines.
  - `split-right`: Map visual index to `newLineNumber`, excluding `"filler"` lines.

## Step 5: Implement Scroll & Focus Logic
**File:** `apps/tui/src/lib/diff-parse.ts`

- **`getFocusedHunkIndex(scrollPosition, hunkVisualOffsets)`**:
  - Implement a binary search on `hunkVisualOffsets` to find the largest index `i` where `hunkVisualOffsets[i] <= scrollPosition`.
  - Handle edge cases: return `-1` if empty, `0` if `scrollPosition` is before the first offset.
- **`getHunkVisualOffsets(hunks, collapseState)`**:
  - Recalculate offsets taking into account that a collapsed hunk occupies exactly 1 visual line instead of its `totalLineCount`.

## Step 6: Implement Formatting & Edge-Case Utilities
**File:** `apps/tui/src/lib/diff-parse.ts`

- **`parseHunkScopeName(headerLine)`**: Extract the scope name following the second `@@`.
- **`getCollapsedSummaryText(hunk, terminalWidth)`**: Format a summary string. Return full format `"N lines hidden (lines X-Y)"` for widths >= 120 cols, and `"N hidden"` for narrower terminals.
- **`validatePatch(patch)`**: Check for binary markers (e.g., `"Binary files ... differ"`) returning an error message if invalid, or null if valid.

## Step 7: Testing
**File:** `e2e/tui/diff.test.ts`

Append tests to the existing test file inside a `describe("TUI_DIFF_PARSE_UTILS", ...)` block.
- **Unit Tests**:
  - Import the pure functions directly.
  - Add 15 tests for `parseDiffHunks` (handling of empty, additions, deletions, single-line, malformed).
  - Add 12 tests for `buildSplitPairs` (filler logic, contiguous block alignment).
  - Add 10 tests for `buildLineMap` (verifying proper visual index to file line number mappings).
  - Add 8 tests for `getFocusedHunkIndex` (binary search validation and boundaries).
  - Add 7 tests for `getHunkVisualOffsets`.
  - Add 5 tests for `getCollapsedSummaryText`.
  - Add 4 tests for `parseHunkScopeName`.
  - Add 5 tests for `validatePatch`.
- **Integration/Snapshot Tests**:
  - Use `@microsoft/tui-test` to render diff components utilizing the parsed structures.
  - Take snapshots to verify unified line numbers rendering at 80x24.
  - Take snapshots to verify split view filler alignment at 120x40.
  - Take snapshots to verify collapsed hunk summaries formatting at 80x24 and 120x40.
  - Keep any integration tests failing if the requisite backend/SDK data is unimplemented.
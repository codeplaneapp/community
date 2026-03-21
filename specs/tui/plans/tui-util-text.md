# Implementation Plan: tui-util-text

## Overview
This plan implements the text utility functions required for wrapping, truncation, and formatting across the TUI application. It establishes a centralized set of pure functions and constants in `apps/tui/src/util/` to remove duplication of magic numbers and formatting logic across feature screens.

## Step 1: Create Constants Module
**File:** `apps/tui/src/util/constants.ts`
- Create the module to store all terminal dimension thresholds, timeouts, and limits used throughout the TUI.
- Export numeric constants including:
  - Breakpoints: `MIN_COLS` (80), `MIN_ROWS` (24), `STANDARD_COLS` (120), `STANDARD_ROWS` (40), `LARGE_COLS` (200), `LARGE_ROWS` (60)
  - Timeouts and Limits: `AUTH_VALIDATION_TIMEOUT_MS` (5_000), `MAX_STACK_DEPTH` (32), `LOADING_TIMEOUT_MS` (30_000), `RETRY_DEBOUNCE_MS` (1_000), `STATUS_BAR_CONFIRMATION_MS` (3_000), `CRASH_LOOP_WINDOW_MS` (5_000), `CRASH_LOOP_MAX_RESTARTS` (3).
- No external dependencies or imports should exist in this file.

## Step 2: Implement Truncation Functions
**File:** `apps/tui/src/util/truncate.ts`
- Implement and export pure functions for text measurement and wrapping.
- **`truncateText(text: string, maxWidth: number): string`**: Right-truncates strings using a 1-column ellipsis (`…` U+2026) when they exceed `maxWidth`. Return empty strings for `maxWidth < 1` and just the ellipsis for `maxWidth === 1`.
- **`truncateLeft(text: string, maxWidth: number): string`**: Left-truncates strings with `…` (e.g., for breadcrumb paths). Keeps rightmost content intact.
- **`wrapText(text: string, maxWidth: number): string[]`**: Splits input on word boundaries, greedily filling lines up to `maxWidth`, hard-breaking individual words that exceed the limit without hyphens.

## Step 3: Implement Format Functions
**File:** `apps/tui/src/util/format.ts`
- Import `truncateText` from `./truncate.js` (must use `.js` extension for ESM compilation).
- Implement **`formatAuthConfirmation(username: string, source: string, maxWidth: number): string`**: Progressively degrades the auth confirmation message ("Authenticated as @{username} ({source})") to fit within `maxWidth`, dropping the source before truncating the username.
- Implement **`formatErrorSummary(error: unknown, maxChars: number): string`**: Extracts error messages defensively from `unknown` inputs (handling `Error` objects, strings, `{ message: string }`, null, and undefined), strips newlines to a single line, and right-truncates to `maxChars`.

## Step 4: Update Barrel File
**File:** `apps/tui/src/util/index.ts`
- Update the barrel export to expose all the newly implemented utilities.
- Add exports for `truncateText`, `truncateLeft`, `wrapText` from `./truncate.js`.
- Add exports for `formatAuthConfirmation`, `formatErrorSummary` from `./format.js`.
- Add exports for all the dimension and timeout constants from `./constants.js`.

## Step 5: Add Unit and Integration Tests
**File:** `e2e/tui/util-text.test.ts`
- Create a new test suite utilizing `bun:test`.
- Write thorough unit tests covering all functions:
  - `truncateText` and `truncateLeft`: tests for exact matches, under/over limits, edge cases (0, negative limits), and empty strings.
  - `wrapText`: tests for word boundary wrapping, hard breaks, whitespace handling, and preservation of all words.
  - `formatAuthConfirmation`: tests for progressive degradation and maximum character limits.
  - `formatErrorSummary`: tests for defensive extraction from various typed inputs, newline replacement, and length bounds.
  - **Barrel exports**: verify that all expected functions and variables are successfully exported via `apps/tui/src/util/index.js`.
  - **Compilation check**: implement a test executing `bun run check` (or `tsc --noEmit`) to verify adding utilities didn't break TS compilation.

## Review and Quality Control
- Track all file changes under the appropriate `tui-util-text` jj bookmark scope.
- Verify test completion without requiring mocked backends as the utility functions are purely stateless.
- Ensure `tsc` compilation outputs zero errors prior to finalizing the implementation.
# Engineering Specification: `tui-util-text`

## Ticket Summary

**Title:** Implement text utility functions for wrapping, truncation, and formatting  
**Type:** Engineering  
**Dependency:** `tui-foundation-scaffold`  
**Target files:** `apps/tui/src/util/truncate.ts`, `apps/tui/src/util/constants.ts`, `apps/tui/src/util/format.ts`  
**Test files:** `e2e/tui/util-text.test.ts`  

---

## Motivation

Multiple TUI foundation features (HeaderBar breadcrumb rendering, StatusBar layout, ErrorBoundary display, AuthProvider confirmation messages, responsive layout calculations) depend on a shared set of text utilities. Today, truncation logic is scattered across screen-specific code:

- `apps/tui/src/screens/Agents/components/ToolBlock.tsx` has `truncateContent()` and `truncateToolName()` — both are private module-scoped functions with hardcoded limits.
- `apps/tui/src/screens/Agents/utils/generateSummary.ts` has single-line truncation with `…` suffix — breakpoint-aware but scoped to agent summaries.

None of these handle left-truncation (needed for breadcrumb overflow), word-boundary wrapping (needed for error messages, help overlays, and modal content), or formalized constants (currently duplicated across `router/types.ts` with `MAX_STACK_DEPTH = 32` and `types/breakpoint.ts` with magic numbers for dimensions).

This ticket creates a canonical utility layer in `apps/tui/src/util/` that all foundation and feature code can import.

---

## Existing Code Audit

### Files that will be superseded or can be refactored later

| File | Current behavior | Relationship to this ticket |
|------|-----------------|----------------------------|
| `src/screens/Agents/components/ToolBlock.tsx` | Private `truncateContent()` (64KB limit), `truncateToolName()` (50 char limit) | Future ticket can refactor to use `truncateText()` from `src/util/truncate.ts`. Not changed in this ticket — no breaking changes. |
| `src/screens/Agents/utils/generateSummary.ts` | Single-line summary with `…` suffix, breakpoint-aware | Pattern is similar to `truncateText()` but with newline normalization. Future ticket may compose `truncateText()` internally. Not changed in this ticket. |
| `src/router/types.ts` | `MAX_STACK_DEPTH = 32` | Remains as-is. `src/util/constants.ts` re-exports this same value for centralized access. Both files export the same constant — consumers can import from either. |
| `src/types/breakpoint.ts` | `getBreakpoint()` with hardcoded `80`, `120`, `200`, `24`, `40`, `60` | Remains as-is. `src/util/constants.ts` formalizes these as named constants (`MIN_COLS`, `MIN_ROWS`, etc.) that `breakpoint.ts` can optionally migrate to in a future ticket. |
| `src/util/index.ts` | Empty barrel with planned module comments | Updated to re-export from the three new modules. |

### Key constraint: no breaking changes

This ticket **adds** new files and updates the barrel export. It does not modify any existing file's behavior. Existing code that uses hardcoded values continues to work. Migration of existing code to use these utilities is a separate follow-up.

---

## Implementation Plan

### Step 1: Create `apps/tui/src/util/constants.ts`

**File:** `apps/tui/src/util/constants.ts`

This module defines all magic numbers used across the TUI as named, typed constants. Values are derived from the PRD, design spec, and architecture doc.

```typescript
/**
 * Terminal dimension breakpoint thresholds.
 * These match the ranges in src/types/breakpoint.ts and the design spec §8.1.
 */
export const MIN_COLS = 80;
export const MIN_ROWS = 24;
export const STANDARD_COLS = 120;
export const STANDARD_ROWS = 40;
export const LARGE_COLS = 200;
export const LARGE_ROWS = 60;

/**
 * Auth token validation timeout in milliseconds.
 * Bootstrap step 5: GET /api/user with this timeout.
 * On timeout, TUI proceeds optimistically with "offline" indicator.
 */
export const AUTH_VALIDATION_TIMEOUT_MS = 5_000;

/**
 * Maximum navigation stack depth.
 * Push beyond this limit drops the oldest (bottom) entry.
 * Matches the value in src/router/types.ts.
 */
export const MAX_STACK_DEPTH = 32;

/**
 * Full-screen loading timeout in milliseconds.
 * If initial screen data hasn't loaded after this duration,
 * show a timeout error instead of indefinite spinner.
 */
export const LOADING_TIMEOUT_MS = 30_000;

/**
 * Debounce interval for retry actions in milliseconds.
 * Prevents rapid-fire retries when user holds down 'R'.
 */
export const RETRY_DEBOUNCE_MS = 1_000;

/**
 * Duration in milliseconds that transient status bar confirmations
 * (e.g., "Authenticated as @user") remain visible before fading.
 */
export const STATUS_BAR_CONFIRMATION_MS = 3_000;

/**
 * Crash loop detection: time window in milliseconds.
 * If the TUI restarts more than CRASH_LOOP_MAX_RESTARTS times
 * within this window, show a persistent error instead of restarting.
 */
export const CRASH_LOOP_WINDOW_MS = 5_000;

/**
 * Crash loop detection: max restart count within the window.
 */
export const CRASH_LOOP_MAX_RESTARTS = 3;
```

**Design decisions:**

- All values use `_` numeric separators for readability of millisecond values.
- `MAX_STACK_DEPTH` intentionally duplicates the value from `src/router/types.ts` (which is `32`). Both export the same semantic constant. A future ticket can consolidate by having `router/types.ts` import from `util/constants.ts`, but that's outside this ticket's scope to avoid import cycle risk.
- Constants are plain `number` values, not wrapped in objects or enums, for zero-overhead usage.
- No runtime logic — this is a pure value module with no imports.

---

### Step 2: Create `apps/tui/src/util/truncate.ts`

**File:** `apps/tui/src/util/truncate.ts`

Three pure functions for text measurement and truncation.

```typescript
/**
 * Ellipsis character used for truncation indicators.
 * Single Unicode character (U+2026), width = 1 column.
 */
const ELLIPSIS = "…";

/**
 * Truncate text from the right, appending "…" if truncated.
 *
 * - If `text.length <= maxWidth`, returns `text` unchanged.
 * - If `maxWidth < 1`, returns empty string.
 * - If `maxWidth === 1`, returns `ELLIPSIS`.
 * - Otherwise, returns `text.slice(0, maxWidth - 1) + ELLIPSIS`.
 *
 * @param text - The input string to truncate.
 * @param maxWidth - Maximum number of columns the result may occupy.
 * @returns The truncated string, guaranteed to have `.length <= maxWidth`.
 *
 * @example
 * truncateText("Hello, world!", 8) // "Hello, …"
 * truncateText("Short", 10)        // "Short"
 * truncateText("Hi", 2)            // "Hi"
 * truncateText("Hello", 1)         // "…"
 */
export function truncateText(text: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return ELLIPSIS;
  return text.slice(0, maxWidth - 1) + ELLIPSIS;
}

/**
 * Truncate text from the left, prepending "…" if truncated.
 * Used for breadcrumb paths that overflow at minimum terminal widths.
 *
 * - If `text.length <= maxWidth`, returns `text` unchanged.
 * - If `maxWidth < 1`, returns empty string.
 * - If `maxWidth === 1`, returns `ELLIPSIS`.
 * - Otherwise, returns `ELLIPSIS + text.slice(-(maxWidth - 1))`.
 *
 * @param text - The input string to truncate.
 * @param maxWidth - Maximum number of columns the result may occupy.
 * @returns The left-truncated string, guaranteed to have `.length <= maxWidth`.
 *
 * @example
 * truncateLeft("Dashboard > acme/api > Issues > #42", 20)
 * // "…api > Issues > #42"
 * truncateLeft("Short", 10)  // "Short"
 */
export function truncateLeft(text: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return ELLIPSIS;
  return ELLIPSIS + text.slice(-(maxWidth - 1));
}

/**
 * Wrap text into lines at word boundaries.
 *
 * Algorithm:
 * 1. Split input into words on whitespace.
 * 2. Greedily fill each line up to `maxWidth` columns.
 * 3. If a single word exceeds `maxWidth`, hard-break it at `maxWidth` columns
 *    (no ellipsis — the full word is preserved across lines).
 * 4. Empty input returns `[""]`.
 * 5. Leading/trailing whitespace is trimmed from each line.
 *
 * @param text - The input string to wrap.
 * @param maxWidth - Maximum columns per line. Must be >= 1.
 * @returns Array of lines, each with `.length <= maxWidth`.
 *
 * @example
 * wrapText("Hello world, this is a long sentence", 15)
 * // ["Hello world,", "this is a long", "sentence"]
 *
 * wrapText("Superlongword", 5)
 * // ["Super", "longw", "ord"]
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth < 1) return [""];
  if (text.length === 0) return [""];

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    // Word fits on current line (with space separator if line is non-empty)
    if (currentLine.length === 0) {
      if (word.length <= maxWidth) {
        currentLine = word;
      } else {
        // Hard-break long word
        let remaining = word;
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        }
        if (remaining.length > 0) {
          currentLine = remaining;
        }
      }
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine += " " + word;
    } else {
      // Current line is full, start new line
      lines.push(currentLine);
      currentLine = "";

      if (word.length <= maxWidth) {
        currentLine = word;
      } else {
        let remaining = word;
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        }
        if (remaining.length > 0) {
          currentLine = remaining;
        }
      }
    }
  }

  // Push the last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length === 0 ? [""] : lines;
}
```

**Design decisions:**

- **Character width assumption:** All functions assume 1 character = 1 terminal column. This is correct for ASCII and most Latin text. CJK wide characters (which occupy 2 columns) are **not** handled in this ticket. A future enhancement can add `wcwidth` awareness if CJK content becomes a product requirement. This matches the existing behavior in `generateSummary.ts` and `truncateToolName()`.
- **ELLIPSIS is `…` (U+2026):** Single Unicode character, renders as 1 column in all supported terminals. Not `...` (3 characters). This matches the existing pattern in `generateSummary.ts` line 23.
- **`wrapText` hard-breaks words:** A word longer than `maxWidth` is split at the column boundary without a hyphen. This is the correct behavior for terminal UIs where content must never overflow the available width.
- **Pure functions, no side effects:** All functions are stateless and deterministic. No imports, no dependencies.
- **Edge case robustness:** `maxWidth < 1` returns empty/singleton — never throws. This prevents crashes if terminal resize races cause a negative available-width calculation.

---

### Step 3: Create `apps/tui/src/util/format.ts`

**File:** `apps/tui/src/util/format.ts`

Formatting functions used by the AuthProvider confirmation message and the ErrorBoundary summary display.

```typescript
import { truncateText } from "./truncate.js";

/**
 * Format the auth confirmation message shown in the status bar
 * after successful token validation.
 *
 * Format: "Authenticated as @{username} ({source})"
 * Truncated to fit `maxWidth` if necessary.
 *
 * @param username - The authenticated user's username (e.g., "alice").
 * @param source - Token source identifier: "env", "keyring", or "config".
 * @param maxWidth - Maximum columns available for the message.
 * @returns Formatted and potentially truncated confirmation string.
 *
 * @example
 * formatAuthConfirmation("alice", "keyring", 40)
 * // "Authenticated as @alice (keyring)"
 *
 * formatAuthConfirmation("verylongusername", "env", 25)
 * // "Authenticated as @very…"
 */
export function formatAuthConfirmation(
  username: string,
  source: string,
  maxWidth: number,
): string {
  const full = `Authenticated as @${username} (${source})`;
  if (full.length <= maxWidth) return full;

  // Try without source
  const withoutSource = `Authenticated as @${username}`;
  if (withoutSource.length <= maxWidth) return withoutSource;

  // Truncate the whole message
  return truncateText(full, maxWidth);
}

/**
 * Format an error into a single-line summary string for display
 * in the error boundary or inline error indicators.
 *
 * Handles:
 * - `Error` instances: uses `.message`
 * - Strings: used directly
 * - Objects with `.message` property: uses `.message`
 * - Everything else: `"Unknown error"`
 *
 * The result is always a single line (newlines replaced with spaces)
 * and truncated to `maxChars`.
 *
 * @param error - The caught error value (can be anything).
 * @param maxChars - Maximum character count for the summary.
 * @returns A single-line, truncated error summary.
 *
 * @example
 * formatErrorSummary(new Error("Connection refused"), 30)
 * // "Connection refused"
 *
 * formatErrorSummary({ message: "timeout" }, 10)
 * // "timeout"
 *
 * formatErrorSummary(null, 50)
 * // "Unknown error"
 *
 * formatErrorSummary(new Error("Very long error message that goes on and on"), 20)
 * // "Very long error me…"
 */
export function formatErrorSummary(
  error: unknown,
  maxChars: number,
): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    message = (error as { message: string }).message;
  } else {
    message = "Unknown error";
  }

  // Normalize to single line
  const singleLine = message.replace(/\r?\n/g, " ").trim();

  if (singleLine.length === 0) {
    return truncateText("Unknown error", maxChars);
  }

  return truncateText(singleLine, maxChars);
}
```

**Design decisions:**

- **`formatAuthConfirmation` uses progressive degradation:** Full message with source → message without source → truncated message. This ensures the most useful information (username) is preserved even at very narrow widths. The status bar at 80 columns has ~30-40 chars available for center content, so the source suffix is the first thing to drop.
- **`formatErrorSummary` is maximally defensive:** The TUI's error boundary catches arbitrary `throw` values. The function handles `Error`, `string`, `{ message: string }`, `null`, `undefined`, and anything else without throwing. This is critical because the error formatter itself must never throw — it runs inside an error recovery path.
- **Newline normalization in `formatErrorSummary`:** Multi-line error messages (e.g., stack traces accidentally included in `.message`) are collapsed to a single line. The error boundary's expanded view can show the full stack separately.
- **Imports `truncateText`:** This is the only cross-module dependency. `format.ts` → `truncate.ts`. No circular dependencies.

---

### Step 4: Update `apps/tui/src/util/index.ts` barrel export

**File:** `apps/tui/src/util/index.ts`

```typescript
/**
 * Utility functions for the TUI application.
 *
 * - truncate.ts   — Smart text truncation with ellipsis for breadcrumbs, list rows, metadata
 * - format.ts     — Auth confirmation, error summary formatting
 * - constants.ts  — Terminal dimension thresholds, timeouts, limits
 */

export { truncateText, truncateLeft, wrapText } from "./truncate.js";
export { formatAuthConfirmation, formatErrorSummary } from "./format.js";
export {
  MIN_COLS,
  MIN_ROWS,
  STANDARD_COLS,
  STANDARD_ROWS,
  LARGE_COLS,
  LARGE_ROWS,
  AUTH_VALIDATION_TIMEOUT_MS,
  MAX_STACK_DEPTH,
  LOADING_TIMEOUT_MS,
  RETRY_DEBOUNCE_MS,
  STATUS_BAR_CONFIRMATION_MS,
  CRASH_LOOP_WINDOW_MS,
  CRASH_LOOP_MAX_RESTARTS,
} from "./constants.js";
```

---

## File Manifest

| Action | File path | Description |
|--------|-----------|-------------|
| **Create** | `apps/tui/src/util/constants.ts` | Named constants for dimensions, timeouts, limits |
| **Create** | `apps/tui/src/util/truncate.ts` | `truncateText`, `truncateLeft`, `wrapText` |
| **Create** | `apps/tui/src/util/format.ts` | `formatAuthConfirmation`, `formatErrorSummary` |
| **Update** | `apps/tui/src/util/index.ts` | Barrel re-export from all three modules |
| **Create** | `e2e/tui/util-text.test.ts` | Unit and integration tests |

---

## API Reference

### `truncateText(text: string, maxWidth: number): string`

| Input | Output | Notes |
|-------|--------|-------|
| `("Hello, world!", 8)` | `"Hello, …"` | Standard right-truncation |
| `("Short", 10)` | `"Short"` | No truncation needed |
| `("Hi", 2)` | `"Hi"` | Exact fit |
| `("Hello", 1)` | `"…"` | Only ellipsis fits |
| `("Hello", 0)` | `""` | Below minimum |
| `("", 10)` | `""` | Empty input |

### `truncateLeft(text: string, maxWidth: number): string`

| Input | Output | Notes |
|-------|--------|-------|
| `("Dashboard > acme/api > Issues > #42", 20)` | `"…api > Issues > #42"` | Left-truncation for breadcrumbs |
| `("Short", 10)` | `"Short"` | No truncation needed |
| `("ABCDE", 3)` | `"…DE"` | Keeps rightmost content |
| `("Hi", 1)` | `"…"` | Only ellipsis fits |
| `("Hi", 0)` | `""` | Below minimum |

### `wrapText(text: string, maxWidth: number): string[]`

| Input | Output | Notes |
|-------|--------|-------|
| `("Hello world", 15)` | `["Hello world"]` | Fits on one line |
| `("Hello world, this is a long sentence", 15)` | `["Hello world,", "this is a long", "sentence"]` | Word-boundary wrapping |
| `("Superlongword", 5)` | `["Super", "longw", "ord"]` | Hard-break |
| `("", 10)` | `[""]` | Empty input |
| `("  ", 10)` | `[""]` | Whitespace-only input |
| `("a b c", 1)` | `["a", "b", "c"]` | Minimum width |

### `formatAuthConfirmation(username: string, source: string, maxWidth: number): string`

| Input | Output |
|-------|--------|
| `("alice", "keyring", 40)` | `"Authenticated as @alice (keyring)"` |
| `("alice", "keyring", 30)` | `"Authenticated as @alice"` |
| `("verylonguser", "env", 20)` | `"Authenticated as @…"` |

### `formatErrorSummary(error: unknown, maxChars: number): string`

| Input | Output |
|-------|--------|
| `(new Error("Connection refused"), 30)` | `"Connection refused"` |
| `("timeout string", 10)` | `"timeout s…"` |
| `(null, 50)` | `"Unknown error"` |
| `(undefined, 50)` | `"Unknown error"` |
| `(42, 50)` | `"Unknown error"` |
| `({ message: "fail" }, 50)` | `"fail"` |
| `(new Error("line1\nline2"), 50)` | `"line1 line2"` |
| `(new Error(""), 50)` | `"Unknown error"` |

### Constants

| Constant | Value | Used by |
|----------|-------|--------|
| `MIN_COLS` | `80` | `getBreakpoint()`, terminal-too-small check |
| `MIN_ROWS` | `24` | `getBreakpoint()`, terminal-too-small check |
| `STANDARD_COLS` | `120` | `getBreakpoint()`, layout calculations |
| `STANDARD_ROWS` | `40` | `getBreakpoint()`, layout calculations |
| `LARGE_COLS` | `200` | `getBreakpoint()`, layout calculations |
| `LARGE_ROWS` | `60` | `getBreakpoint()`, layout calculations |
| `AUTH_VALIDATION_TIMEOUT_MS` | `5000` | AuthProvider bootstrap |
| `MAX_STACK_DEPTH` | `32` | NavigationProvider stack limit |
| `LOADING_TIMEOUT_MS` | `30000` | Loading state timeout |
| `RETRY_DEBOUNCE_MS` | `1000` | Retry action debounce |
| `STATUS_BAR_CONFIRMATION_MS` | `3000` | Transient status bar messages |
| `CRASH_LOOP_WINDOW_MS` | `5000` | Crash loop detection window |
| `CRASH_LOOP_MAX_RESTARTS` | `3` | Crash loop restart limit |

---

## Unit & Integration Tests

**File:** `e2e/tui/util-text.test.ts`

All tests use `bun:test` (the standard test runner for this project). These are pure-function unit tests — they do not require launching the TUI, no `@microsoft/tui-test`, and no API server. They import the utility modules directly and assert behavior.

The E2E integration tests that verify these utilities are rendered correctly in the TUI (e.g., breadcrumb truncation at 80x24, error boundary display) live in `e2e/tui/app-shell.test.ts` and are covered by the `NAV-SNAP-003` test and related tests that already exist.

```typescript
import { describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// truncate.ts
// ---------------------------------------------------------------------------

describe("truncateText", () => {
  // Dynamic import to validate module resolution
  const { truncateText } = await import("../../apps/tui/src/util/truncate.js");

  test("returns text unchanged when within maxWidth", () => {
    expect(truncateText("Hello", 10)).toBe("Hello");
  });

  test("returns text unchanged when exactly maxWidth", () => {
    expect(truncateText("Hello", 5)).toBe("Hello");
  });

  test("truncates with ellipsis when exceeding maxWidth", () => {
    expect(truncateText("Hello, world!", 8)).toBe("Hello, …");
  });

  test("returns ellipsis when maxWidth is 1", () => {
    expect(truncateText("Hello", 1)).toBe("…");
  });

  test("returns empty string when maxWidth is 0", () => {
    expect(truncateText("Hello", 0)).toBe("");
  });

  test("returns empty string when maxWidth is negative", () => {
    expect(truncateText("Hello", -5)).toBe("");
  });

  test("handles empty input string", () => {
    expect(truncateText("", 10)).toBe("");
  });

  test("handles maxWidth of 2 on 3+ char string", () => {
    expect(truncateText("ABC", 2)).toBe("A…");
  });

  test("result length never exceeds maxWidth", () => {
    const input = "A".repeat(500);
    for (const width of [1, 2, 5, 10, 50, 100, 499, 500, 501]) {
      const result = truncateText(input, width);
      expect(result.length).toBeLessThanOrEqual(width);
    }
  });

  test("uses Unicode ellipsis character (U+2026)", () => {
    const result = truncateText("ABCDEF", 4);
    expect(result).toContain("…");
    expect(result).not.toContain("...");
  });
});

describe("truncateLeft", () => {
  const { truncateLeft } = await import("../../apps/tui/src/util/truncate.js");

  test("returns text unchanged when within maxWidth", () => {
    expect(truncateLeft("Hello", 10)).toBe("Hello");
  });

  test("returns text unchanged when exactly maxWidth", () => {
    expect(truncateLeft("Hello", 5)).toBe("Hello");
  });

  test("truncates from left with ellipsis prefix", () => {
    expect(truncateLeft("ABCDE", 3)).toBe("…DE");
  });

  test("preserves rightmost content for breadcrumb paths", () => {
    const breadcrumb = "Dashboard > acme/api > Issues > #42";
    const result = truncateLeft(breadcrumb, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toMatch(/^…/);
    expect(result).toContain("#42");
  });

  test("returns ellipsis when maxWidth is 1", () => {
    expect(truncateLeft("Hello", 1)).toBe("…");
  });

  test("returns empty string when maxWidth is 0", () => {
    expect(truncateLeft("Hello", 0)).toBe("");
  });

  test("returns empty string when maxWidth is negative", () => {
    expect(truncateLeft("Hello", -1)).toBe("");
  });

  test("handles empty input string", () => {
    expect(truncateLeft("", 10)).toBe("");
  });

  test("result length never exceeds maxWidth", () => {
    const input = "A".repeat(500);
    for (const width of [1, 2, 5, 10, 50, 100, 499, 500, 501]) {
      const result = truncateLeft(input, width);
      expect(result.length).toBeLessThanOrEqual(width);
    }
  });

  test("uses Unicode ellipsis character (U+2026)", () => {
    const result = truncateLeft("ABCDEF", 4);
    expect(result).toContain("…");
    expect(result.startsWith("…")).toBe(true);
  });
});

describe("wrapText", () => {
  const { wrapText } = await import("../../apps/tui/src/util/truncate.js");

  test("returns single line when text fits", () => {
    expect(wrapText("Hello world", 20)).toEqual(["Hello world"]);
  });

  test("wraps at word boundaries", () => {
    const result = wrapText("Hello world, this is a long sentence", 15);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(15);
    }
  });

  test("hard-breaks words longer than maxWidth", () => {
    const result = wrapText("Superlongword", 5);
    expect(result).toEqual(["Super", "longw", "ord"]);
  });

  test("returns [\"\"] for empty input", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });

  test("returns [\"\"] for whitespace-only input", () => {
    expect(wrapText("   ", 10)).toEqual([""]);
  });

  test("handles single word that fits exactly", () => {
    expect(wrapText("Hello", 5)).toEqual(["Hello"]);
  });

  test("handles maxWidth of 1 with single-char words", () => {
    expect(wrapText("a b c", 1)).toEqual(["a", "b", "c"]);
  });

  test("handles multiple spaces between words", () => {
    const result = wrapText("hello    world", 20);
    expect(result).toEqual(["hello world"]);
  });

  test("handles leading and trailing whitespace", () => {
    const result = wrapText("  hello world  ", 20);
    expect(result).toEqual(["hello world"]);
  });

  test("no line exceeds maxWidth", () => {
    const input = "The quick brown fox jumps over the lazy dog and keeps running around the field all day long";
    const result = wrapText(input, 12);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
  });

  test("handles maxWidth of 0", () => {
    expect(wrapText("hello", 0)).toEqual([""]);
  });

  test("handles negative maxWidth", () => {
    expect(wrapText("hello", -1)).toEqual([""]);
  });

  test("preserves all words in output", () => {
    const input = "alpha beta gamma delta";
    const result = wrapText(input, 10);
    const rejoined = result.join(" ");
    expect(rejoined).toContain("alpha");
    expect(rejoined).toContain("beta");
    expect(rejoined).toContain("gamma");
    expect(rejoined).toContain("delta");
  });

  test("mix of short and long words", () => {
    const result = wrapText("a Superlongword b", 5);
    // 'a' fits on line 1, 'Superlongword' hard-breaks, 'b' on its own line
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(5);
    }
    const rejoined = result.join("");
    expect(rejoined).toContain("a");
    expect(rejoined).toContain("Superlongword");
    expect(rejoined).toContain("b");
  });
});

// ---------------------------------------------------------------------------
// constants.ts
// ---------------------------------------------------------------------------

describe("constants", () => {
  const constants = await import("../../apps/tui/src/util/constants.js");

  test("MIN_COLS is 80", () => {
    expect(constants.MIN_COLS).toBe(80);
  });

  test("MIN_ROWS is 24", () => {
    expect(constants.MIN_ROWS).toBe(24);
  });

  test("STANDARD_COLS is 120", () => {
    expect(constants.STANDARD_COLS).toBe(120);
  });

  test("STANDARD_ROWS is 40", () => {
    expect(constants.STANDARD_ROWS).toBe(40);
  });

  test("LARGE_COLS is 200", () => {
    expect(constants.LARGE_COLS).toBe(200);
  });

  test("LARGE_ROWS is 60", () => {
    expect(constants.LARGE_ROWS).toBe(60);
  });

  test("AUTH_VALIDATION_TIMEOUT_MS is 5000", () => {
    expect(constants.AUTH_VALIDATION_TIMEOUT_MS).toBe(5_000);
  });

  test("MAX_STACK_DEPTH is 32", () => {
    expect(constants.MAX_STACK_DEPTH).toBe(32);
  });

  test("MAX_STACK_DEPTH matches router/types.ts value", async () => {
    const { MAX_STACK_DEPTH: routerDepth } = await import(
      "../../apps/tui/src/router/types.js"
    );
    expect(constants.MAX_STACK_DEPTH).toBe(routerDepth);
  });

  test("LOADING_TIMEOUT_MS is 30000", () => {
    expect(constants.LOADING_TIMEOUT_MS).toBe(30_000);
  });

  test("RETRY_DEBOUNCE_MS is 1000", () => {
    expect(constants.RETRY_DEBOUNCE_MS).toBe(1_000);
  });

  test("STATUS_BAR_CONFIRMATION_MS is 3000", () => {
    expect(constants.STATUS_BAR_CONFIRMATION_MS).toBe(3_000);
  });

  test("CRASH_LOOP_WINDOW_MS is 5000", () => {
    expect(constants.CRASH_LOOP_WINDOW_MS).toBe(5_000);
  });

  test("CRASH_LOOP_MAX_RESTARTS is 3", () => {
    expect(constants.CRASH_LOOP_MAX_RESTARTS).toBe(3);
  });

  test("all dimension constants are positive integers", () => {
    for (const key of [
      "MIN_COLS", "MIN_ROWS",
      "STANDARD_COLS", "STANDARD_ROWS",
      "LARGE_COLS", "LARGE_ROWS",
    ] as const) {
      const val = constants[key];
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThan(0);
    }
  });

  test("all timeout constants are positive integers", () => {
    for (const key of [
      "AUTH_VALIDATION_TIMEOUT_MS",
      "LOADING_TIMEOUT_MS",
      "RETRY_DEBOUNCE_MS",
      "STATUS_BAR_CONFIRMATION_MS",
      "CRASH_LOOP_WINDOW_MS",
    ] as const) {
      const val = constants[key];
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThan(0);
    }
  });

  test("breakpoint dimensions follow ascending order", () => {
    expect(constants.MIN_COLS).toBeLessThan(constants.STANDARD_COLS);
    expect(constants.STANDARD_COLS).toBeLessThan(constants.LARGE_COLS);
    expect(constants.MIN_ROWS).toBeLessThan(constants.STANDARD_ROWS);
    expect(constants.STANDARD_ROWS).toBeLessThan(constants.LARGE_ROWS);
  });
});

// ---------------------------------------------------------------------------
// format.ts
// ---------------------------------------------------------------------------

describe("formatAuthConfirmation", () => {
  const { formatAuthConfirmation } = await import(
    "../../apps/tui/src/util/format.js"
  );

  test("returns full message when it fits", () => {
    expect(formatAuthConfirmation("alice", "keyring", 50)).toBe(
      "Authenticated as @alice (keyring)",
    );
  });

  test("drops source when full message does not fit", () => {
    const result = formatAuthConfirmation("alice", "keyring", 30);
    expect(result).toBe("Authenticated as @alice");
    expect(result).not.toContain("keyring");
  });

  test("truncates when even username-only message does not fit", () => {
    const result = formatAuthConfirmation("verylongusername", "env", 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain("…");
  });

  test("handles all three token sources", () => {
    expect(formatAuthConfirmation("u", "env", 50)).toContain("env");
    expect(formatAuthConfirmation("u", "keyring", 50)).toContain("keyring");
    expect(formatAuthConfirmation("u", "config", 50)).toContain("config");
  });

  test("result length never exceeds maxWidth", () => {
    for (const width of [5, 10, 15, 20, 25, 30, 50, 100]) {
      const result = formatAuthConfirmation("alice", "keyring", width);
      expect(result.length).toBeLessThanOrEqual(width);
    }
  });

  test("handles empty username", () => {
    const result = formatAuthConfirmation("", "env", 30);
    expect(result).toContain("@");
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe("formatErrorSummary", () => {
  const { formatErrorSummary } = await import(
    "../../apps/tui/src/util/format.js"
  );

  test("extracts message from Error instance", () => {
    expect(formatErrorSummary(new Error("Connection refused"), 50)).toBe(
      "Connection refused",
    );
  });

  test("uses string error directly", () => {
    expect(formatErrorSummary("timeout", 50)).toBe("timeout");
  });

  test("extracts message from object with message property", () => {
    expect(formatErrorSummary({ message: "fail" }, 50)).toBe("fail");
  });

  test("returns 'Unknown error' for null", () => {
    expect(formatErrorSummary(null, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for undefined", () => {
    expect(formatErrorSummary(undefined, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for number", () => {
    expect(formatErrorSummary(42, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for boolean", () => {
    expect(formatErrorSummary(true, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for empty Error message", () => {
    expect(formatErrorSummary(new Error(""), 50)).toBe("Unknown error");
  });

  test("replaces newlines with spaces", () => {
    const err = new Error("line1\nline2\nline3");
    const result = formatErrorSummary(err, 50);
    expect(result).not.toContain("\n");
    expect(result).toContain("line1 line2 line3");
  });

  test("replaces Windows-style newlines", () => {
    const err = new Error("line1\r\nline2");
    expect(formatErrorSummary(err, 50)).toContain("line1 line2");
  });

  test("truncates long error messages", () => {
    const err = new Error("A".repeat(200));
    const result = formatErrorSummary(err, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain("…");
  });

  test("result length never exceeds maxChars", () => {
    const err = new Error("A very long error message that spans many characters");
    for (const max of [5, 10, 15, 20, 50]) {
      const result = formatErrorSummary(err, max);
      expect(result.length).toBeLessThanOrEqual(max);
    }
  });

  test("handles object with non-string message property", () => {
    expect(formatErrorSummary({ message: 123 }, 50)).toBe("Unknown error");
  });

  test("handles empty string error", () => {
    expect(formatErrorSummary("", 50)).toBe("Unknown error");
  });

  test("trims whitespace from message", () => {
    expect(formatErrorSummary(new Error("  spaced  "), 50)).toBe("spaced");
  });
});

// ---------------------------------------------------------------------------
// Barrel export (util/index.ts)
// ---------------------------------------------------------------------------

describe("util barrel export", () => {
  test("all truncate functions are exported from util/index.ts", async () => {
    const util = await import("../../apps/tui/src/util/index.js");
    expect(typeof util.truncateText).toBe("function");
    expect(typeof util.truncateLeft).toBe("function");
    expect(typeof util.wrapText).toBe("function");
  });

  test("all format functions are exported from util/index.ts", async () => {
    const util = await import("../../apps/tui/src/util/index.js");
    expect(typeof util.formatAuthConfirmation).toBe("function");
    expect(typeof util.formatErrorSummary).toBe("function");
  });

  test("all constants are exported from util/index.ts", async () => {
    const util = await import("../../apps/tui/src/util/index.js");
    const expectedConstants = [
      "MIN_COLS", "MIN_ROWS",
      "STANDARD_COLS", "STANDARD_ROWS",
      "LARGE_COLS", "LARGE_ROWS",
      "AUTH_VALIDATION_TIMEOUT_MS",
      "MAX_STACK_DEPTH",
      "LOADING_TIMEOUT_MS",
      "RETRY_DEBOUNCE_MS",
      "STATUS_BAR_CONFIRMATION_MS",
      "CRASH_LOOP_WINDOW_MS",
      "CRASH_LOOP_MAX_RESTARTS",
    ];
    for (const name of expectedConstants) {
      expect((util as Record<string, unknown>)[name]).toBeDefined();
      expect(typeof (util as Record<string, unknown>)[name]).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// TypeScript compilation
// ---------------------------------------------------------------------------

describe("util-text TypeScript compilation", () => {
  test("tsc --noEmit passes with zero errors after adding util modules", async () => {
    const { run } = await import("./helpers.js");
    const result = await run(["bun", "run", "check"]);
    if (result.exitCode !== 0) {
      console.error("tsc stderr:", result.stderr);
      console.error("tsc stdout:", result.stdout);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
});
```

---

## Test Philosophy Notes

1. **No mocking:** Tests import the actual modules and call the actual functions. No jest mocks, no dependency injection, no test doubles.

2. **Tests that fail due to unimplemented backends are left failing:** This ticket has no backend dependencies — all functions are pure. Every test should pass when the implementation is correct.

3. **Property-based assertions:** Several tests verify invariants across ranges ("result length never exceeds maxWidth") rather than single examples. This catches off-by-one errors that example-based tests miss.

4. **Compilation verification:** The last test runs `tsc --noEmit` to verify that the new modules integrate cleanly with the existing TypeScript project without type errors.

5. **Barrel export verification:** Explicit tests that all public APIs are reachable through `util/index.ts`. This catches accidental omissions from the barrel file.

---

## Productionization Notes

### Migration path for existing code

After this ticket lands, the following refactors should be filed as follow-up tickets:

1. **`src/screens/Agents/components/ToolBlock.tsx`** — Replace private `truncateToolName()` with `truncateText(name, MAX_TOOL_NAME_LENGTH)` imported from `@/util`. The `truncateContent()` function has different semantics (appends a multi-line notice, not `…`) and should remain as-is.

2. **`src/screens/Agents/utils/generateSummary.ts`** — Could internally use `truncateText()` after its newline normalization step, replacing the manual `slice(0, limit - 1) + "…"` on line 23. This is a minor DRY improvement.

3. **`src/types/breakpoint.ts`** — The `getBreakpoint()` function can import `MIN_COLS`, `MIN_ROWS`, `STANDARD_COLS`, `STANDARD_ROWS`, `LARGE_COLS`, `LARGE_ROWS` from `@/util/constants` instead of using hardcoded numbers. This makes the threshold values single-source-of-truth.

4. **`src/router/types.ts`** — The `MAX_STACK_DEPTH = 32` can be replaced with a re-export from `@/util/constants` to consolidate the definition.

### CJK / wide character support

The current implementation assumes 1 character = 1 column. For CJK text rendering where characters occupy 2 terminal columns, a future ticket should:

1. Add a `measureWidth(text: string): number` function using Unicode East Asian Width properties.
2. Update `truncateText`, `truncateLeft`, and `wrapText` to use `measureWidth` instead of `text.length`.
3. This can be done as a backward-compatible enhancement — the function signatures don't change.

This is explicitly out of scope for this ticket. The existing codebase (`generateSummary.ts`, `truncateToolName()`, `ToolBlock.tsx`) uses `string.length` uniformly, so this ticket maintains consistency.

### Performance characteristics

- `truncateText` and `truncateLeft`: O(1) — single `slice` operation.
- `wrapText`: O(n) where n = text length — single pass through words.
- `formatAuthConfirmation`: O(1) — at most 3 string constructions.
- `formatErrorSummary`: O(n) — single `replace` for newlines, then `truncateText`.

All functions are suitable for hot-path usage (e.g., called on every render cycle during terminal resize). No allocations beyond the return value.

### Module graph

```
util/index.ts
  ├── util/constants.ts    (no imports)
  ├── util/truncate.ts     (no imports)
  └── util/format.ts       (imports truncate.ts)
```

No circular dependencies. No external package imports. No side effects. All modules are tree-shakeable.
# Implementation Plan: TUI Color Capability Detection

## 1. Overview
This plan outlines the steps to implement a centralized, pure-function terminal color capability detection module for the Codeplane TUI. The module will be located at `apps/tui/src/theme/detect.ts` and will determine the terminal's color support tier (`truecolor`, `ansi256`, or `ansi16`) and Unicode capability based strictly on environment variables (`NO_COLOR`, `TERM`, `COLORTERM`). It is a zero-dependency module used by the ThemeProvider to establish semantic token resolution.

## 2. Step-by-Step Implementation

### Step 1: Create `apps/tui/src/theme/detect.ts`
Create the detection module ensuring zero React or `@opentui` dependencies. This file will expose pure functions that read exclusively from `process.env`.

**File:** `apps/tui/src/theme/detect.ts`
- Export the `ColorTier` type (`"truecolor" | "ansi256" | "ansi16"`).
- Implement `detectColorCapability()` adhering to the exact priority cascade:
  1. `NO_COLOR` (non-empty) or `TERM=dumb` -> `"ansi16"`
  2. `COLORTERM=truecolor` or `24bit` (case-insensitive) -> `"truecolor"`
  3. `TERM` contains `256color` (case-insensitive) -> `"ansi256"`
  4. Default fallback -> `"ansi256"`
- Implement `isUnicodeSupported()` which returns `false` if `TERM=dumb` or `NO_COLOR` is non-empty, and `true` otherwise.

### Step 2: Update `apps/tui/src/theme/index.ts`
Update the barrel file to re-export the types and utilities from the newly created `detect.ts` module, replacing the placeholder empty exports.

**File:** `apps/tui/src/theme/index.ts`
- Remove the existing `export {}` statement.
- Add `export { type ColorTier, detectColorCapability, isUnicodeSupported } from "./detect.js";`.
- Add `export { defaultSyntaxStyle } from "./syntaxStyle.js";`.
- Update the module documentation block to reflect the concrete module structure.

### Step 3: Implement E2E Tests in `app-shell.test.ts`
Append the comprehensive test suite (31 tests) to the existing `TUI_APP_SHELL` E2E tests. The tests verify environment variable parsing and compatibility with the existing `detectColorTier` implementation in `diff-syntax.ts`.

**File:** `e2e/tui/app-shell.test.ts`
- Add imports for `existsSync` and `join` from `node:fs` and `node:path` if not already present.
- Append the `describe("TUI_APP_SHELL — Color capability detection", () => { ... })` block exactly as specified in the engineering spec.
- Ensure the tests utilize the existing `run` and `bunEval` helpers to evaluate the pure functions in isolated Bun subprocesses with tightly controlled `env` configurations.
- Ensure the compatibility tests (`DET-COMPAT-001`, `DET-COMPAT-002`) remain completely isolated from `lib/diff-syntax.ts` implementations to prevent regressions.

## 3. Constraints & Verifications
- **Zero External Imports:** `detect.ts` must not import anything from `react` or `@opentui/core`.
- **No Refactoring of Existing Logic:** Leave `apps/tui/src/lib/diff-syntax.ts` completely untouched. The migration to use this new module will happen in a follow-up ticket.
- **Type Checking:** Run `bun run check` to verify the newly added files compile successfully without TypeScript errors.
- **Test Execution:** Execute `bun test e2e/tui/app-shell.test.ts` to confirm all 31 added color detection tests pass, utilizing subprocess isolation to prevent `process.env` leakage.
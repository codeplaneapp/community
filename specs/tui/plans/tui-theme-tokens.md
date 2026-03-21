# Implementation Plan: `tui-theme-tokens`

This document outlines the step-by-step implementation plan for defining semantic color token values across three color tiers in the Codeplane TUI.

## 1. Create Token Definitions

**Target File:** `apps/tui/src/theme/tokens.ts`

*   **Define `ThemeTokens` Interface:**
    *   Import `RGBA` from `@opentui/core`.
    *   Import `ColorTier` from `./detect.js`.
    *   Create the `ThemeTokens` interface with 12 `readonly` properties of type `RGBA`: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`, `diffAddedBg`, `diffRemovedBg`, `diffAddedText`, `diffRemovedText`, and `diffHunkHeader`.
*   **Define RGBA Constants:**
    *   Create Truecolor constants (e.g., `TC_PRIMARY`) using `RGBA.fromHex()` matching the spec.
    *   Create ANSI 256 constants (e.g., `A256_PRIMARY`) using `RGBA.fromInts(r, g, b, 255)` corresponding to the standard xterm-256color palette.
    *   Create ANSI 16 constants (e.g., `A16_PRIMARY`) using `RGBA.fromInts(r, g, b, 255)` for basic terminal colors.
*   **Create Frozen Tier Objects:**
    *   Define `TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, and `ANSI16_TOKENS` by mapping the respective constants to the `ThemeTokens` interface keys.
    *   Wrap each object in `Object.freeze()` and type them as `Readonly<ThemeTokens>`.
*   **Implement `createTheme` Factory:**
    *   Export a function `createTheme(tier: ColorTier): Readonly<ThemeTokens>`.
    *   Use a `switch` statement over `tier` to return the pre-allocated, frozen token object for the corresponding tier.
*   **Define Text Attributes:**
    *   Export a frozen `TextAttributes` object with bitwise flags: `BOLD` (1), `DIM` (2), `UNDERLINE` (4), `REVERSE` (8).
    *   Export a `TextAttribute` type derived from the values of `TextAttributes`.
*   **Implement `statusToToken` Utility:**
    *   Export types `SemanticTokenName` (`keyof ThemeTokens`) and `CoreTokenName` (excluding diff tokens).
    *   Export a function `statusToToken(status: string): CoreTokenName` containing a `switch` statement mapping standardized status strings to semantic token names, returning `'muted'` as a fallback.
*   **Export Constants:**
    *   Export `THEME_TOKEN_COUNT = 12`.

## 2. Update Theme Barrel File

**Target File:** `apps/tui/src/theme/index.ts`

*   Add an export statement to re-export the public API from `tokens.ts`:
    *   `ThemeTokens`, `SemanticTokenName`, `CoreTokenName`, `TextAttribute` (types)
    *   `TextAttributes`, `createTheme`, `statusToToken`
    *   `TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, `ANSI16_TOKENS`, `THEME_TOKEN_COUNT`

## 3. Implement E2E Tests

**Target File:** `e2e/tui/app-shell.test.ts`

*   Append a new test suite: `describe("TUI_APP_SHELL — Theme token definitions", () => { ... })`.
*   Implement the 26 specified tests using `bunEval` to interact with the pure functions and constants exposed by `tokens.ts` without requiring a full TUI launch.
    *   **Structure & Type:** Verify token count and `Float32Array` presence in `RGBA` values.
    *   **Immutability:** Verify `Object.isFrozen()` on all returned theme objects.
    *   **Identity Stability:** Verify `createTheme` returns the exact same object reference for repeated calls with the same tier.
    *   **Values:** Validate Truecolor hex conversion, ANSI 256 RGB matches against the xterm palette, and ANSI 16 basic RGB values.
    *   **`statusToToken`:** Test success, warning, error, primary mappings, case-insensitivity, and the `'muted'` fallback.
    *   **Attributes:** Verify `TextAttributes` are distinct powers of two.
    *   **Compatibility:** Check the 6 overlapping core tokens against values expected from the legacy `colors.ts` (note: `A256_MUTED` discrepancy check will be handled in a follow-up ticket).

## 4. Final Review

*   Run the E2E test suite to ensure all 26 new theme token tests pass.
*   Verify that `tokens.ts` has zero React imports and relies solely on `@opentui/core`.
*   Commit the changes under the appropriate `jj` bookmark scope (`tui-theme-tokens`).
# Implementation Plan: tui-diff-syntax-style

## Overview
This implementation plan creates the syntax highlighting style infrastructure for the TUI diff viewer. It introduces the color palette definitions, color-tier-aware palette construction, language detection, and a React hook to manage the `SyntaxStyle` instance lifecycle.

## Step 1: Create `diff-syntax.ts` (Color Palettes and Utilities)
**File**: `apps/tui/src/lib/diff-syntax.ts`
**Action**: Create a new module to handle static palette definitions and environment-based detection.
**Implementation Details**:
- Import `RGBA`, `StyleDefinition`, `SyntaxStyle`, and `pathToFiletype` from `@opentui/core`.
- Define module-level `RGBA` constants for all tokens (17 tokens × 3 tiers) to ensure they are allocated once and not dynamically per-render.
- Create three frozen static palette objects (`TRUECOLOR_PALETTE`, `ANSI256_PALETTE`, `ANSI16_PALETTE`). Each palette maps the 17 syntax tokens to their `StyleDefinition`.
- Export a `ColorTier` type (`"truecolor" | "ansi256" | "ansi16"`).
- Export a pure function `detectColorTier(): ColorTier` that checks `process.env.COLORTERM` and `process.env.TERM`.
- Export `getPaletteForTier(tier: ColorTier): Record<string, StyleDefinition>`.
- Export `resolveFiletype(apiLanguage: string | null | undefined, filePath: string): string | undefined`. Prefer the non-empty `apiLanguage`, fall back to `pathToFiletype(filePath)`, and return `undefined` otherwise.
- Export a factory function `createDiffSyntaxStyle(tier: ColorTier): SyntaxStyle` that gets the palette for the tier and calls `SyntaxStyle.fromStyles()`.

## Step 2: Create `useDiffSyntaxStyle` Hook
**File**: `apps/tui/src/hooks/useDiffSyntaxStyle.ts`
**Action**: Create a React hook to manage the lifecycle of the `SyntaxStyle` instance.
**Implementation Details**:
- Import `useMemo`, `useEffect`, and `useRef` from `react`.
- Import `SyntaxStyle` from `@opentui/core`.
- Import `createDiffSyntaxStyle`, `detectColorTier`, and `ColorTier` from `../lib/diff-syntax.js`.
- The hook signature: `export function useDiffSyntaxStyle(colorTier?: ColorTier): SyntaxStyle | null`.
- Default `tier` to `colorTier ?? detectColorTier()`.
- Use `useMemo` with `[tier]` dependency to create the `SyntaxStyle` instance. Wrap `createDiffSyntaxStyle` in a `try/catch`. If it fails, log an error (`console.error("diff.syntax.style_create_failed", err)`) and return `null`.
- Use a `useRef` to track the current `SyntaxStyle` instance.
- Add a `useEffect` cleanup block dependent on the memoized style that calls `.destroy()` on the instance if it exists, to prevent native memory leaks during unmounts and React strict mode double-renders.

## Step 3: Implement End-to-End Tests
**File**: `e2e/tui/diff.test.ts`
**Action**: Create or append to the E2E test file to verify the syntax highlighting behavior.
**Implementation Details**:
- Use `@microsoft/tui-test` for snapshot testing and keyboard interactions.
- Add test suites for "SyntaxStyle lifecycle", "keyboard interaction", "color capability tiers", "language resolution", and "edge cases" as outlined in the spec.
- **Example Tests**:
  - `SNAP-SYN-001`: Render TypeScript diff with syntax highlighting at 120x40.
  - `SNAP-SYN-011`: Render multi-language diff with per-file highlighting.
  - `KEY-SYN-001`: Verify syntax highlighting persists after view toggle (`t`).
  - `KEY-SYN-003`: Verify file navigation (`]`, `[`) applies correct filetype.
  - `RSP-SYN-004`: Verify resize preserves syntax highlighting.
  - `INT-SYN-002`: Verify path fallback when API language is null.
  - `EDGE-SYN-003`: Verify `SyntaxStyle` cleanup on screen unmount.
- Ensure that any backend interactions that are currently unimplemented are left failing, rather than skipped or commented out.

## Step 4: Track Changes with JJ
**Action**: Commit these changes to a dedicated tracking bookmark.
**Implementation Details**:
- Run `jj bookmark create tui-diff-syntax-style` to isolate this work.
- Add all newly created files in `apps/tui/src/` and `e2e/tui/` using `jj commit -m "feat(tui): add diff syntax style memoization and color palettes"`.
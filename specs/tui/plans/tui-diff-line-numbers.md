# Implementation Plan: TUI_DIFF_LINE_NUMBERS

This document outlines the step-by-step implementation for adding adaptive line number gutters with contextual backgrounds to the diff viewer, as specified in `tui-diff-line-numbers`.

## Step 1: Update Theme Tokens
**File:** `apps/tui/src/theme/tokens.ts`
- Extend the `ThemeTokens` interface to include the following properties of type `RGBA`:
  - `diffLineNumberFg`
  - `diffGutterBg`
  - `diffAddedGutterBg`
  - `diffRemovedGutterBg`
- Define Truecolor (`TC_`), ANSI 256 (`A256_`), and ANSI 16 (`A16_`) constants for these four tokens based on the spec specifications.
- Add these corresponding constants to the `TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, and `ANSI16_TOKENS` frozen objects.
- Increment `THEME_TOKEN_COUNT` from `12` to `16`.

## Step 2: Create Gutter Configuration
**File:** `apps/tui/src/screens/DiffScreen/diff-gutter-config.ts`
- Create the `DiffScreen` directory if it does not exist and create this file.
- Define and export the `GutterTier` interface (`gutterChars`, `minWidth`, `maxDisplayable`).
- Export `GUTTER_TIERS` defining mappings for `minimum` (minWidth 3), `standard` (minWidth 4), and `large` (minWidth 5).
- Export the pure functions `getGutterTier(breakpoint: Breakpoint | null): GutterTier` and `getGutterMinWidth(breakpoint: Breakpoint | null): number`.
- Export constants `GUTTER_PADDING_RIGHT = 1` and `SIGN_COLUMN_WIDTH = 2`.

## Step 3: Create `useGutterWidth` Hook
**File:** `apps/tui/src/hooks/useGutterWidth.ts`
- Create the hook consuming `useLayout()` from `apps/tui/src/hooks/useLayout.js`.
- Export the `GutterWidthResult` interface containing `minWidth`, `tier`, and `breakpointName`.
- Implement and export `useGutterWidth()` using `useMemo` keyed on the layout `breakpoint`.

**File:** `apps/tui/src/hooks/index.ts`
- Append the export for `useGutterWidth` and `GutterWidthResult`.

## Step 4: Add Diff Constants
**File:** `apps/tui/src/screens/DiffScreen/diff-constants.ts`
- Append the hex string constants to match the token semantics. These serve as non-theme code paths mapping:
  - `GUTTER_FG = "#888888"`
  - `GUTTER_BG = "#161B22"`
  - `GUTTER_ADDED_BG = "#143D14"`
  - `GUTTER_REMOVED_BG = "#3D1414"`
  - `SIGN_ADDED_COLOR = "#22C55E"`
  - `SIGN_REMOVED_COLOR = "#EF4444"`

## Step 5: Update Unified Diff Viewer (Wiring)
**File:** `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx`
- Import `useTheme` from `../../hooks/useTheme.js` and `useGutterWidth` from `../../hooks/useGutterWidth.js`.
- Inside the functional component, invoke `const theme = useTheme()` and `const { minWidth, breakpointName } = useGutterWidth()`.
- In the OpenTUI `<diff>` JSX element, attach the properties:
  - `showLineNumbers={true}`
  - `lineNumberFg={theme.diffLineNumberFg}`
  - `lineNumberBg={theme.diffGutterBg}`
  - `addedLineNumberBg={theme.diffAddedGutterBg}`
  - `removedLineNumberBg={theme.diffRemovedGutterBg}`
  - `addedSignColor={theme.diffAddedText}`
  - `removedSignColor={theme.diffRemovedText}`
- Include any defined debugging logs around the gutter state per the spec.

## Step 6: Write Pure Function Unit Tests
**File:** `apps/tui/src/screens/DiffScreen/__tests__/diff-gutter-config.test.ts`
- Create the test file utilizing `bun:test` (`describe`, `test`, `expect`).
- Implement the 10 distinct tests to validate breakpoint tier boundaries:
  - Test `getGutterMinWidth` responses for `minimum`, `standard`, `large`, and `null`.
  - Test `getGutterTier` limits and properties.
  - Test invariant logic regarding mathematical bounds of `GUTTER_TIERS`.

## Step 7: Append E2E Tests
**File:** `e2e/tui/diff.test.ts`
- Append the 5 E2E block outlines provided in the engineering spec to track the line number interactions natively via ` @microsoft/tui-test`.
  - **Snapshot Tests** (15 tests)
  - **Keyboard Interaction Tests** (13 tests)
  - **Responsive Tests** (10 tests)
  - **Data Integration Tests** (5 tests)
  - **Edge Case Tests** (8 tests)
- Leave any failures resulting from pending backend implementations in a failing state. Do not skip them.

## Definition of Done
- The four new tokens are active in the central `ThemeTokens` interface and mapped safely in 16/256/TC sets.
- Pure functions in `diff-gutter-config` are tested and passing via `bun:test`.
- `useGutterWidth` calculates dynamically on layout updates and is accessible.
- `UnifiedDiffViewer` correctly translates tokens to OpenTUI `<diff>` layer parameters.
- `bun tsc --noEmit` completes cleanly over `apps/tui/`.
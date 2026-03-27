# Implementation Plan: LabelBadge Component (tui-label-badge-component)

This document outlines the step-by-step implementation plan for the `LabelBadge` component and its supporting color utilities in the Codeplane TUI, as specified in the `tui-label-badge-component` ticket.

## 1. Create Color Utility Module
**Target File:** `apps/tui/src/util/color.ts`

- **String Width Utilities:**
  - Define Unicode ranges for CJK, Fullwidth forms, Hangul, and Emoji.
  - Implement `displayWidth(str: string): number` to correctly account for double-width characters and zero-width characters (like combining marks).
  - Instantiate a module-level `Intl.Segmenter` singleton (granularity: "grapheme") to avoid per-render allocation.
  - Implement `truncateToWidth(str: string, maxWidth: number): string` to safely truncate labels and append an ellipsis (`…`) without breaking grapheme clusters.

- **Color Luminance Utilities:**
  - Import `RGBA` from `@opentui/core`.
  - Implement `relativeLuminance(color: RGBA): number` based on the WCAG 2.1 BT.709 relative luminance formula.
  - Define `export const LUMINANCE_FLOOR = 0.15`.
  - Implement `brightenToFloor(color: RGBA, floor: number = LUMINANCE_FLOOR): RGBA` to uniformly scale dark colors and add an additive boost if scaling hits the 1.0 channel limit.

- **Palette Mapping Utilities:**
  - Define `CUBE_LEVELS` and `ANSI_16_PALETTE` constants as frozen module-level arrays.
  - Implement `nearestAnsi256(color: RGBA): RGBA` to map truecolor to the closest entry in the xterm-256 color cube or the 24-step grayscale ramp.
  - Implement `nearestAnsi16(color: RGBA): RGBA` to map truecolor to the basic 16-color ANSI palette using Euclidean distance in RGB space.

- **Color Resolution & Caching:**
  - Implement a module-level LRU cache (`Map<string, RGBA | undefined>`) bounded at 256 entries to prevent memory leaks during long-running sessions.
  - Implement the main `resolveColor(hexColor, tier, mutedFallback)` function:
    - Check for the `NO_COLOR` environment variable using a helper `isNoColor()`.
    - If `NO_COLOR` is active, return `undefined`.
    - Validate the hex format using a regex. Log a warning and return `mutedFallback` for invalid hex values.
    - For valid hex strings, parse via `RGBA.fromHex()` and run through `brightenToFloor()`.
    - Resolve the final output using a switch statement on the `tier` parameter (`truecolor`, `ansi256`, or `ansi16`).
  - Implement an exported, test-only `_resetColorCache()` function.
  - Export all public functions, constants, and types.

## 2. Create LabelBadge React Components
**Target File:** `apps/tui/src/components/LabelBadge.tsx`

- **Dependencies:**
  - Import `React`.
  - Import `useTheme` from `../hooks/useTheme.js` and `useColorTier` from `../hooks/useColorTier.js`.
  - Import `resolveColor`, `truncateToWidth`, and `displayWidth` from `../util/color.js`.

- **`<LabelBadge>` Component:**
  - Define `Label` and `LabelBadgeProps` interfaces.
  - Render a single label visually as `[label-name]`.
  - Bracket colors use `theme.muted`.
  - If `label.name` is empty or whitespace, render as `[?]` and set the color to `theme.warning`.
  - The label text uses the result of `resolveColor(label.color, tier, theme.muted)`.
  - For environments with `NO_COLOR`, omit all `fg` props (pass `undefined`) to let the terminal's default foreground take precedence.

- **Overflow Calculation Utilities:**
  - Implement `badgeDisplayWidth(label, maxWidth): number` to calculate the exact terminal columns required for a single badge, including truncation and bracket characters.
  - Implement `computeVisibleLabels(labels, maxTotalWidth, maxLabelWidth, gap): OverflowResult` using a greedy left-to-right algorithm to determine how many labels can fit while guaranteeing enough space for an overflow indicator (e.g., `+N`).

- **`<LabelBadgeList>` Component:**
  - Define `LabelBadgeListProps`.
  - Render a horizontal `<box flexDirection="row" gap={gap}>`.
  - Run `computeVisibleLabels()` on the provided array to determine `visible` badges and the `overflowCount`.
  - Map over the `visible` labels to render `<LabelBadge>` elements.
  - Conditionally append an `<text fg={noColor ? undefined : theme.muted}>+{overflowCount}</text>` if `overflowCount > 0`.
  - Export the components and helper types.

## 3. Update Barrel Exports
**Target Files:**
- `apps/tui/src/util/index.ts`:
  - Add an export statement for `displayWidth`, `truncateToWidth`, `relativeLuminance`, `brightenToFloor`, `nearestAnsi256`, `nearestAnsi16`, `resolveColor`, `LUMINANCE_FLOOR`, and `_resetColorCache` mapped to `./color.js`.
- `apps/tui/src/components/index.ts`:
  - Add an export statement for `LabelBadge`, `LabelBadgeList`, `badgeDisplayWidth`, and `computeVisibleLabels` mapped to `./LabelBadge.js`.
  - Add a type export for `Label`, `LabelBadgeProps`, `LabelBadgeListProps`, and `OverflowResult` mapped to `./LabelBadge.js`.

## 4. Implement Comprehensive Testing
**Target File:** `e2e/tui/issues.test.ts`

- **Pure Function Tests (No TUI Launch):**
  - Use `bun:test` (`describe`, `test`, `expect`).
  - Direct imports using relative paths up to `../../apps/tui/src/`.
  - Test all functions in `color.ts`: width calculation for emoji/CJK/combining characters, proper truncation without grapheme splitting, correct luminance math, fallback and NO_COLOR rules in `resolveColor`, and LRU caching behavior.
  - Remember to call `_resetColorCache()` inside a `beforeEach` block to isolate cache states.
  - Test calculation logic in `badgeDisplayWidth` and `computeVisibleLabels` against various boundary limits and edge conditions.

- **Component Snapshot & E2E Tests:**
  - Import the `launchTUI`, `TUITestInstance`, and `TERMINAL_SIZES` from `./helpers.js`.
  - Test basic label rendering in the Issue list by navigating to `g i` and verifying snapshot renders at 120x40 and 200x60 breakpoints.
  - Ensure multiple labels overflow correctly showing the `+N` indicator.
  - Emulate the minimum terminal bounds (80x24) to verify that the entire label column scales down appropriately or hides.
  - Start the TUI with `NO_COLOR=1` inside the testing helper to strictly verify that no ANSI color codes appear in the snapshot.
  - Allow tests referencing unimplemented backing endpoints or screens to fail gracefully per the Codeplane PRD requirements.

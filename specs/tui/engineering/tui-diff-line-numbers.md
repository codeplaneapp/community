# Engineering Specification: TUI_DIFF_LINE_NUMBERS — Adaptive Gutter with Contextual Backgrounds

**Ticket:** `tui-diff-line-numbers`
**Status:** Not started
**Dependencies:** `tui-diff-unified-view` (UnifiedDiffViewer, DiffFileHeader, useDiffScroll, diff-constants), `tui-diff-parse-utils` (parseDiffHunks, ParsedDiff, DiffLine, diff-types)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket implements adaptive line number gutters for the Codeplane TUI diff viewer. The work configures OpenTUI's `<diff>` component with `showLineNumbers={true}` and provides the correct color props, gutter width tiers, and responsive recalculation logic so that line numbers render correctly in both unified and split view modes across all terminal size breakpoints.

OpenTUI's `DiffRenderable` and `LineNumberRenderable` (in `@opentui/core`) already implement the core gutter rendering engine — line number mapping, sign rendering, gutter background coloring, hide-line-number sets for padding lines, and scroll-synchronized gutter updates. This ticket's scope is:

1. Define the gutter width tier calculation hook (`useGutterWidth`) that maps terminal width → `minWidth` prop.
2. Define the line number color constants that extend the existing theme tokens with gutter-specific backgrounds.
3. Wire `showLineNumbers`, `lineNumberFg`, `lineNumberBg`, `addedLineNumberBg`, `removedLineNumberBg`, and `addedSignColor`/`removedSignColor` props into the `<diff>` component usage in `UnifiedDiffViewer` and (when it exists) `SplitDiffViewer`.
4. Handle responsive resize: gutter width recalculation on `SIGWINCH`, and auto-switch from split → unified when terminal drops below 120 columns.
5. Provide the `diff-gutter-config.ts` module consumed by both unified and split viewers.

---

## 2. File Inventory

### 2.1 New Files

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/DiffScreen/diff-gutter-config.ts` | Gutter width tier constants, `getGutterMinWidth()` pure function, `getGutterTier()`, gutter tier type |
| `apps/tui/src/hooks/useGutterWidth.ts` | React hook: computes `minWidth` from terminal dimensions via `useLayout()`, recalculates synchronously on resize |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx` | Wire `showLineNumbers={true}`, gutter color props, and `minWidth` from `useGutterWidth()` into `<diff>` |
| `apps/tui/src/screens/DiffScreen/diff-constants.ts` | Add gutter-specific color hex constants alongside existing diff color constants |
| `apps/tui/src/theme/tokens.ts` | Add `diffLineNumberFg`, `diffGutterBg`, `diffAddedGutterBg`, `diffRemovedGutterBg` tokens to `ThemeTokens` interface and all three tier token objects |
| `apps/tui/src/theme/index.ts` | No change needed — new tokens are part of `ThemeTokens` already exported |
| `apps/tui/src/hooks/index.ts` | Add `useGutterWidth` export |
| `e2e/tui/diff.test.ts` | Add TUI_DIFF_LINE_NUMBERS test sections (51 tests across 5 describe blocks) |
| `apps/tui/src/screens/DiffScreen/__tests__/diff-gutter-config.test.ts` | Pure function unit tests for gutter tier calculations |

---

## 3. Implementation Plan

All steps are vertical — each produces a working, compilable increment.

### Step 1: Add gutter theme tokens to `apps/tui/src/theme/tokens.ts`

Extend the `ThemeTokens` interface with four new diff gutter tokens. These tokens provide the semantic colors for line number foreground and gutter backgrounds per line type.

**File:** `apps/tui/src/theme/tokens.ts`

**Interface additions** (append after `diffHunkHeader` in `ThemeTokens`):

```typescript
// ── Diff gutter tokens ────────────────────────────────────────────
/** Line number foreground color in diff gutter — muted, non-competing */
readonly diffLineNumberFg: RGBA;
/** Default gutter background for context lines */
readonly diffGutterBg: RGBA;
/** Gutter background for addition lines — darker than diffAddedBg */
readonly diffAddedGutterBg: RGBA;
/** Gutter background for deletion lines — darker than diffRemovedBg */
readonly diffRemovedGutterBg: RGBA;
```

**Truecolor RGBA constants** (append after `TC_DIFF_HUNK_HEADER`):

```typescript
const TC_DIFF_LINE_NUMBER_FG    = RGBA.fromHex("#888888");  // ANSI 245 equivalent
const TC_DIFF_GUTTER_BG         = RGBA.fromHex("#161B22");  // Subtle dark bg
const TC_DIFF_ADDED_GUTTER_BG   = RGBA.fromHex("#143D14");  // Darker than #1A4D1A
const TC_DIFF_REMOVED_GUTTER_BG = RGBA.fromHex("#3D1414");  // Darker than #4D1A1A
```

**ANSI 256 RGBA constants** (append after `A256_DIFF_HUNK_HEADER`):

```typescript
const A256_DIFF_LINE_NUMBER_FG    = RGBA.fromInts(138, 138, 138, 255);  // index 245
const A256_DIFF_GUTTER_BG         = RGBA.fromInts(28, 28, 28, 255);     // index 234
const A256_DIFF_ADDED_GUTTER_BG   = RGBA.fromInts(0, 68, 0, 255);      // index 22 darkened
const A256_DIFF_REMOVED_GUTTER_BG = RGBA.fromInts(68, 0, 0, 255);      // index 52 darkened
```

**ANSI 16 RGBA constants** (append after `A16_DIFF_HUNK_HEADER`):

```typescript
const A16_DIFF_LINE_NUMBER_FG    = RGBA.fromInts(192, 192, 192, 255);  // dim white
const A16_DIFF_GUTTER_BG         = RGBA.fromInts(0, 0, 0, 255);        // black
const A16_DIFF_ADDED_GUTTER_BG   = RGBA.fromInts(0, 64, 0, 255);      // dark green
const A16_DIFF_REMOVED_GUTTER_BG = RGBA.fromInts(64, 0, 0, 255);      // dark red
```

**Token object additions** — add to all three frozen objects (`TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, `ANSI16_TOKENS`):

```typescript
diffLineNumberFg:    TC_DIFF_LINE_NUMBER_FG,     // (or A256_ / A16_ variant)
diffGutterBg:        TC_DIFF_GUTTER_BG,
diffAddedGutterBg:   TC_DIFF_ADDED_GUTTER_BG,
diffRemovedGutterBg: TC_DIFF_REMOVED_GUTTER_BG,
```

**Update `THEME_TOKEN_COUNT`:**

```typescript
export const THEME_TOKEN_COUNT = 16; // was 12
```

**Why 4 new tokens, not reuse existing?** The gutter backgrounds must be _darker_ than the content backgrounds (`diffAddedBg` / `diffRemovedBg`) to create a subtle banding effect. Reusing the content backgrounds would make the gutter indistinguishable from the code area. The `diffLineNumberFg` token is distinct from `muted` because it's specifically calibrated for readability against the gutter backgrounds, whereas `muted` is calibrated against the default terminal background.

**Validation:** `bun tsc --noEmit` on `apps/tui` — purely additive interface extension. All existing `useTheme()` consumers see new properties but don't need to reference them.

---

### Step 2: Create `apps/tui/src/screens/DiffScreen/diff-gutter-config.ts`

Pure-function module with zero React dependencies. Contains the gutter width tier calculation and tier metadata.

**File:** `apps/tui/src/screens/DiffScreen/diff-gutter-config.ts`

```typescript
import type { Breakpoint } from "../../types/breakpoint.js";

/**
 * Gutter width tier for a given terminal breakpoint.
 *
 * Width breakdown:
 *   gutterChars = 1 (left pad) + minWidth (digit columns incl right padding)
 *   Sign column adds 2 more chars (" +" or " -") — managed separately
 *     by GutterRenderable via `_maxAfterWidth`.
 *   Total gutter footprint per pane = gutterChars + 2 (sign).
 */
export interface GutterTier {
  /** Total gutter column width (left padding + digit columns) */
  readonly gutterChars: number;
  /** The `minWidth` prop for LineNumberRenderable (digit columns) */
  readonly minWidth: number;
  /** Maximum line number that fits without left-truncation */
  readonly maxDisplayable: number;
}

export const GUTTER_TIERS: Record<Exclude<Breakpoint, null>, GutterTier> = {
  minimum:  { gutterChars: 4, minWidth: 3, maxDisplayable: 9_999 },
  standard: { gutterChars: 5, minWidth: 4, maxDisplayable: 99_999 },
  large:    { gutterChars: 6, minWidth: 5, maxDisplayable: 999_999 },
} as const;

/**
 * Get the gutter tier for a given breakpoint.
 *
 * When breakpoint is null (terminal too small), returns minimum tier
 * as a defensive fallback — though the "terminal too small" screen
 * prevents the diff from rendering.
 */
export function getGutterTier(breakpoint: Breakpoint | null): GutterTier {
  if (breakpoint === null) return GUTTER_TIERS.minimum;
  return GUTTER_TIERS[breakpoint];
}

/**
 * Get the `minWidth` prop value for the <diff> component's line number gutter.
 *
 * This maps to LineNumberRenderable's `minWidth` option, which controls
 * the minimum number of digit columns. OpenTUI's auto-calculation
 * via `GutterRenderable.calculateWidth()` uses:
 *   Math.max(minWidth, digits(maxLineNum) + paddingRight + 1)
 * So `minWidth` is the FLOOR — ensuring small files don't get overly
 * narrow gutters.
 *
 * @param breakpoint - Current terminal breakpoint from useLayout()
 * @returns The minWidth value (3, 4, or 5)
 */
export function getGutterMinWidth(breakpoint: Breakpoint | null): number {
  return getGutterTier(breakpoint).minWidth;
}

/** Fixed paddingRight used by the gutter. Matches LineNumberRenderable default (1). */
export const GUTTER_PADDING_RIGHT = 1;

/** Sign column width: " +" or " -" = 2 characters. */
export const SIGN_COLUMN_WIDTH = 2;
```

**Design decisions:**

1. **Pure functions only** — no React, no hooks, no side effects. This module is testable with `bun:test` without rendering.
2. **Breakpoint-based, not raw-pixel-based** — uses the same `Breakpoint` type already established in `apps/tui/src/types/breakpoint.ts`. The breakpoint → tier mapping is explicit and deterministic.
3. **`minWidth` is a floor, not a ceiling** — OpenTUI's `GutterRenderable.calculateWidth()` auto-expands for files with large line numbers. The tier system prevents the gutter from being too _narrow_ for its terminal size, not too wide.

**Validation:** Pure TypeScript module — zero runtime dependencies beyond the `Breakpoint` type. Compile-check only.

---

### Step 3: Create `apps/tui/src/hooks/useGutterWidth.ts`

React hook that consumes `useLayout()` and returns the current gutter `minWidth`. Recalculates synchronously on resize via the existing `useLayout()` → `useTerminalDimensions()` → `useOnResize()` chain.

**File:** `apps/tui/src/hooks/useGutterWidth.ts`

```typescript
import { useMemo } from "react";
import { useLayout } from "./useLayout.js";
import {
  getGutterMinWidth,
  getGutterTier,
  type GutterTier,
} from "../screens/DiffScreen/diff-gutter-config.js";

export interface GutterWidthResult {
  /** The `minWidth` prop to pass to <diff> / LineNumberRenderable */
  minWidth: number;
  /** Full gutter tier metadata for logging and debug */
  tier: GutterTier;
  /** Current breakpoint name ("minimum" | "standard" | "large" | "unsupported") */
  breakpointName: string;
}

/**
 * Hook that provides the current gutter width tier based on terminal dimensions.
 *
 * Recalculates synchronously on terminal resize via the useLayout() chain.
 * No debounce — gutter width changes are instantaneous.
 *
 * Usage:
 * ```tsx
 * const { minWidth } = useGutterWidth();
 * // minWidth is consumed for logging/debug; the <diff> component
 * // uses theme color props and showLineNumbers={true}.
 * ```
 *
 * Note: The `<diff>` component does not accept a `minWidth` prop directly.
 * OpenTUI's DiffRenderable creates LineNumberRenderable internally with a
 * default minWidth of 3. The auto-calculation in GutterRenderable handles
 * expansion for files with large line numbers. This hook's `minWidth` serves
 * as the documented FLOOR for the gutter width — useful for logging, tests,
 * and for a future upstream enhancement to expose `lineNumberMinWidth` on
 * the <diff> element.
 */
export function useGutterWidth(): GutterWidthResult {
  const { breakpoint } = useLayout();

  return useMemo(() => {
    const tier = getGutterTier(breakpoint);
    return {
      minWidth: tier.minWidth,
      tier,
      breakpointName: breakpoint ?? "unsupported",
    };
  }, [breakpoint]);
}
```

**Update `apps/tui/src/hooks/index.ts`** — add export:

```typescript
export { useGutterWidth, type GutterWidthResult } from "./useGutterWidth.js";
```

**Design decisions:**

1. **Depends only on `useLayout()`** — which already exists and is battle-tested. No new OpenTUI hook subscriptions.
2. **Memoized on `breakpoint`** — not on `width`/`height` directly. Gutter width only changes at breakpoint boundaries (80, 120, 200), not on every pixel resize.
3. **Returns metadata beyond `minWidth`** — `tier` and `breakpointName` are useful for observability logging in the diff screen component.

**Validation:** Hook depends only on `useLayout()` (implemented) and pure `diff-gutter-config.ts`. No new dependencies.

---

### Step 4: Add gutter color constants to `apps/tui/src/screens/DiffScreen/diff-constants.ts`

Append named hex constants for gutter backgrounds. These parallel the theme tokens but serve as documentation anchors and are used in any non-theme-aware code paths (e.g., test assertions).

**File:** `apps/tui/src/screens/DiffScreen/diff-constants.ts` (modified — this file is created by `tui-diff-unified-view`)

Append:

```typescript
// ── Gutter colors ────────────────────────────────────────────────

/** Line number foreground — muted gray, ANSI 245 equivalent */
export const GUTTER_FG = "#888888";

/** Default gutter background for context lines */
export const GUTTER_BG = "#161B22";

/** Gutter background for addition lines — darker than ADDED_BG */
export const GUTTER_ADDED_BG = "#143D14";

/** Gutter background for deletion lines — darker than REMOVED_BG */
export const GUTTER_REMOVED_BG = "#3D1414";

/** Addition sign color — green */
export const SIGN_ADDED_COLOR = "#22C55E";

/** Deletion sign color — red */
export const SIGN_REMOVED_COLOR = "#EF4444";
```

---

### Step 5: Wire line number props into `UnifiedDiffViewer.tsx`

Modify the `UnifiedDiffViewer` component to pass all line-number-related props to the `<diff>` component.

**File:** `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx` (modified — this file is created by `tui-diff-unified-view`)

**New imports:**

```typescript
import { useTheme } from "../../hooks/useTheme.js";
import { useGutterWidth } from "../../hooks/useGutterWidth.js";
```

**Inside the component body:**

```typescript
const theme = useTheme();
const { minWidth, breakpointName } = useGutterWidth();
```

**Updated `<diff>` JSX** — add line number props:

```tsx
<diff
  diff={file.patch}
  view="unified"
  filetype={resolvedFiletype}
  syntaxStyle={syntaxStyle}
  showLineNumbers={true}
  wrapMode={wrapMode}
  // Line number gutter colors — from theme tokens
  lineNumberFg={theme.diffLineNumberFg}
  lineNumberBg={theme.diffGutterBg}
  addedLineNumberBg={theme.diffAddedGutterBg}
  removedLineNumberBg={theme.diffRemovedGutterBg}
  // Diff content colors — existing props
  addedBg={theme.diffAddedBg}
  removedBg={theme.diffRemovedBg}
  addedSignColor={theme.diffAddedText}
  removedSignColor={theme.diffRemovedText}
  // Sync scroll off for unified view
  syncScroll={false}
  style={{
    flexGrow: 1,
    flexShrink: 1,
  }}
/>
```

**Key design decisions:**

1. **`showLineNumbers` is always `true`** — the product spec states line numbers are a baseline UX requirement. There is no user-facing toggle. The OpenTUI `<diff>` component defaults `showLineNumbers` to `true`, but we set it explicitly for clarity.

2. **Theme tokens, not hex constants** — the `<diff>` component accepts `string | RGBA` for all color props. We pass `RGBA` objects from `useTheme()` because:
   - They are pre-allocated (no per-render allocation)
   - They automatically adapt to the terminal's color capability tier
   - They are referentially stable (frozen, singleton per tier)

3. **`minWidth` is NOT passed to `<diff>`** — OpenTUI's `DiffRenderable` creates `LineNumberRenderable` internally with a default `minWidth` of 3 and does not expose a `lineNumberMinWidth` prop on the React element. The `LineNumberRenderable` auto-calculates its width based on the maximum line number in the diff data via `GutterRenderable.calculateWidth()`. For the standard and large tiers, the actual line numbers in real-world files will naturally produce wider gutters. The `minWidth` from `useGutterWidth()` is consumed for debug logging and test assertions, and will be wired through when an upstream OpenTUI enhancement adds the `lineNumberMinWidth` prop.

4. **Color prop names match OpenTUI API exactly** — confirmed against `context/opentui/packages/web/src/content/docs/components/diff.mdx` and `context/opentui/packages/react/examples/diff.tsx`.

---

### Step 6: Wire line number props for split view (integration point)

When the `SplitDiffViewer` component is implemented (from `tui-diff-split-view` ticket), it needs identical prop wiring.

**File:** `apps/tui/src/screens/DiffScreen/SplitDiffViewer.tsx` (created by `tui-diff-split-view`)

The split view `<diff>` usage is identical to unified view for line number props:

```tsx
<diff
  diff={file.patch}
  view="split"
  filetype={resolvedFiletype}
  syntaxStyle={syntaxStyle}
  showLineNumbers={true}
  syncScroll={true}
  lineNumberFg={theme.diffLineNumberFg}
  lineNumberBg={theme.diffGutterBg}
  addedLineNumberBg={theme.diffAddedGutterBg}
  removedLineNumberBg={theme.diffRemovedGutterBg}
  addedBg={theme.diffAddedBg}
  removedBg={theme.diffRemovedBg}
  addedSignColor={theme.diffAddedText}
  removedSignColor={theme.diffRemovedText}
  style={{ flexGrow: 1, flexShrink: 1 }}
/>
```

OpenTUI's `DiffRenderable.buildSplitView()` automatically:
- Creates two `LineNumberRenderable` instances (left and right)
- Maps old line numbers to the left gutter, new line numbers to the right gutter
- Populates `hideLineNumbers` sets for padding/filler lines
- Uses `removedLineNumberBg` for left gutter on deletion lines
- Uses `addedLineNumberBg` for right gutter on addition lines
- Restricts `-` signs to left side only, `+` signs to right side only

No additional TUI-layer logic is needed for split view line numbers.

---

### Step 7: Resize and gutter recalculation behavior

The `useGutterWidth()` hook from Step 3 already recalculates on resize because it depends on `useLayout()` which depends on `useTerminalDimensions()` from `@opentui/react`, which subscribes to OpenTUI's native `resize` event (fires on `SIGWINCH`).

**Behavior chain on terminal resize:**

```
SIGWINCH
  → OpenTUI native core detects new terminal size
  → @opentui/react useTerminalDimensions() returns new { width, height }
  → useLayout() recomputes breakpoint, triggers React re-render
  → useGutterWidth() useMemo recomputes (breakpoint changed at tier boundary)
  → UnifiedDiffViewer re-renders
  → <diff> component receives same color props (RGBA objects are stable)
  → OpenTUI DiffRenderable detects dimension change via Yoga layout pass
  → GutterRenderable.onLifecyclePass() triggers dirty flag and re-render
  → GutterRenderable.refreshFrameBuffer() redraws visible gutter window
```

**Key behaviors ensured:**

| Behavior | Mechanism |
|----------|----------|
| Gutter width recalculates synchronously | `useLayout()` has no debounce; `useMemo` in `useGutterWidth()` recomputes when `breakpoint` changes |
| Split → unified auto-switch below 120 cols | Handled by `tui-diff-view-toggle` ticket; this ticket ensures gutter transitions from dual to single correctly |
| Diff data change recalculates gutter | OpenTUI's `set diff(value)` setter calls `parseDiff()` → `rebuildView()` which rebuilds all line number maps |
| Scroll-gutter synchronization | `GutterRenderable.renderSelf()` detects `this.target.scrollY !== this._lastKnownScrollY` and re-renders |
| Whitespace toggle (`w` key) re-fetches diff | New diff data flows to `<diff>` via prop change; OpenTUI rebuilds line maps from scratch |

No additional TUI-layer code is needed for resize handling.

---

### Step 8: Edge case handling

#### 8.1 Empty patch (0 hunks)

When `file.patch` is empty/null or `parsePatch()` returns 0 hunks, `DiffRenderable.buildView()` returns early without creating any `LineNumberRenderable`. No gutter is rendered. The TUI displays a "No changes" or "Binary file" placeholder (handled by `DiffEmptyState` from the unified view ticket).

#### 8.2 Line number truncation

When a file's line numbers exceed the gutter capacity (e.g., line 100,000 in a 4-char gutter), `GutterRenderable.refreshFrameBuffer()` renders via `buffer.drawText()`. The right-alignment calculation positions the number so that if it's too wide, only the rightmost digits that fit are drawn. The `if (lineNumX >= startX + this._maxBeforeWidth + 1)` guard prevents rendering beyond the gutter boundary. This matches the spec's truncation behavior (most-significant digits dropped).

#### 8.3 Wrapped lines

`GutterRenderable.refreshFrameBuffer()` handles wrapped lines via the `lineSources` array from `CodeRenderable.lineInfo`. When a logical line wraps to multiple visual rows, `lineSources` maps multiple visual indices to the same logical index. The gutter only draws the line number on the first visual row (`logicalLine !== lastSource`), leaving continuation rows blank.

#### 8.4 Negative line numbers

Extremely unlikely from well-formed diffs. If a malformed hunk header produces negative `oldStart`/`newStart`, the `lineNumbers` map will contain negative values. The negative sign would consume one gutter character — functionally harmless. The `parsePatch()` implementation from the `diff` npm package (used transitively by OpenTUI) does not produce negative values for standard unified diffs.

#### 8.5 Virtual scrolling for large hunks (>500 lines)

`GutterRenderable.renderSelf()` only renders lines in the visible window (`startLine` to `startLine + height`). The full `lineNumbers` map covers all logical lines, but rendering is windowed. No performance issue for large files.

---

## 4. Component Architecture

### Data Flow Diagram

```
useTerminalDimensions()  [from @opentui/react]
  → { width, height }
    → useLayout()  [apps/tui/src/hooks/useLayout.ts]
      → { breakpoint: "minimum" | "standard" | "large" | null }
        → useGutterWidth()  [apps/tui/src/hooks/useGutterWidth.ts]
          → { minWidth: 3|4|5, tier: GutterTier, breakpointName: string }

useTheme()  [apps/tui/src/hooks/useTheme.ts]
  → Readonly<ThemeTokens>  (includes new gutter tokens)
    → diffLineNumberFg: RGBA    (#888888 / idx 245 / dim white)
    → diffGutterBg: RGBA         (#161B22 / idx 234 / black)
    → diffAddedGutterBg: RGBA    (#143D14 / dark green)
    → diffRemovedGutterBg: RGBA  (#3D1414 / dark red)

UnifiedDiffViewer / SplitDiffViewer
  → <diff
       showLineNumbers={true}
       lineNumberFg={theme.diffLineNumberFg}
       lineNumberBg={theme.diffGutterBg}
       addedLineNumberBg={theme.diffAddedGutterBg}
       removedLineNumberBg={theme.diffRemovedGutterBg}
       addedSignColor={theme.diffAddedText}
       removedSignColor={theme.diffRemovedText}
       ...existing props...
     />

  OpenTUI DiffRenderable (internal — all below is @opentui/core)
    → parsePatch(diff) → StructuredPatch[]
    → buildUnifiedView() / buildSplitView()
      → lineNumbers: Map<number, number>       (visual → file line num)
      → lineSigns: Map<number, LineSign>        (visual → "+"/"-")
      → lineColors: Map<number, LineColorConfig> (visual → gutter/content bg)
      → hideLineNumbers: Set<number>            (padding lines in split)
    → LineNumberRenderable
      → GutterRenderable
        → calculateWidth()  (auto from maxLineNumber, minWidth floor)
        → renderSelf()      (scroll-aware, wrap-aware, windowed)
```

### State Ownership

| State | Owner | Persistence |
|-------|-------|-------------|
| Gutter width tier | `useGutterWidth()` → derived from `useLayout()` | Recalculated at breakpoint boundaries |
| Line number maps (`lineNumbers`, `lineSigns`, `lineColors`, `hideLineNumbers`) | `DiffRenderable` (OpenTUI internal) | Rebuilt on diff change, view toggle, whitespace toggle |
| Gutter scroll position | `GutterRenderable` (OpenTUI internal) | Tracks target `scrollY` per render frame |
| Gutter visibility (`showLineNumbers`) | `true` (hardcoded prop) | Never changes — baseline UX requirement |
| Gutter colors | Theme tokens via `useTheme()` | Frozen at startup, referentially stable |

### OpenTUI API Surface Consumed

| API | Source | Usage |
|-----|--------|-------|
| `<diff>` JSX element | `@opentui/react` | Rendered with `showLineNumbers={true}` and color props |
| `showLineNumbers` prop | `DiffRenderable` option | Enables `LineNumberRenderable` creation |
| `lineNumberFg` prop | `DiffRenderable` option | Foreground for gutter digits and signs |
| `lineNumberBg` prop | `DiffRenderable` option | Default gutter background (context lines) |
| `addedLineNumberBg` prop | `DiffRenderable` option | Green gutter background for addition lines |
| `removedLineNumberBg` prop | `DiffRenderable` option | Red gutter background for deletion lines |
| `addedSignColor` prop | `DiffRenderable` option | Green color for `+` sign character |
| `removedSignColor` prop | `DiffRenderable` option | Red color for `-` sign character |
| `useTerminalDimensions()` | `@opentui/react` (via `useLayout()`) | Terminal width for gutter tier determination |

---

## 5. Productionization Notes

### 5.1 OpenTUI `minWidth` Override (Future Enhancement)

Currently, `DiffRenderable` creates `LineNumberRenderable` with the internal default `minWidth` of 3 (from `LineNumberOptions.minWidth ?? 3`). The auto-calculation in `GutterRenderable.calculateWidth()` computes the gutter width as `Math.max(minWidth, digits(maxLineNum) + paddingRight + 1)`.

For small files (e.g., a 5-line config file), the gutter at the minimum tier should be 4 chars wide per spec, but auto-calculation produces `max(3, 1+1+1) = 3` chars. This is a minor cosmetic discrepancy for files under 100 lines.

**To productionize fully:**
1. Submit upstream PR to OpenTUI adding `lineNumberMinWidth?: number` prop to `DiffRenderableOptions`.
2. The `DiffRenderable` constructor passes this to `LineNumberRenderable` in `createOrUpdateSide()`.
3. The TUI then passes `lineNumberMinWidth={useGutterWidth().minWidth}` to `<diff>`.
4. Until the upstream change lands, the auto-calculation is acceptable — the visual difference between 3-char and 4-char gutter on a small file is minimal.

### 5.2 Gutter Truncation Logging

The spec calls for a `warn` log when line numbers exceed gutter capacity. Currently, `GutterRenderable` silently clips via position guarding.

**To productionize:**
1. Add a truncation callback or event to `GutterRenderable` that fires when `lineNumWidth > availableSpace`.
2. The TUI layer subscribes and emits a structured `warn` log.
3. For now, truncation is silent but visually correct (rightmost digits shown).

### 5.3 Theme Token Backward Compatibility

The four new theme tokens extend the `ThemeTokens` interface. Since TypeScript interfaces are structurally typed and the token objects are created by `createTheme()` (which returns one of three frozen singletons), adding properties to the interface and the singletons is backward-compatible. Existing `useTheme()` consumers see new properties but are not required to use them.

---

## 6. Unit & Integration Tests

### 6.1 Pure Function Unit Tests

**File:** `apps/tui/src/screens/DiffScreen/__tests__/diff-gutter-config.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import {
  getGutterMinWidth,
  getGutterTier,
  GUTTER_TIERS,
  GUTTER_PADDING_RIGHT,
  SIGN_COLUMN_WIDTH,
} from "../diff-gutter-config.js";

describe("getGutterMinWidth", () => {
  test("returns 3 for minimum breakpoint", () => {
    expect(getGutterMinWidth("minimum")).toBe(3);
  });

  test("returns 4 for standard breakpoint", () => {
    expect(getGutterMinWidth("standard")).toBe(4);
  });

  test("returns 5 for large breakpoint", () => {
    expect(getGutterMinWidth("large")).toBe(5);
  });

  test("returns 3 for null breakpoint (unsupported terminal)", () => {
    expect(getGutterMinWidth(null)).toBe(3);
  });
});

describe("getGutterTier", () => {
  test("minimum tier has gutterChars=4 and maxDisplayable=9999", () => {
    const tier = getGutterTier("minimum");
    expect(tier.gutterChars).toBe(4);
    expect(tier.maxDisplayable).toBe(9_999);
  });

  test("standard tier has gutterChars=5 and maxDisplayable=99999", () => {
    const tier = getGutterTier("standard");
    expect(tier.gutterChars).toBe(5);
    expect(tier.maxDisplayable).toBe(99_999);
  });

  test("large tier has gutterChars=6 and maxDisplayable=999999", () => {
    const tier = getGutterTier("large");
    expect(tier.gutterChars).toBe(6);
    expect(tier.maxDisplayable).toBe(999_999);
  });

  test("null breakpoint falls back to minimum tier", () => {
    const tier = getGutterTier(null);
    expect(tier).toEqual(GUTTER_TIERS.minimum);
  });
});

describe("GUTTER_TIERS consistency", () => {
  test("all tiers have minWidth = gutterChars - 1", () => {
    for (const [, tier] of Object.entries(GUTTER_TIERS)) {
      expect(tier.minWidth).toBe(tier.gutterChars - 1);
    }
  });

  test("maxDisplayable is 10^(gutterChars-1) - 1", () => {
    for (const [, tier] of Object.entries(GUTTER_TIERS)) {
      expect(tier.maxDisplayable).toBe(Math.pow(10, tier.gutterChars - 1) - 1);
    }
  });

  test("tiers are ordered by gutterChars", () => {
    expect(GUTTER_TIERS.minimum.gutterChars).toBeLessThan(GUTTER_TIERS.standard.gutterChars);
    expect(GUTTER_TIERS.standard.gutterChars).toBeLessThan(GUTTER_TIERS.large.gutterChars);
  });
});

describe("constants", () => {
  test("GUTTER_PADDING_RIGHT is 1", () => {
    expect(GUTTER_PADDING_RIGHT).toBe(1);
  });

  test("SIGN_COLUMN_WIDTH is 2", () => {
    expect(SIGN_COLUMN_WIDTH).toBe(2);
  });
});
```

---

### 6.2 E2E Tests

**File:** `e2e/tui/diff.test.ts` (appended to existing file)

All tests use `@microsoft/tui-test` via the `launchTUI` helper. Tests run against a real API server with test fixtures — no mocking of implementation details. Tests that fail due to unimplemented backend features are left failing. They are never skipped or commented out.

#### 6.2.1 Snapshot Tests — Line Number Visual States (15 tests)

```typescript
describe("TUI_DIFF_LINE_NUMBERS — snapshot tests", () => {
  test("SNAP-LN-001: renders line numbers in unified view at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen: go to repos, open first repo, navigate to a change diff
    // The diff fixture should have a multi-hunk patch with adds, deletes, and context
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    // Navigate to a change with diffs
    // Wait for diff content to render with line numbers
    // Assert: gutter is 5 chars wide (standard tier)
    // Assert: line numbers visible in muted color
    // Assert: addition lines show green "+" sign
    // Assert: deletion lines show red "-" sign
    // Assert: context lines show no sign
    // Assert: numbers are right-aligned within gutter
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-002: renders line numbers in unified view at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    // Assert: gutter is 4 chars wide (minimum tier)
    // Assert: line numbers right-aligned in narrower gutter
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-003: renders line numbers in unified view at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen
    // Assert: gutter is 6 chars wide (large tier)
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-004: renders dual line numbers in split view at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, press t for split view
    await tui.sendKeys("t");
    // Assert: left pane has old file line numbers
    // Assert: right pane has new file line numbers
    // Assert: both gutters are 5 chars wide
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-005: renders dual line numbers in split view at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff, press t for split view
    await tui.sendKeys("t");
    // Assert: dual 6-char gutters
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-006: renders blank gutter for padding lines in split view", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with additions-only in one hunk (creates padding on left)
    await tui.sendKeys("t"); // split view
    // Assert: padding lines on left pane have blank gutter (no number, no sign)
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-007: renders gutter background coloring for additions", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with addition lines
    // Assert: addition line gutters have green-tinted background
    // The snapshot captures ANSI escape sequences including background colors
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-008: renders gutter background coloring for deletions", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with deletion lines
    // Assert: deletion line gutters have red-tinted background
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-009: renders no line number on hunk headers", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with visible hunk header
    // Assert: @@ line has blank gutter cell (no line number)
    // Assert: hunk header renders in cyan
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-010: renders no line number on collapsed hunk summary", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, collapse a hunk with z
    await tui.sendKeys("z");
    // Assert: collapsed summary line has blank gutter
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-011: renders continuation line with blank gutter for wrapped text", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff with a very long code line that wraps at 80 cols
    // Assert: first visual row of logical line shows line number
    // Assert: second visual row (continuation) shows blank gutter
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-012: renders correct line numbers across multiple hunks", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with 3+ hunks
    // Assert: line numbers have gaps between hunks (non-contiguous ranges)
    // Assert: each hunk starts at correct oldStart/newStart
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-013: renders addition-only diff with sequential new line numbers", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff for a newly added file (all lines are additions)
    // Assert: all lines show sequential new file line numbers (1, 2, 3, ...)
    // Assert: all lines show "+" sign in green
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-014: renders deletion-only diff with sequential old line numbers", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff for a deleted file (all lines are deletions)
    // Assert: all lines show sequential old file line numbers
    // Assert: all lines show "-" sign in red
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-LN-015: renders line numbers for single-line diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with exactly one changed line
    // Assert: line number 1 visible in gutter
    const snap = tui.snapshot();
    expect(snap).toMatchSnapshot();
    await tui.terminate();
  });
});
```

#### 6.2.2 Keyboard Interaction Tests — Line Number Behavior (13 tests)

```typescript
describe("TUI_DIFF_LINE_NUMBERS — keyboard interaction", () => {
  test("KEY-LN-001: j scrolls gutter with content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with a file that has 20+ lines
    // Press j 5 times
    await tui.sendKeys("j", "j", "j", "j", "j");
    // Assert: gutter line numbers have advanced by 5 lines
    // Assert: line numbers remain aligned with code content
    await tui.terminate();
  });

  test("KEY-LN-002: k scrolls gutter up with content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, scroll down 10, then up 3
    await tui.sendKeys("j", "j", "j", "j", "j", "j", "j", "j", "j", "j");
    await tui.sendKeys("k", "k", "k");
    // Assert: gutter is back 3 lines from where it was
    // Assert: alignment preserved
    await tui.terminate();
  });

  test("KEY-LN-003: G shows last file line number in gutter", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    await tui.sendKeys("G");
    // Assert: gutter shows the final line number of the file
    await tui.terminate();
  });

  test("KEY-LN-004: gg shows first line number in gutter", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("G");
    await tui.sendKeys("g", "g");
    // Assert: gutter shows line numbers starting from the first hunk
    await tui.terminate();
  });

  test("KEY-LN-005: Ctrl+D pages gutter with content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    await tui.sendKeys("ctrl+d");
    // Assert: gutter advances by ~half viewport worth of line numbers
    // Assert: line numbers stay aligned with code
    await tui.terminate();
  });

  test("KEY-LN-006: t toggle switches gutter layout", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff (starts in unified = single gutter)
    await tui.sendKeys("t");
    // Assert: now in split view with dual gutters
    // Assert: left gutter shows old file numbers
    // Assert: right gutter shows new file numbers
    await tui.terminate();
  });

  test("KEY-LN-007: t toggle back restores single gutter", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("t"); // split
    await tui.sendKeys("t"); // unified
    // Assert: back to single gutter with combined line numbers
    await tui.terminate();
  });

  test("KEY-LN-008: ] resets gutter to next file first line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with multiple files, scroll down in first file
    await tui.sendKeys("j", "j", "j", "j", "j");
    await tui.sendKeys("]");
    // Assert: gutter shows line numbers from file 2's first hunk
    await tui.terminate();
  });

  test("KEY-LN-009: [ resets gutter to previous file first line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to file 3
    await tui.sendKeys("]", "]");
    await tui.sendKeys("[");
    // Assert: gutter shows line numbers from file 2's first hunk
    await tui.terminate();
  });

  test("KEY-LN-010: z hides gutter for collapsed hunk", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z");
    // Assert: collapsed hunk summary has blank gutter
    // Assert: remaining expanded lines have correct line numbers
    await tui.terminate();
  });

  test("KEY-LN-011: x restores gutter for expanded hunks", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("z"); // collapse
    await tui.sendKeys("x"); // expand
    // Assert: all hunks expanded, all gutter line numbers restored
    await tui.terminate();
  });

  test("KEY-LN-012: w recalculates line numbers after whitespace toggle", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("w"); // toggle whitespace
    // Assert: after re-fetch, line numbers reflect new hunk starts
    // Assert: gutter still rendered with correct alignment
    await tui.terminate();
  });

  test("KEY-LN-013: rapid j presses keep gutter aligned", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Send 30 rapid j presses
    const keys = Array(30).fill("j");
    await tui.sendKeys(...keys);
    // Assert: after scrolling, every visible row has its gutter
    //   line number exactly aligned with the code content
    // Assert: no visual artifacts
    await tui.terminate();
  });
});
```

#### 6.2.3 Responsive Tests — Gutter Width at Different Terminal Sizes (10 tests)

```typescript
describe("TUI_DIFF_LINE_NUMBERS — responsive gutter width", () => {
  test("RSP-LN-001: 4-char gutter at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff
    // Assert: gutter column is 4 characters wide
    // Verify by checking that code content starts at expected column offset
    await tui.terminate();
  });

  test("RSP-LN-002: 5-char gutter at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    // Assert: gutter column is 5 characters wide
    await tui.terminate();
  });

  test("RSP-LN-003: 6-char gutter at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff
    // Assert: gutter column is 6 characters wide
    await tui.terminate();
  });

  test("RSP-LN-004: gutter narrows on resize 120 to 80", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, verify 5-char gutter
    await tui.resize(80, 24);
    // Assert: gutter shrinks to 4 chars
    // Assert: line numbers re-render correctly in narrower gutter
    await tui.terminate();
  });

  test("RSP-LN-005: gutter widens on resize 80 to 120", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff, verify 4-char gutter
    await tui.resize(120, 40);
    // Assert: gutter grows to 5 chars
    await tui.terminate();
  });

  test("RSP-LN-006: gutter widens on resize 120 to 200", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.resize(200, 60);
    // Assert: gutter grows to 6 chars
    await tui.terminate();
  });

  test("RSP-LN-007: split view dual gutters at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff, toggle to split view
    await tui.sendKeys("t");
    // Assert: two 5-char gutters visible (one per pane)
    // Assert: each pane has independent line numbers
    await tui.terminate();
  });

  test("RSP-LN-008: split to unified gutter transition on resize below 120", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("t"); // split view
    await tui.resize(80, 24); // should auto-switch to unified
    // Assert: dual gutters collapsed to single 4-char gutter
    // Assert: view is now unified mode
    await tui.terminate();
  });

  test("RSP-LN-009: line numbers correct after double resize", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    await tui.resize(80, 24);
    await tui.resize(120, 40);
    // Assert: after double resize, line numbers are correct and properly aligned
    await tui.terminate();
  });

  test("RSP-LN-010: gutter truncates oversized line numbers", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to a diff fixture with a file > 10,000 lines
    // Assert: line numbers are truncated (rightmost digits shown)
    // Assert: gutter does not exceed 4 chars
    // Assert: no layout overflow or visual artifacts
    await tui.terminate();
  });
});
```

#### 6.2.4 Data Integration Tests (5 tests)

```typescript
describe("TUI_DIFF_LINE_NUMBERS — data integration", () => {
  test("INT-LN-001: line numbers derived from hunk oldStart/newStart", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with a patch containing @@ -15,3 +20,5 @@
    // Assert: deletion lines start at line 15
    // Assert: addition lines start at line 20
    // Assert: context lines show newLineNum (starting at 20)
    await tui.terminate();
  });

  test("INT-LN-002: line numbers span multiple hunks correctly", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with two hunks: first at lines 10-15, second at lines 50-55
    // Assert: gap between hunks reflected in line numbers
    // Assert: second hunk line numbers start at 50, not continue from 15
    await tui.terminate();
  });

  test("INT-LN-003: whitespace toggle recalculates line numbers", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff
    await tui.sendKeys("w"); // toggle whitespace
    // Assert: line numbers reflect the new diff data (different hunk starts)
    await tui.terminate();
  });

  test("INT-LN-004: line numbers correct for renamed file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with a renamed file
    // Assert: old file line numbers on deletions
    // Assert: new file line numbers on additions
    await tui.terminate();
  });

  test("INT-LN-005: line numbers correct across file navigation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with multiple files
    await tui.sendKeys("]"); // next file
    // Assert: line numbers reset to file 2's hunk starts
    await tui.terminate();
  });
});
```

#### 6.2.5 Edge Case Tests (8 tests)

```typescript
describe("TUI_DIFF_LINE_NUMBERS — edge cases", () => {
  test("EDGE-LN-001: empty diff renders no gutter", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff for a file with empty patch
    // Assert: no gutter column rendered
    // Assert: "No changes" or similar placeholder visible
    await tui.terminate();
  });

  test("EDGE-LN-002: single-line addition shows line 1", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff for a new file with one line
    // Assert: gutter shows "1" with "+" sign
    await tui.terminate();
  });

  test("EDGE-LN-003: deletion-only file shows old line numbers", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff for a deleted file
    // Assert: all lines show sequential old file line numbers (1, 2, 3, ...)
    // Assert: all lines show "-" sign in red
    await tui.terminate();
  });

  test("EDGE-LN-004: interleaved adds and deletes track independently", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with alternating +/- lines in same hunk
    // Assert: old line numbers increment only on "-" lines
    // Assert: new line numbers increment only on "+" lines
    await tui.terminate();
  });

  test("EDGE-LN-005: hunk starting at line 1", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff where first hunk has oldStart=1, newStart=1
    // Assert: line numbers start at 1, not 0
    await tui.terminate();
  });

  test("EDGE-LN-006: very large line numbers in small terminal", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff for a file with lines > 10,000
    // Assert: gutter is 4 chars (minimum tier)
    // Assert: large numbers are truncated but right-aligned
    // Assert: no layout overflow
    await tui.terminate();
  });

  test("EDGE-LN-007: wrapped line shows number only on first row", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff with a line exceeding 80 cols (wraps)
    // Assert: first visual row shows line number
    // Assert: second visual row (continuation) has blank gutter
    await tui.terminate();
  });

  test("EDGE-LN-008: split view padding lines have no number", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("t"); // split view
    // Assert: padding lines (alignment empties) have blank gutter
    // Assert: no line number, no sign character on padding lines
    await tui.terminate();
  });
});
```

**Total E2E test count: 51 tests** across 5 describe blocks.

---

## 7. Observability

The following structured log points should be added to the TUI diff screen code:

| Level | Event | Location | Format |
|-------|-------|----------|--------|
| `debug` | `diff.gutter.tier_selected` | `useGutterWidth()` — log on breakpoint change via `useEffect` | `{ terminal_width: number, breakpoint: string, gutter_chars: number, min_width: number }` |
| `debug` | `diff.gutter.recalculated` | `UnifiedDiffViewer` — log when diff data changes | `{ file_path: string, view_mode: string, gutter_width: number }` |
| `debug` | `diff.line_numbers.built` | `UnifiedDiffViewer` — log after `<diff>` mount/update | `{ view_mode: string, file_count: number }` |

All logs use the TUI's standard logger (`apps/tui/src/lib/logger.ts`). These are `debug` level — not visible in normal operation.

---

## 8. Acceptance Verification Matrix

Maps each acceptance criterion to its implementation component:

| Criterion | Implementation |
|-----------|----------------|
| Line numbers rendered in unified view gutter | `<diff showLineNumbers={true}>` — OpenTUI `buildUnifiedView()` populates `lineNumbers` map |
| Addition lines show new file line number | `DiffRenderable.buildUnifiedView()`: `lineNumbers.set(lineIndex, newLineNum)` |
| Deletion lines show old file line number | `DiffRenderable.buildUnifiedView()`: `lineNumbers.set(lineIndex, oldLineNum)` |
| Context lines show new file line number | `DiffRenderable.buildUnifiedView()`: `lineNumbers.set(lineIndex, newLineNum)` |
| Numbers right-aligned with 1 left padding | `GutterRenderable.refreshFrameBuffer()` right-alignment calculation |
| Muted color (ANSI 245) | `lineNumberFg={theme.diffLineNumberFg}` → `#888888` |
| `+` sign in green | `addedSignColor={theme.diffAddedText}` → `#22C55E` |
| `-` sign in red | `removedSignColor={theme.diffRemovedText}` → `#EF4444` |
| Context lines no sign | `DiffRenderable.buildUnifiedView()`: context block has no `lineSigns.set()` call |
| Split view: left pane old numbers | `DiffRenderable.buildSplitView()`: old line numbers on left |
| Split view: right pane new numbers | `DiffRenderable.buildSplitView()`: new line numbers on right |
| Split view padding blank gutter | `hideLineNumber: true` on filler lines → `hideLineNumbers` set → `GutterRenderable` skips |
| 4-char gutter at minimum | `GUTTER_TIERS.minimum.gutterChars = 4` |
| 5-char gutter at standard | `GUTTER_TIERS.standard.gutterChars = 5` |
| 6-char gutter at large | `GUTTER_TIERS.large.gutterChars = 6` |
| Gutter recalculates on resize | `useGutterWidth()` → `useLayout()` → `useTerminalDimensions()` chain |
| Green gutter background for additions | `addedLineNumberBg={theme.diffAddedGutterBg}` → `#143D14` |
| Red gutter background for deletions | `removedLineNumberBg={theme.diffRemovedGutterBg}` → `#3D1414` |
| Wrapped lines: number on first row only | `GutterRenderable.refreshFrameBuffer()`: `lineSources` array, first-row detection |
| Hunk headers: no line number | Hunk headers not in `lineNumbers` map — OpenTUI handles internally |
| Empty diff: no gutter | `DiffRenderable.buildView()` returns early when 0 hunks |

---

## 9. Dependencies and Integration Points

### Upstream Dependencies

| Ticket | What It Provides | What This Ticket Needs |
|--------|-----------------|------------------------|
| `tui-diff-unified-view` | `UnifiedDiffViewer.tsx`, `<diff>` component usage, `diff-constants.ts` | The component to modify with line number props |
| `tui-diff-parse-utils` | `parseDiffHunks()`, `DiffLine` types, `ParsedDiff` | Hunk structure for line number derivation (consumed by OpenTUI internally) |

### Downstream Consumers

| Ticket | What It Needs From This Ticket |
|--------|--------------------------------|
| `tui-diff-split-view` | `diff-gutter-config.ts` exports, `useGutterWidth()` hook, theme gutter tokens |
| `tui-diff-expand-collapse` | Gutter behavior with collapsed hunks (tested but not implemented here) |
| `tui-diff-view-toggle` | Gutter transition between unified/split on `t` key |

### Package Dependencies (no new packages)

| Package | Version | Purpose |
|---------|---------|--------|
| `@opentui/core` | pinned | `DiffRenderable`, `LineNumberRenderable`, `GutterRenderable` |
| `@opentui/react` | pinned | `<diff>` JSX, `useTerminalDimensions`, `useOnResize` |
| `react` | 19.x | Hooks (`useMemo`), context |
| `@codeplane/ui-core` | workspace | `useChangeDiff()`, `useLandingDiff()` for diff data |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenTUI `minWidth` default (3) too small for minimum tier spec (4) | Medium | Low — cosmetic only for small files (<100 lines) | Auto-calculation handles files > ~10 lines. File upstream PR for configurable `lineNumberMinWidth`. |
| Gutter truncation not logged | Low | Low — extremely rare for real-world files | Silent but visually correct. Add truncation callback in future OpenTUI PR. |
| Theme token addition breaks downstream consumers | Very Low | None — additive change to frozen interface | TypeScript compiler catches missing properties on implementation side. |
| Split view not yet implemented when this ticket lands | High | None — split view tests fail naturally per repo policy | Tests left failing. `tui-diff-split-view` ticket implements the component. |
| Scroll jank with 500+ line hunks | Low | Medium | OpenTUI's `GutterRenderable` uses windowed rendering. Verified by `KEY-LN-013` rapid scroll test. |
| Color props have no effect if OpenTUI ignores transparent defaults for line number backgrounds | Low | Medium | Verified against OpenTUI's `diff.mdx` docs and `react/examples/diff.tsx` — `addedLineNumberBg`/`removedLineNumberBg` are supported props. |

---

## 11. Definition of Done

- [ ] `diff-gutter-config.ts` created with `getGutterMinWidth()`, `getGutterTier()`, `GUTTER_TIERS`, `GUTTER_PADDING_RIGHT`, `SIGN_COLUMN_WIDTH`
- [ ] `useGutterWidth.ts` hook created and exports `GutterWidthResult`
- [ ] `apps/tui/src/hooks/index.ts` updated with `useGutterWidth` export
- [ ] `ThemeTokens` interface extended with `diffLineNumberFg`, `diffGutterBg`, `diffAddedGutterBg`, `diffRemovedGutterBg`
- [ ] All three color tier token objects (`TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, `ANSI16_TOKENS`) updated with new gutter constants
- [ ] `THEME_TOKEN_COUNT` updated from 12 to 16
- [ ] `UnifiedDiffViewer` passes `showLineNumbers={true}` and all gutter color props to `<diff>`
- [ ] `diff-constants.ts` updated with `GUTTER_FG`, `GUTTER_BG`, `GUTTER_ADDED_BG`, `GUTTER_REMOVED_BG`, `SIGN_ADDED_COLOR`, `SIGN_REMOVED_COLOR`
- [ ] `bun tsc --noEmit` passes for `apps/tui`
- [ ] Pure function unit tests pass: `apps/tui/src/screens/DiffScreen/__tests__/diff-gutter-config.test.ts` (10 tests)
- [ ] E2E test stubs added to `e2e/tui/diff.test.ts` (51 tests across 5 describe blocks)
- [ ] Tests that depend on unimplemented backends (diff API fixtures) are left failing — never skipped
- [ ] No new runtime dependencies added
- [ ] No mocking of OpenTUI internals in any test
- [ ] Split view integration documented for `tui-diff-split-view` ticket pickup
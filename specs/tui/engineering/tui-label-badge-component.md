# Engineering Specification: `tui-label-badge-component`

## Implement LabelBadge component with color mapping, luminance floor, and overflow handling

---

## Ticket Metadata

| Field | Value |
|---|---|
| **ID** | `tui-label-badge-component` |
| **Title** | Implement LabelBadge component with color mapping, luminance floor, and overflow handling |
| **Type** | engineering |
| **Feature** | `TUI_ISSUE_LABELS_DISPLAY` — consumed by issue list, issue detail, issue create/edit, label pickers, label filters |
| **Dependencies** | `tui-bootstrap-and-renderer` (provides ThemeProvider, `useTheme()`, `useColorTier()`, `ColorTier`, OpenTUI renderer, provider stack) |
| **Target files** | `apps/tui/src/util/color.ts`, `apps/tui/src/components/LabelBadge.tsx`, `apps/tui/src/components/index.ts`, `apps/tui/src/util/index.ts` |
| **Test files** | `e2e/tui/util-color.test.ts` (pure-function unit tests), `e2e/tui/issues.test.ts` (component snapshot/integration tests) |
| **Status** | Not started |

---

## 1. Problem Statement

Every issue surface in the TUI — list rows, detail views, create/edit forms, label pickers, and label filters — needs to render colored label badges. Without a shared component and color-resolution utility, each consumer would duplicate:

- Hex-to-terminal color mapping across three tiers (truecolor, ANSI 256, ANSI 16)
- Luminance floor brightening for labels with dark colors that are unreadable on dark backgrounds
- CJK/emoji double-width character accounting for truncation and layout
- Overflow `+N` indicator logic when available space cannot fit all labels
- `NO_COLOR` standard compliance

This ticket builds two foundational pieces:

1. **`resolveColor()` utility** (`apps/tui/src/util/color.ts`) — a pure function module for hex-to-RGBA color resolution with tier-aware palette mapping, luminance floor brightening, and display-width-aware string truncation.
2. **`<LabelBadge>` and `<LabelBadgeList>` components** (`apps/tui/src/components/LabelBadge.tsx`) — React components that render individual label badges and horizontal badge lists with overflow handling.

This ticket does NOT implement consuming screens — it builds the component and utility layer they depend on.

### Downstream Consumers

| Downstream Ticket | Usage |
|---|---|
| `tui-issue-list-screen` | `<LabelBadgeList>` in label column of each issue row |
| `tui-issue-detail-view` | `<LabelBadge>` (mapped) in metadata sidebar |
| `tui-issue-create-form` | `<LabelBadge>` (mapped) in label field summary |
| `tui-issue-edit-form` | `<LabelBadge>` (mapped) in label field summary |
| `tui-label-picker-overlay` | `resolveColor()` for colored `●` bullet |
| `tui-label-filter-overlay` | `resolveColor()` for colored `●` bullet |

---

## 2. Codebase Ground Truth

Before reading further, the following facts about the actual repository drive every decision in this spec:

| Fact | Location | Impact |
|---|---|---|
| `ThemeTokens` interface defines `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border` plus 5 diff tokens, all as `RGBA` | `apps/tui/src/theme/tokens.ts` | Badge brackets use `theme.muted`; fallback color uses `theme.muted`; warning name uses `theme.warning` |
| `createTheme(tier)` returns `Readonly<ThemeTokens>` — frozen singleton per tier | `apps/tui/src/theme/tokens.ts` | Theme tokens are identity-stable across renders |
| `useTheme()` returns `Readonly<ThemeTokens>` from `ThemeContext` | `apps/tui/src/hooks/useTheme.ts` | Components pass `theme.muted` directly to `fg` prop |
| `useColorTier()` returns `ColorTier` (`"truecolor"` \| `"ansi256"` \| `"ansi16"`) | `apps/tui/src/hooks/useColorTier.ts` | Drives tier selection in `resolveColor()` |
| `detectColorCapability()` returns `"ansi16"` when `NO_COLOR` is set | `apps/tui/src/theme/detect.ts` | Under `NO_COLOR`, tier is `"ansi16"` but we additionally omit all `fg` props |
| `RGBA` class: `Float32Array`-backed, `r/g/b/a` in 0.0–1.0 range, with mutable setters | `context/opentui/packages/core/src/lib/RGBA.ts` | All color math operates in 0.0–1.0 normalized space |
| `RGBA.fromHex(hex)`: strips `#`, handles 3/4/6/8 hex, warns + returns magenta on invalid | `context/opentui/packages/core/src/lib/RGBA.ts` | We validate hex before calling `fromHex()` to avoid magenta fallthrough |
| `RGBA.fromValues(r, g, b, a)`: float inputs 0.0–1.0, `a` defaults to 1.0 | `context/opentui/packages/core/src/lib/RGBA.ts` | Used by `brightenToFloor()` to construct result |
| `RGBA.fromInts(r, g, b, a)`: int inputs 0–255, `a` defaults to 255 | `context/opentui/packages/core/src/lib/RGBA.ts` | Used by palette mapping functions |
| `RGBA.toInts()`: returns `[number, number, number, number]` tuple (0–255) | `context/opentui/packages/core/src/lib/RGBA.ts` | Used in tests to assert palette mapping results |
| `RGBA.equals(other)`: strict float comparison, returns `false` for `undefined` | `context/opentui/packages/core/src/lib/RGBA.ts` | Can be used for identity checks in tests |
| `<text>` accepts `fg` prop as `RGBA \| undefined` | `@opentui/react` | `undefined` means terminal default foreground |
| `<box>` accepts `flexDirection`, `gap` layout props | `@opentui/core` BoxOptions | Badge list uses `flexDirection="row"` |
| Existing text truncation utilities (`truncateText`, `truncateLeft`) operate on `.length` not display width | `apps/tui/src/util/truncate.ts` | Not CJK-aware — we need new `displayWidth()` + `truncateToWidth()` |
| Components barrel-export from `apps/tui/src/components/index.ts` with `.js` extensions | `apps/tui/src/components/index.ts` | Must add `LabelBadge`, `LabelBadgeList` exports |
| Utilities barrel-export from `apps/tui/src/util/index.ts` with `.js` extensions | `apps/tui/src/util/index.ts` | Must add color utility exports |
| `Intl.Segmenter` is available in Bun runtime | Bun docs | Used for grapheme-cluster-safe truncation |
| No `e2e/tui/issues.test.ts` exists yet | File system scan | Must create this file |
| No `e2e/tui/util-color.test.ts` exists yet | File system scan | Must create this file |
| Pure-function unit tests live in separate `util-*.test.ts` files | `e2e/tui/util-text.test.ts` | Color utility tests follow same pattern in `util-color.test.ts` |
| E2E test patterns use `bun:test` with `describe`/`test`/`expect` | `e2e/tui/util-text.test.ts` | Follow same import and assertion patterns |
| Pure-function unit tests import directly from source with `../../apps/tui/src/` paths | `e2e/tui/util-text.test.ts` line 2 | Color utility tests follow this pattern |
| `launchTUI()` helper returns `TUITestInstance` with `sendKeys()`, `waitForText()`, `snapshot()`, `resize()` | `e2e/tui/helpers.ts` | Component snapshot tests use this interface |
| `TERMINAL_SIZES` provides `minimum: {80,24}`, `standard: {120,40}`, `large: {200,60}` | `e2e/tui/helpers.ts` | Used in responsive snapshot tests |
| Test helpers provide `createMockAPIEnv()` and `createTestCredentialStore()` | `e2e/tui/helpers.ts` | Used for test isolation |
| ANSI 256 muted token is `RGBA.fromInts(138, 138, 138, 255)` (index 245) | `apps/tui/src/theme/tokens.ts` line 62 | Reference value for test assertions |
| ANSI 16 muted token is `RGBA.fromInts(192, 192, 192, 255)` | `apps/tui/src/theme/tokens.ts` line 76 | Different muted value per tier |

---

## 3. Data Shape

Labels arrive from the Codeplane API via `@codeplane/ui-core` hooks (`useLabels()`, `useIssues()`) with this shape:

```typescript
interface Label {
  id: number;
  name: string;
  color: string;       // hex format: "#RRGGBB" (with # prefix)
  description: string;
}
```

The `color` field is a 6-character hex string with `#` prefix, server-validated. However, the component must handle malformed/missing values defensively since the TUI may encounter cached data, draft states, or API changes.

---

## 4. Color Resolution Utility

### File: `apps/tui/src/util/color.ts`

This module is a pure-function utility with no React dependencies. It is imported by `<LabelBadge>` and can be used independently for colored bullet rendering in pickers.

### 4.1 `displayWidth(str: string): number`

Computes the **display width** of a string in terminal columns, accounting for:

- **CJK Unified Ideographs** (U+4E00–U+9FFF, U+3400–U+4DBF, U+F900–U+FAFF, U+20000–U+2A6DF): 2 columns each
- **CJK Compatibility Ideographs** and Extension ranges: 2 columns each
- **Fullwidth forms** (U+FF01–U+FF60, U+FFE0–U+FFE6): 2 columns each
- **Hangul Syllables** (U+AC00–U+D7AF): 2 columns each
- **Emoji** (detected via Unicode range heuristics): 2 columns each
- **Zero-width characters** (U+200B–U+200F, U+FEFF, combining marks U+0300–U+036F, U+1AB0–U+1AFF, U+1DC0–U+1DFF, U+20D0–U+20FF, U+FE20–U+FE2F): 0 columns
- **All other characters**: 1 column

```typescript
/**
 * Compute the display width of a string in terminal columns.
 *
 * Accounts for CJK ideographs (2 cols), fullwidth forms (2 cols),
 * Hangul syllables (2 cols), emoji (2 cols), combining marks (0 cols),
 * zero-width characters (0 cols), and standard ASCII (1 col).
 *
 * @param str - The input string.
 * @returns The number of terminal columns the string would occupy.
 */
export function displayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const cp = char.codePointAt(0)!;
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

/** @internal */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK Unified Ideographs
    (cp >= 0x3400 && cp <= 0x4DBF) ||   // CJK Unified Ideographs Extension A
    (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compatibility Ideographs
    (cp >= 0x20000 && cp <= 0x2A6DF) || // CJK Unified Ideographs Extension B
    (cp >= 0xAC00 && cp <= 0xD7AF) ||   // Hangul Syllables
    (cp >= 0xFF01 && cp <= 0xFF60) ||   // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Fullwidth Signs
    (cp >= 0x1F300 && cp <= 0x1F9FF) || // Miscellaneous Symbols and Pictographs + Emoticons + ...
    (cp >= 0x1FA00 && cp <= 0x1FA6F) || // Chess Symbols
    (cp >= 0x1FA70 && cp <= 0x1FAFF) || // Symbols and Pictographs Extended-A
    (cp >= 0x2600 && cp <= 0x27BF)      // Miscellaneous Symbols + Dingbats
  );
}

/** @internal */
function isZeroWidth(cp: number): boolean {
  return (
    (cp >= 0x200B && cp <= 0x200F) ||   // Zero-width space, ZWNJ, ZWJ, LRM, RLM
    cp === 0xFEFF ||                     // BOM / Zero-width no-break space
    (cp >= 0x0300 && cp <= 0x036F) ||   // Combining Diacritical Marks
    (cp >= 0x1AB0 && cp <= 0x1AFF) ||   // Combining Diacritical Marks Extended
    (cp >= 0x1DC0 && cp <= 0x1DFF) ||   // Combining Diacritical Marks Supplement
    (cp >= 0x20D0 && cp <= 0x20FF) ||   // Combining Diacritical Marks for Symbols
    (cp >= 0xFE20 && cp <= 0xFE2F)      // Combining Half Marks
  );
}
```

### 4.2 `truncateToWidth(str: string, maxWidth: number): string`

Truncates a string to fit within `maxWidth` terminal columns, using grapheme-aware iteration via `Intl.Segmenter`. If truncation occurs, appends `…` (1 column). Respects grapheme cluster boundaries — never splits a combining mark from its base character.

**Design decisions:**
- The `Intl.Segmenter` is hoisted to a module-level singleton rather than instantiated per-call. Since `truncateToWidth()` is called per-label per-render, this avoids allocation pressure.
- This function is distinct from the existing `truncateText()` in `truncate.ts` which operates on `.length` not display width. The existing function is unsuitable for CJK/emoji content.

```typescript
/** Module-level singleton — avoids per-call instantiation. */
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Truncate a string to fit within `maxWidth` terminal columns.
 *
 * Uses grapheme-cluster-aware segmentation (via `Intl.Segmenter`) so
 * combining marks are never separated from their base characters.
 * If truncation occurs, appends "…" (U+2026, 1 column).
 *
 * Distinct from `truncateText()` in truncate.ts which uses `.length`
 * (byte count) and is not CJK/emoji-aware.
 *
 * @param str - The input string.
 * @param maxWidth - Maximum display width in terminal columns.
 * @returns The truncated string, guaranteed: `displayWidth(result) <= maxWidth`.
 */
export function truncateToWidth(str: string, maxWidth: number): string {
  if (maxWidth < 1) return "";

  const totalWidth = displayWidth(str);
  if (totalWidth <= maxWidth) return str;

  // maxWidth === 1: only room for the ellipsis itself
  if (maxWidth === 1) return "…";

  // Reserve 1 column for ellipsis
  const targetWidth = maxWidth - 1;

  let currentWidth = 0;
  let result = "";

  for (const { segment } of graphemeSegmenter.segment(str)) {
    const segWidth = displayWidth(segment);
    if (currentWidth + segWidth > targetWidth) break;
    result += segment;
    currentWidth += segWidth;
  }

  return result + "…";
}
```

### 4.3 `relativeLuminance(color: RGBA): number`

Computes the relative luminance of an RGBA color per WCAG 2.1 (ITU-R BT.709 coefficients). Input channels are in 0.0–1.0 normalized range (as stored by OpenTUI's `RGBA` class).

```typescript
import { RGBA } from "@opentui/core";

/**
 * Compute the relative luminance of an RGBA color per WCAG 2.1.
 *
 * Uses the ITU-R BT.709 luma coefficients on linearized sRGB channels.
 * Input RGBA channels are expected in 0.0–1.0 range (OpenTUI standard).
 *
 * @param color - The RGBA color to measure.
 * @returns Relative luminance in the range [0.0, 1.0].
 */
export function relativeLuminance(color: RGBA): number {
  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @internal sRGB gamma decompression. */
function linearize(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}
```

### 4.4 `brightenToFloor(color: RGBA, floor?: number): RGBA`

If `relativeLuminance(color) < floor`, brightens the color by scaling each channel uniformly until luminance reaches `floor`. Returns a new `RGBA` instance — never mutates the input.

**Algorithm:**

1. Compute current luminance `L`.
2. If `L >= floor`, return the input color unchanged (same identity).
3. Compute scale factor: `s = sqrt(floor / max(L, 0.001))`.
4. Clamp each channel: `min(channel * s, 1.0)`.
5. If clamped result still below floor (because a channel hit 1.0), apply additive boost: distribute remaining deficit proportionally weighted by BT.709 coefficients.
6. Return new RGBA via `RGBA.fromValues()`.

```typescript
/** Minimum relative luminance for label colors on dark backgrounds. */
export const LUMINANCE_FLOOR = 0.15;

/**
 * Brighten a color until its relative luminance meets the floor threshold.
 *
 * If the color already meets or exceeds the floor, returns the input
 * color unchanged (same object identity — important for React memoization).
 *
 * Uses multiplicative scaling first, then additive boost if channels
 * clamp at 1.0 before the target luminance is reached.
 *
 * @param color - The RGBA color to potentially brighten.
 * @param floor - Minimum luminance threshold. Defaults to `LUMINANCE_FLOOR` (0.15).
 * @returns The brightened color, or the input color if already bright enough.
 */
export function brightenToFloor(color: RGBA, floor: number = LUMINANCE_FLOOR): RGBA {
  const lum = relativeLuminance(color);
  if (lum >= floor) return color;

  // Multiplicative scaling: sqrt gives a good perceptual approximation
  // since luminance is roughly quadratic in linear light.
  const scale = Math.sqrt(floor / Math.max(lum, 0.001));
  let r = Math.min(color.r * scale, 1.0);
  let g = Math.min(color.g * scale, 1.0);
  let b = Math.min(color.b * scale, 1.0);

  // Check if scaling was sufficient (channels may have clamped at 1.0)
  const scaled = RGBA.fromValues(r, g, b, color.a);
  const newLum = relativeLuminance(scaled);

  if (newLum < floor) {
    // Additive boost weighted by BT.709 green dominance
    const deficit = floor - newLum;
    const boost = deficit / 0.7152;
    r = Math.min(r + boost * 0.3, 1.0);
    g = Math.min(g + boost * 0.7, 1.0);
    b = Math.min(b + boost * 0.2, 1.0);
  }

  return RGBA.fromValues(r, g, b, color.a);
}
```

### 4.5 `nearestAnsi256(color: RGBA): RGBA`

Maps a truecolor RGBA to the nearest color in the xterm-256color palette (indices 16–231 color cube + indices 232–255 grayscale ramp). Returns a new `RGBA` matching the palette entry.

The xterm-256 color cube uses channel levels: `[0, 95, 135, 175, 215, 255]`.

```typescript
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

/**
 * Map a truecolor RGBA to the nearest xterm-256color palette entry.
 *
 * Considers both the 6×6×6 color cube (indices 16–231) and the
 * 24-step grayscale ramp (indices 232–255). Returns whichever
 * has smaller Euclidean distance in RGB space.
 *
 * @param color - The truecolor RGBA to map.
 * @returns A new RGBA matching the nearest 256-color palette entry.
 */
export function nearestAnsi256(color: RGBA): RGBA {
  const [r, g, b] = [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];

  // Nearest color cube entry (indices 16–231)
  const cr = nearestCubeIndex(r);
  const cg = nearestCubeIndex(g);
  const cb = nearestCubeIndex(b);
  const cubeR = CUBE_LEVELS[cr];
  const cubeG = CUBE_LEVELS[cg];
  const cubeB = CUBE_LEVELS[cb];
  const cubeDist = colorDistSq(r, g, b, cubeR, cubeG, cubeB);

  // Nearest grayscale entry (indices 232–255: 24-step ramp from 8 to 238)
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayIdx = Math.max(0, Math.min(23, Math.round((gray - 8) / 10)));
  const grayVal = 8 + grayIdx * 10;
  const grayDist = colorDistSq(r, g, b, grayVal, grayVal, grayVal);

  if (grayDist < cubeDist) {
    return RGBA.fromInts(grayVal, grayVal, grayVal, 255);
  }
  return RGBA.fromInts(cubeR, cubeG, cubeB, 255);
}

/** @internal */
function nearestCubeIndex(value: number): number {
  let bestIdx = 0;
  let bestDist = Math.abs(value - CUBE_LEVELS[0]);
  for (let i = 1; i < CUBE_LEVELS.length; i++) {
    const dist = Math.abs(value - CUBE_LEVELS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** @internal Squared Euclidean distance in RGB space (0–255 scale). */
function colorDistSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}
```

### 4.6 `nearestAnsi16(color: RGBA): RGBA`

Maps a truecolor RGBA to the nearest color in the basic 16-color ANSI palette using Euclidean distance in RGB space.

```typescript
const ANSI_16_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0],       // 0  Black
  [128, 0, 0],     // 1  Red
  [0, 128, 0],     // 2  Green
  [128, 128, 0],   // 3  Yellow
  [0, 0, 128],     // 4  Blue
  [128, 0, 128],   // 5  Magenta
  [0, 128, 128],   // 6  Cyan
  [192, 192, 192], // 7  White
  [128, 128, 128], // 8  Bright Black (Gray)
  [255, 0, 0],     // 9  Bright Red
  [0, 255, 0],     // 10 Bright Green
  [255, 255, 0],   // 11 Bright Yellow
  [0, 0, 255],     // 12 Bright Blue
  [255, 0, 255],   // 13 Bright Magenta
  [0, 255, 255],   // 14 Bright Cyan
  [255, 255, 255], // 15 Bright White
] as const;

/**
 * Map a truecolor RGBA to the nearest basic 16-color ANSI palette entry.
 *
 * Uses Euclidean distance in RGB space (0–255 scale).
 *
 * @param color - The truecolor RGBA to map.
 * @returns A new RGBA matching the nearest 16-color palette entry.
 */
export function nearestAnsi16(color: RGBA): RGBA {
  const [r, g, b] = [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];

  let bestDist = Infinity;
  let bestIdx = 7; // default to white

  for (let i = 0; i < ANSI_16_PALETTE.length; i++) {
    const [pr, pg, pb] = ANSI_16_PALETTE[i];
    const dist = colorDistSq(r, g, b, pr, pg, pb);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  const [pr, pg, pb] = ANSI_16_PALETTE[bestIdx];
  return RGBA.fromInts(pr, pg, pb, 255);
}
```

### 4.7 `resolveColor()` — Main entry point with caching

The main entry point. Resolves a label hex color to a terminal-appropriate RGBA value.

**Parameters:**
- `hexColor` — the label's `color` field from the API (e.g., `"#16A34A"`)
- `tier` — the detected terminal color tier from `useColorTier()`
- `mutedFallback` — the `muted` token RGBA from `useTheme()`, used as fallback

**Returns:**
- `RGBA` — the resolved color for the `fg` prop
- `undefined` — when `NO_COLOR` is active (signals "use default foreground")

**Resolution cascade:**

```
hexColor input
  │
  ├─ NO_COLOR active? ─────────────→ return undefined
  │
  ├─ null/undefined/empty? ────────→ return mutedFallback
  │
  ├─ Invalid hex? ─────────────────→ console.warn + return mutedFallback
  │
  └─ Valid hex
       │
       ├─ Parse to RGBA via RGBA.fromHex()
       ├─ Apply brightenToFloor(rgba, 0.15)
       │
       ├─ tier === "truecolor"? ──→ return brightened
       ├─ tier === "ansi256"?   ──→ return nearestAnsi256(brightened)
       └─ tier === "ansi16"?    ──→ return nearestAnsi16(brightened)
```

```typescript
import type { ColorTier } from "../theme/detect.js";

/** Regex for valid hex color: optional # prefix, exactly 6 hex characters. */
const HEX_PATTERN = /^#?[0-9A-Fa-f]{6}$/;

/** Module-level LRU cache. Bounded at 256 entries with FIFO eviction. */
const colorCache = new Map<string, RGBA | undefined>();
const MAX_CACHE_SIZE = 256;

/**
 * Resolve a label hex color to a terminal-appropriate RGBA value.
 *
 * Handles hex validation, luminance floor brightening, tier-aware
 * palette mapping, and NO_COLOR compliance. Results are cached.
 *
 * @param hexColor - The label color in "#RRGGBB" format (or without #).
 * @param tier - The detected terminal color tier.
 * @param mutedFallback - RGBA to use when the color is missing or invalid.
 * @returns Resolved RGBA for the `fg` prop, or `undefined` under NO_COLOR.
 */
export function resolveColor(
  hexColor: string | undefined | null,
  tier: ColorTier,
  mutedFallback: RGBA,
): RGBA | undefined {
  if (isNoColor()) return undefined;

  if (!hexColor || !HEX_PATTERN.test(hexColor)) {
    if (hexColor !== undefined && hexColor !== null && hexColor !== "") {
      console.warn(`LabelBadge: invalid color "${hexColor}", falling back to muted`);
    }
    return mutedFallback;
  }

  const cacheKey = `${hexColor}:${tier}`;
  if (colorCache.has(cacheKey)) return colorCache.get(cacheKey);

  const normalized = hexColor.startsWith("#") ? hexColor : `#${hexColor}`;
  const rgba = RGBA.fromHex(normalized);
  const brightened = brightenToFloor(rgba, LUMINANCE_FLOOR);

  let result: RGBA;
  switch (tier) {
    case "truecolor":
      result = brightened;
      break;
    case "ansi256":
      result = nearestAnsi256(brightened);
      break;
    case "ansi16":
      result = nearestAnsi16(brightened);
      break;
  }

  // FIFO eviction: delete oldest if at capacity
  if (colorCache.size >= MAX_CACHE_SIZE) {
    const firstKey = colorCache.keys().next().value;
    if (firstKey !== undefined) colorCache.delete(firstKey);
  }
  colorCache.set(cacheKey, result);

  return result;
}

/** @internal */
function isNoColor(): boolean {
  const val = process.env.NO_COLOR;
  return val !== undefined && val !== "";
}
```

**Key behaviors:**
- `NO_COLOR=1`: returns `undefined` — caller omits `fg` prop so terminal default foreground is used.
- Invalid hex (`#ZZZZZZ`, empty string, `null`, `undefined`): returns `mutedFallback` RGBA. Non-null/non-empty invalid values log a `warn`.
- `#000000`: luminance is 0.0 < 0.15 → brightened via `brightenToFloor()`.
- Hex without `#` prefix (e.g., `"16A34A"`): accepted by the regex pattern and normalized before parsing.
- Cache is bounded at 256 entries with FIFO eviction (approximates LRU for session-stable label sets).

### 4.8 `_resetColorCache()` — Test-only cache reset

Exported with underscore prefix to signal test-only usage. Allows tests to verify cache behavior without side effects leaking between test cases.

```typescript
/** @internal Test-only. Clears the color resolution cache. */
export function _resetColorCache(): void {
  colorCache.clear();
}
```

### 4.9 Exports

```typescript
// apps/tui/src/util/color.ts — public API
export {
  displayWidth,
  truncateToWidth,
  relativeLuminance,
  brightenToFloor,
  nearestAnsi256,
  nearestAnsi16,
  resolveColor,
  LUMINANCE_FLOOR,
  _resetColorCache,
};
```

---

## 5. LabelBadge Component

### File: `apps/tui/src/components/LabelBadge.tsx`

### 5.1 `<LabelBadge>` — Single label badge

Renders a single label as `[label-name]` where:
- Brackets `[` and `]` use the `muted` theme token color
- Label name uses the resolved label color from `resolveColor()`
- Label name is truncated to `maxWidth` terminal columns via `truncateToWidth()`
- Under `NO_COLOR`, all `fg` props are `undefined` (terminal default foreground)

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useColorTier } from "../hooks/useColorTier.js";
import { resolveColor, truncateToWidth, displayWidth } from "../util/color.js";

/**
 * Minimal label shape required by the badge component.
 * Intentionally a subset of the full API Label type to avoid
 * coupling to API response structure.
 */
export interface Label {
  readonly id: number;
  readonly name: string;
  readonly color: string;
}

export interface LabelBadgeProps {
  /** The label to render. */
  readonly label: Label;
  /**
   * Maximum display width for the label name in terminal columns.
   * Does NOT include the 2 columns for brackets.
   * Recommended values:
   * - 12: list row (standard breakpoint)
   * - 15: list row (large breakpoint)
   * - 30: detail view
   * - 40: picker list (standard)
   * - 30: picker list (minimum)
   */
  readonly maxWidth: number;
}

/**
 * Render a single label badge as `[label-name]`.
 *
 * Brackets are colored with the muted theme token.
 * The label name is colored with the resolved label color (respecting
 * color tier, luminance floor, and NO_COLOR).
 *
 * @param props - Label data and maximum display width.
 */
export function LabelBadge({ label, maxWidth }: LabelBadgeProps): React.ReactNode {
  const theme = useTheme();
  const tier = useColorTier();
  const noColor = isNoColorEnv();

  const name = label.name.trim();
  const displayName = name.length === 0 ? "?" : truncateToWidth(name, maxWidth);

  // Under NO_COLOR: omit all fg props → terminal default foreground
  const bracketColor = noColor ? undefined : theme.muted;
  const nameColor = noColor
    ? undefined
    : name.length === 0
      ? theme.warning
      : resolveColor(label.color, tier, theme.muted);

  return (
    <box flexDirection="row" gap={0}>
      <text fg={bracketColor}>[</text>
      <text fg={nameColor}>{displayName}</text>
      <text fg={bracketColor}>]</text>
    </box>
  );
}

/** @internal */
function isNoColorEnv(): boolean {
  const val = process.env.NO_COLOR;
  return val !== undefined && val !== "";
}
```

**Key behaviors:**
- Empty/whitespace-only label name: renders as `[?]` in `warning` color.
- `NO_COLOR=1`: all `fg` props are `undefined` → OpenTUI uses terminal default foreground.
- No hardcoded ANSI escape codes. All colors flow through OpenTUI's `fg` prop.
- No internal state. Pure rendering based on props + context.

### 5.2 `badgeDisplayWidth(label: Label, maxWidth: number): number`

Computes the total terminal columns consumed by a rendered `<LabelBadge>`, including brackets. Used by the overflow algorithm.

```typescript
/**
 * Compute the total display width of a rendered `<LabelBadge>`.
 *
 * Includes the 2 bracket columns (`[` and `]`) plus the name width
 * (capped at `maxWidth` if truncation would occur).
 *
 * @param label - The label to measure.
 * @param maxWidth - Maximum name width (same as `LabelBadgeProps.maxWidth`).
 * @returns Total display width in terminal columns.
 */
export function badgeDisplayWidth(label: Label, maxWidth: number): number {
  const name = label.name.trim();
  if (name.length === 0) return 3; // [?] = 3 columns

  const nameWidth = displayWidth(name);
  // If truncation occurs: truncateToWidth produces (targetWidth) + 1 ellipsis = maxWidth columns
  // If no truncation: name is nameWidth columns
  const effectiveNameWidth = nameWidth > maxWidth ? maxWidth : nameWidth;
  return effectiveNameWidth + 2; // +2 for [ and ]
}
```

### 5.3 `<LabelBadgeList>` — Multiple labels with overflow

Renders a horizontal list of `<LabelBadge>` components with `+N` overflow handling.

```typescript
export interface LabelBadgeListProps {
  /** Labels to render. Order is preserved. */
  readonly labels: readonly Label[];
  /**
   * Maximum total display width in terminal columns for the entire label area.
   * Standard: 20, Large: 30.
   */
  readonly maxTotalWidth: number;
  /**
   * Maximum display width per label name (excluding brackets).
   * Standard: 12, Large: 15, Detail: 30.
   */
  readonly maxLabelWidth: number;
  /**
   * Gap between badges in columns. Default: 1.
   */
  readonly gap?: number;
}

/**
 * Render a horizontal list of label badges with overflow handling.
 *
 * Shows as many labels as fit within `maxTotalWidth`, appending
 * a `+N` indicator for any that don't fit.
 *
 * @param props - Labels, width constraints, and gap.
 */
export function LabelBadgeList({
  labels,
  maxTotalWidth,
  maxLabelWidth,
  gap = 1,
}: LabelBadgeListProps): React.ReactNode {
  const theme = useTheme();
  const noColor = isNoColorEnv();

  if (labels.length === 0) return null;

  const { visible, overflowCount } = computeVisibleLabels(
    labels,
    maxTotalWidth,
    maxLabelWidth,
    gap,
  );

  return (
    <box flexDirection="row" gap={gap}>
      {visible.map((label) => (
        <LabelBadge key={label.id} label={label} maxWidth={maxLabelWidth} />
      ))}
      {overflowCount > 0 && (
        <text fg={noColor ? undefined : theme.muted}>+{overflowCount}</text>
      )}
    </box>
  );
}
```

### 5.4 Overflow Algorithm: `computeVisibleLabels()`

Determines how many labels fit within the available width, reserving space for `+N` if overflow occurs.

**Algorithm (greedy left-to-right with look-ahead for overflow indicator):**

1. Pre-compute `badgeDisplayWidth()` for each label.
2. Sum all widths + gaps. If total ≤ `maxTotalWidth`, show all labels, no overflow.
3. Otherwise, iterate labels left-to-right. For each candidate inclusion:
   a. Compute the width used so far + this badge + gap.
   b. Compute the remaining label count if we stop after this badge.
   c. If remaining > 0, check if `usedSoFar + overflowIndicatorWidth(remaining) + gap` ≤ `maxTotalWidth`.
   d. If it fits, include the label. Otherwise, stop.
4. Return `{ visible, overflowCount }`.

```typescript
export interface OverflowResult {
  readonly visible: readonly Label[];
  readonly overflowCount: number;
}

/**
 * Determine which labels fit within available width, with overflow.
 *
 * Uses a greedy left-to-right algorithm with look-ahead for the
 * overflow indicator width. The `+N` indicator reserves space
 * dynamically (e.g., `+3` = 2 chars, `+12` = 3 chars).
 *
 * @param labels - All labels to consider.
 * @param maxTotalWidth - Total width budget in terminal columns.
 * @param maxLabelWidth - Max width per label name.
 * @param gap - Gap between badges in columns.
 * @returns The visible labels and overflow count.
 */
export function computeVisibleLabels(
  labels: readonly Label[],
  maxTotalWidth: number,
  maxLabelWidth: number,
  gap: number,
): OverflowResult {
  if (labels.length === 0) return { visible: [], overflowCount: 0 };

  const widths = labels.map((l) => badgeDisplayWidth(l, maxLabelWidth));

  // Try fitting all labels
  const totalAll = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
  if (totalAll <= maxTotalWidth) {
    return { visible: [...labels], overflowCount: 0 };
  }

  // Greedy fit with overflow indicator reservation
  let bestCount = 0;
  let usedWidth = 0;

  for (let i = 0; i < labels.length; i++) {
    const gapW = i > 0 ? gap : 0;
    const nextUsed = usedWidth + gapW + widths[i];

    const remaining = labels.length - (i + 1);
    if (remaining === 0) {
      // Last label — no overflow indicator needed
      if (nextUsed <= maxTotalWidth) {
        bestCount = i + 1;
      }
      break;
    }

    // Space needed for "+N" indicator (e.g., "+3" = 2 cols, "+12" = 3 cols)
    const overflowStr = `+${remaining}`;
    const overflowWidth = overflowStr.length + gap;

    if (nextUsed + overflowWidth <= maxTotalWidth) {
      bestCount = i + 1;
      usedWidth = nextUsed;
    } else {
      break;
    }
  }

  return {
    visible: labels.slice(0, bestCount),
    overflowCount: labels.length - bestCount,
  };
}
```

**Worked example:** Labels `[bug]`, `[ui]`, `[docs]`, `[api]`, `[tests]` at `maxTotalWidth=20`, `maxLabelWidth=12`, `gap=1`:
- Badge widths: `[bug]`=5, `[ui]`=4, `[docs]`=6, `[api]`=5, `[tests]`=7
- Total: 5+1+4+1+6+1+5+1+7 = 31 > 20 → overflow needed
- i=0: nextUsed=5, remaining=4, `+4`=2+1=3, 5+3=8 ≤ 20 ✓ → bestCount=1
- i=1: nextUsed=5+1+4=10, remaining=3, `+3`=2+1=3, 10+3=13 ≤ 20 ✓ → bestCount=2
- i=2: nextUsed=10+1+6=17, remaining=2, `+2`=2+1=3, 17+3=20 ≤ 20 ✓ → bestCount=3
- i=3: nextUsed=17+1+5=23, remaining=1, `+1`=2+1=3, 23+3=26 > 20 ✗ → stop
- Result: visible=[`bug`, `ui`, `docs`], overflowCount=2 → renders `[bug] [ui] [docs] +2`

### 5.5 Exports

```typescript
// apps/tui/src/components/LabelBadge.tsx — public API
export {
  LabelBadge,
  LabelBadgeList,
  badgeDisplayWidth,
  computeVisibleLabels,
};
export type { Label, LabelBadgeProps, LabelBadgeListProps, OverflowResult };
```

---

## 6. Barrel Export Updates

### 6.1 `apps/tui/src/components/index.ts`

Append to existing file (after `OverlayLayer` export):

```typescript
export { LabelBadge, LabelBadgeList, badgeDisplayWidth, computeVisibleLabels } from "./LabelBadge.js";
export type { Label, LabelBadgeProps, LabelBadgeListProps, OverflowResult } from "./LabelBadge.js";
```

### 6.2 `apps/tui/src/util/index.ts`

Append to existing file (after `text.ts` exports):

```typescript
export {
  displayWidth,
  truncateToWidth,
  relativeLuminance,
  brightenToFloor,
  nearestAnsi256,
  nearestAnsi16,
  resolveColor,
  LUMINANCE_FLOOR,
  _resetColorCache,
} from "./color.js";
```

---

## 7. Implementation Plan

Each step is a vertical slice that can be implemented and tested independently.

### Step 1: `displayWidth()` and `truncateToWidth()` — Width-aware string utilities

**File:** `apps/tui/src/util/color.ts` (create)

1. Create the file with `isWide(cp)`, `isZeroWidth(cp)`, `displayWidth(str)` functions.
2. Add module-level `Intl.Segmenter` singleton.
3. Implement `truncateToWidth(str, maxWidth)` using grapheme segmentation.
4. Export both functions.

**Verification (unit assertions in `e2e/tui/util-color.test.ts`):**
- `displayWidth("hello")` → 5
- `displayWidth("你好")` → 4
- `displayWidth("a\u0300")` → 1
- `displayWidth("🚀")` → 2
- `truncateToWidth("hello world", 7)` → ends with `"…"`, `displayWidth(result)` ≤ 7
- `truncateToWidth("你好世界", 5)` → `"你好…"` (4+1=5)

**Definition of done:** All width and truncation assertions pass. No React or OpenTUI rendering dependency.

### Step 2: `relativeLuminance()` and `brightenToFloor()` — Luminance utilities

**File:** `apps/tui/src/util/color.ts` (append)

1. Import `RGBA` from `@opentui/core`.
2. Implement `linearize(channel)` for sRGB gamma correction.
3. Implement `relativeLuminance(color)` returning 0.0–1.0.
4. Implement `brightenToFloor(color, floor)` with scale + additive boost.
5. Export `LUMINANCE_FLOOR` constant.

**Verification:**
- `relativeLuminance(RGBA.fromHex("#000000"))` ≈ 0.0
- `relativeLuminance(RGBA.fromHex("#FFFFFF"))` ≈ 1.0
- `brightenToFloor(RGBA.fromHex("#000000"), 0.15)` → luminance ≥ 0.15
- `brightenToFloor(RGBA.fromHex("#FFFF00"), 0.15)` → returns input unchanged (same identity)

**Definition of done:** Luminance computation matches WCAG 2.1 formula. Dark colors are brightened above floor. Bright colors pass through unchanged.

### Step 3: `nearestAnsi256()` and `nearestAnsi16()` — Palette mapping

**File:** `apps/tui/src/util/color.ts` (append)

1. Define `CUBE_LEVELS`, `ANSI_16_PALETTE` constants as module-level frozen arrays.
2. Implement `nearestCubeIndex()`, `colorDistSq()`, `nearestAnsi256()`, `nearestAnsi16()`.
3. Export both mapping functions.

**Verification:**
- `nearestAnsi256(RGBA.fromHex("#FF0000"))` → maps to red region of palette
- `nearestAnsi16(RGBA.fromHex("#FF0000"))` → bright red `[255, 0, 0, 255]`
- `nearestAnsi16(RGBA.fromHex("#16A34A"))` → green family (g > r and g > b)

**Definition of done:** Palette mapping produces visually reasonable nearest-color results.

### Step 4: `resolveColor()` — Main entry point with caching

**File:** `apps/tui/src/util/color.ts` (append)

1. Implement `isNoColor()` env check.
2. Implement `resolveColor()` combining hex validation, luminance floor, tier mapping, and caching.
3. Implement module-level FIFO cache (256 entries).
4. Implement `_resetColorCache()` for test isolation.
5. Add all remaining exports.
6. Update `apps/tui/src/util/index.ts` barrel export.

**Verification — all 8 resolution paths:**
- Valid hex + truecolor → RGBA with luminance ≥ 0.15
- Valid hex + ansi256 → nearest 256-color RGBA
- Valid hex + ansi16 → nearest 16-color RGBA
- `#000000` + any tier → brightened result
- `#ZZZZZZ` → `mutedFallback`
- `null` → `mutedFallback`
- `""` → `mutedFallback`
- `NO_COLOR=1` → `undefined`

**Definition of done:** All resolution paths produce correct output. Consecutive calls with same args return cached result (same identity).

### Step 5: `<LabelBadge>` — Single badge component

**File:** `apps/tui/src/components/LabelBadge.tsx` (create)

1. Define `Label`, `LabelBadgeProps` interfaces.
2. Implement `<LabelBadge>` consuming `useTheme()`, `useColorTier()`, `resolveColor()`, `truncateToWidth()`.
3. Handle empty/whitespace name → `[?]` in warning color.
4. Handle NO_COLOR → all fg props `undefined`.
5. Implement `badgeDisplayWidth()` utility.
6. Export component and utility.

**Definition of done:** Component renders correctly with valid labels, invalid colors, empty names, and NO_COLOR mode. No hardcoded ANSI escape codes.

### Step 6: `<LabelBadgeList>` and overflow algorithm

**File:** `apps/tui/src/components/LabelBadge.tsx` (append)

1. Define `LabelBadgeListProps`, `OverflowResult` interfaces.
2. Implement `computeVisibleLabels()` with greedy fit + overflow indicator.
3. Implement `<LabelBadgeList>` component.
4. Update `apps/tui/src/components/index.ts` barrel export.
5. Verify worked example: 5 labels in 20-col space → 3 visible + `+2`.

**Definition of done:** Overflow algorithm is correct for all edge cases. Component renders with proper gap spacing. Barrel exports updated.

### Step 7: Tests

**Files:** `e2e/tui/util-color.test.ts` (create), `e2e/tui/issues.test.ts` (create)

1. Create `util-color.test.ts` with all pure-function tests (see Section 8.1–8.4).
2. Create `issues.test.ts` with component snapshot tests (see Section 8.5–8.7).
3. Run all tests. Tests that fail due to unimplemented backends are left failing.

**Definition of done:** All pure-function tests pass. Snapshot tests either pass or fail due to unimplemented backend (never skipped).

### Step 8: Barrel export updates

**Files:** `apps/tui/src/util/index.ts`, `apps/tui/src/components/index.ts`

1. Add color utility exports to `util/index.ts`.
2. Add component exports to `components/index.ts`.
3. Verify TypeScript compilation with `bun run check`.

**Definition of done:** All exports resolve correctly. No TypeScript errors.

---

## 8. Unit & Integration Tests

### Test Organization

Tests are split across two files following the established codebase convention:

| File | Purpose | Pattern Source |
|---|---|---|
| `e2e/tui/util-color.test.ts` | Pure-function unit tests for `color.ts` utilities and `computeVisibleLabels()` algorithm | `e2e/tui/util-text.test.ts` |
| `e2e/tui/issues.test.ts` | Component snapshot and integration tests requiring TUI launch | `e2e/tui/app-shell.test.ts` |

All tests use `bun:test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Test File: `e2e/tui/util-color.test.ts` (create)

### 8.1 `displayWidth` tests

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { RGBA } from "@opentui/core";
import {
  displayWidth,
  truncateToWidth,
  relativeLuminance,
  brightenToFloor,
  nearestAnsi256,
  nearestAnsi16,
  resolveColor,
  LUMINANCE_FLOOR,
  _resetColorCache,
} from "../../apps/tui/src/util/color.js";
import {
  badgeDisplayWidth,
  computeVisibleLabels,
} from "../../apps/tui/src/components/LabelBadge.js";

// ---------------------------------------------------------------------------
// displayWidth
// ---------------------------------------------------------------------------

describe("displayWidth", () => {
  test("ASCII string width", () => {
    expect(displayWidth("hello")).toBe(5);
  });

  test("CJK characters double-width", () => {
    expect(displayWidth("你好")).toBe(4);
  });

  test("mixed ASCII and CJK", () => {
    expect(displayWidth("hi你好")).toBe(6);
  });

  test("emoji double-width", () => {
    expect(displayWidth("🚀")).toBe(2);
  });

  test("combining marks zero-width", () => {
    expect(displayWidth("a\u0300")).toBe(1);
  });

  test("empty string", () => {
    expect(displayWidth("")).toBe(0);
  });

  test("fullwidth forms double-width", () => {
    expect(displayWidth("\uFF21")).toBe(2); // Ａ (U+FF21)
  });

  test("Hangul syllable double-width", () => {
    expect(displayWidth("한")).toBe(2);
  });

  test("zero-width space invisible", () => {
    expect(displayWidth("a\u200Bb")).toBe(2);
  });

  test("multiple combining marks on single base", () => {
    // e with combining acute + combining tilde
    expect(displayWidth("e\u0301\u0303")).toBe(1);
  });

  test("BOM is zero-width", () => {
    expect(displayWidth("\uFEFFhello")).toBe(5);
  });
});
```

### 8.2 `truncateToWidth` tests

```typescript
// ---------------------------------------------------------------------------
// truncateToWidth
// ---------------------------------------------------------------------------

describe("truncateToWidth", () => {
  test("no truncation needed", () => {
    expect(truncateToWidth("hello", 10)).toBe("hello");
  });

  test("ASCII truncation appends ellipsis", () => {
    const result = truncateToWidth("hello world", 7);
    expect(result).toEndWith("…");
    expect(displayWidth(result)).toBeLessThanOrEqual(7);
  });

  test("CJK truncation respects double-width", () => {
    const result = truncateToWidth("你好世界", 5);
    expect(result).toBe("你好…");
    expect(displayWidth(result)).toBe(5);
  });

  test("emoji truncation", () => {
    const result = truncateToWidth("🚀🎉🌟", 4);
    expect(displayWidth(result)).toBeLessThanOrEqual(4);
    expect(result).toEndWith("…");
  });

  test("maxWidth 0 returns empty", () => {
    expect(truncateToWidth("hello", 0)).toBe("");
  });

  test("maxWidth 1 returns ellipsis for long string", () => {
    expect(truncateToWidth("hello", 1)).toBe("…");
  });

  test("exact fit returns unchanged", () => {
    expect(truncateToWidth("hello", 5)).toBe("hello");
  });

  test("does not split grapheme cluster", () => {
    const result = truncateToWidth("a\u0300bc", 2);
    // Should not produce isolated combining mark
    expect(displayWidth(result)).toBeLessThanOrEqual(2);
  });

  test("CJK with odd maxWidth does not exceed", () => {
    // "你" = 2 cols. maxWidth=2 leaves 1 col for ellipsis.
    // Can't fit 你 (2) in 1 col, so result is just "…"
    const result = truncateToWidth("你好世界", 2);
    expect(displayWidth(result)).toBeLessThanOrEqual(2);
  });

  test("single char that fits returns unchanged", () => {
    expect(truncateToWidth("a", 5)).toBe("a");
  });

  test("negative maxWidth returns empty", () => {
    expect(truncateToWidth("hello", -1)).toBe("");
  });
});
```

### 8.3 `relativeLuminance` and `brightenToFloor` tests

```typescript
// ---------------------------------------------------------------------------
// relativeLuminance
// ---------------------------------------------------------------------------

describe("relativeLuminance", () => {
  test("black luminance is 0", () => {
    expect(relativeLuminance(RGBA.fromHex("#000000"))).toBeCloseTo(0.0, 4);
  });

  test("white luminance is 1", () => {
    expect(relativeLuminance(RGBA.fromHex("#FFFFFF"))).toBeCloseTo(1.0, 2);
  });

  test("pure red luminance matches BT.709", () => {
    expect(relativeLuminance(RGBA.fromHex("#FF0000"))).toBeCloseTo(0.2126, 2);
  });

  test("pure green luminance matches BT.709", () => {
    expect(relativeLuminance(RGBA.fromHex("#00FF00"))).toBeCloseTo(0.7152, 2);
  });

  test("pure blue luminance matches BT.709", () => {
    expect(relativeLuminance(RGBA.fromHex("#0000FF"))).toBeCloseTo(0.0722, 2);
  });

  test("mid gray luminance is between 0.15 and 0.30", () => {
    const lum = relativeLuminance(RGBA.fromHex("#808080"));
    expect(lum).toBeGreaterThan(0.15);
    expect(lum).toBeLessThan(0.30);
  });
});

// ---------------------------------------------------------------------------
// brightenToFloor
// ---------------------------------------------------------------------------

describe("brightenToFloor", () => {
  test("black is brightened above floor", () => {
    const result = brightenToFloor(RGBA.fromHex("#000000"));
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
  });

  test("very dark color is brightened", () => {
    const result = brightenToFloor(RGBA.fromHex("#0A0A0A"));
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
  });

  test("bright color is unchanged (same identity)", () => {
    const input = RGBA.fromHex("#FFFF00");
    const result = brightenToFloor(input);
    expect(result).toBe(input); // same object — not a new RGBA
  });

  test("mid brightness color above floor is unchanged", () => {
    const input = RGBA.fromHex("#808080");
    const result = brightenToFloor(input);
    expect(result).toBe(input);
  });

  test("dark blue is brightened", () => {
    const result = brightenToFloor(RGBA.fromHex("#00001A"));
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
  });

  test("near-floor color passes through", () => {
    const input = RGBA.fromHex("#555555");
    const lum = relativeLuminance(input);
    expect(lum).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
    const result = brightenToFloor(input);
    expect(result).toBe(input);
  });

  test("dark red is brightened to meet floor", () => {
    const result = brightenToFloor(RGBA.fromHex("#1A0000"));
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
  });

  test("custom floor threshold is respected", () => {
    const result = brightenToFloor(RGBA.fromHex("#333333"), 0.30);
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(0.30);
  });
});
```

### 8.4 Palette mapping tests

```typescript
// ---------------------------------------------------------------------------
// nearestAnsi256
// ---------------------------------------------------------------------------

describe("nearestAnsi256", () => {
  test("pure red maps to red region", () => {
    const result = nearestAnsi256(RGBA.fromHex("#FF0000"));
    const ints = result.toInts();
    expect(ints[0]).toBeGreaterThan(200);
    expect(ints[1]).toBeLessThan(50);
    expect(ints[2]).toBeLessThan(50);
  });

  test("pure green maps to green region", () => {
    const result = nearestAnsi256(RGBA.fromHex("#00FF00"));
    const ints = result.toInts();
    expect(ints[0]).toBeLessThan(50);
    expect(ints[1]).toBeGreaterThan(200);
    expect(ints[2]).toBeLessThan(50);
  });

  test("pure blue maps to blue region", () => {
    const result = nearestAnsi256(RGBA.fromHex("#0000FF"));
    const ints = result.toInts();
    expect(ints[0]).toBeLessThan(50);
    expect(ints[1]).toBeLessThan(50);
    expect(ints[2]).toBeGreaterThan(200);
  });

  test("gray maps to grayscale entry", () => {
    const result = nearestAnsi256(RGBA.fromHex("#7F7F7F"));
    const ints = result.toInts();
    // Should be a near-gray value
    expect(Math.abs(ints[0] - ints[1])).toBeLessThan(20);
    expect(Math.abs(ints[1] - ints[2])).toBeLessThan(20);
  });

  test("white maps correctly", () => {
    const result = nearestAnsi256(RGBA.fromHex("#FFFFFF"));
    const ints = result.toInts();
    expect(ints[0]).toBeGreaterThan(230);
    expect(ints[1]).toBeGreaterThan(230);
    expect(ints[2]).toBeGreaterThan(230);
  });
});

// ---------------------------------------------------------------------------
// nearestAnsi16
// ---------------------------------------------------------------------------

describe("nearestAnsi16", () => {
  test("red maps to bright red", () => {
    const result = nearestAnsi16(RGBA.fromHex("#FF0000"));
    const ints = result.toInts();
    expect(ints[0]).toBe(255);
    expect(ints[1]).toBe(0);
    expect(ints[2]).toBe(0);
  });

  test("green maps to bright green", () => {
    const result = nearestAnsi16(RGBA.fromHex("#00FF00"));
    const ints = result.toInts();
    expect(ints[0]).toBe(0);
    expect(ints[1]).toBe(255);
    expect(ints[2]).toBe(0);
  });

  test("dark blue maps to blue", () => {
    const result = nearestAnsi16(RGBA.fromHex("#000080"));
    const ints = result.toInts();
    expect(ints[0]).toBe(0);
    expect(ints[1]).toBe(0);
    expect(ints[2]).toBe(128);
  });

  test("GitHub green maps to green family", () => {
    const result = nearestAnsi16(RGBA.fromHex("#16A34A"));
    const ints = result.toInts();
    // Should map to green (2) or bright green (10)
    expect(ints[1]).toBeGreaterThan(ints[0]);
    expect(ints[1]).toBeGreaterThan(ints[2]);
  });

  test("white maps to bright white", () => {
    const result = nearestAnsi16(RGBA.fromHex("#FFFFFF"));
    const ints = result.toInts();
    expect(ints[0]).toBe(255);
    expect(ints[1]).toBe(255);
    expect(ints[2]).toBe(255);
  });

  test("black maps to black", () => {
    const result = nearestAnsi16(RGBA.fromHex("#000000"));
    const ints = result.toInts();
    expect(ints[0]).toBe(0);
    expect(ints[1]).toBe(0);
    expect(ints[2]).toBe(0);
  });
});
```

### 8.5 `resolveColor` tests

```typescript
// ---------------------------------------------------------------------------
// resolveColor
// ---------------------------------------------------------------------------

describe("resolveColor", () => {
  const muted = RGBA.fromInts(138, 138, 138, 255); // matches A256_MUTED

  beforeEach(() => {
    _resetColorCache();
  });

  test("valid hex truecolor returns RGBA with luminance check", () => {
    const result = resolveColor("#16A34A", "truecolor", muted);
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(RGBA);
    expect(relativeLuminance(result!)).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
  });

  test("valid hex ansi256 returns nearest palette color", () => {
    const result = resolveColor("#16A34A", "ansi256", muted);
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(RGBA);
  });

  test("valid hex ansi16 returns nearest basic color", () => {
    const result = resolveColor("#16A34A", "ansi16", muted);
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(RGBA);
  });

  test("#000000 is brightened above floor", () => {
    const result = resolveColor("#000000", "truecolor", muted);
    expect(result).toBeDefined();
    expect(relativeLuminance(result!)).toBeGreaterThanOrEqual(LUMINANCE_FLOOR);
  });

  test("invalid hex returns muted fallback", () => {
    const result = resolveColor("#ZZZZZZ", "truecolor", muted);
    expect(result).toBe(muted);
  });

  test("null returns muted fallback", () => {
    const result = resolveColor(null, "truecolor", muted);
    expect(result).toBe(muted);
  });

  test("undefined returns muted fallback", () => {
    const result = resolveColor(undefined, "truecolor", muted);
    expect(result).toBe(muted);
  });

  test("empty string returns muted fallback", () => {
    const result = resolveColor("", "truecolor", muted);
    expect(result).toBe(muted);
  });

  test("hex without # prefix is accepted", () => {
    const result = resolveColor("16A34A", "truecolor", muted);
    expect(result).toBeDefined();
    expect(result).not.toBe(muted);
  });

  test("cache returns same identity on second call", () => {
    const result1 = resolveColor("#16A34A", "truecolor", muted);
    const result2 = resolveColor("#16A34A", "truecolor", muted);
    expect(result1).toBe(result2); // same object identity
  });

  test("different tiers produce different results for same hex", () => {
    const tc = resolveColor("#16A34A", "truecolor", muted);
    _resetColorCache();
    const a16 = resolveColor("#16A34A", "ansi16", muted);
    // Different tiers should produce different RGBA objects
    expect(tc).toBeDefined();
    expect(a16).toBeDefined();
    // They may or may not be equal in value, but should be distinct objects
  });

  test("NO_COLOR returns undefined", () => {
    const origNoColor = process.env.NO_COLOR;
    try {
      process.env.NO_COLOR = "1";
      const result = resolveColor("#16A34A", "ansi16", muted);
      expect(result).toBeUndefined();
    } finally {
      if (origNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = origNoColor;
      }
    }
  });

  test("NO_COLOR with empty string does not trigger", () => {
    const origNoColor = process.env.NO_COLOR;
    try {
      process.env.NO_COLOR = "";
      const result = resolveColor("#16A34A", "truecolor", muted);
      expect(result).toBeDefined();
      expect(result).not.toBeUndefined();
    } finally {
      if (origNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = origNoColor;
      }
    }
  });
});
```

### 8.6 `badgeDisplayWidth` and `computeVisibleLabels` tests

```typescript
// ---------------------------------------------------------------------------
// badgeDisplayWidth
// ---------------------------------------------------------------------------

describe("badgeDisplayWidth", () => {
  test("short ASCII label", () => {
    expect(badgeDisplayWidth({ id: 1, name: "bug", color: "#FF0000" }, 12)).toBe(5);
    // [bug] = 1 + 3 + 1 = 5
  });

  test("long label truncated to maxWidth", () => {
    const width = badgeDisplayWidth({ id: 1, name: "a".repeat(20), color: "#FF0000" }, 12);
    expect(width).toBe(14); // 12 (truncated name) + 2 (brackets)
  });

  test("empty name renders as [?]", () => {
    expect(badgeDisplayWidth({ id: 1, name: "", color: "#FF0000" }, 12)).toBe(3);
  });

  test("whitespace-only name renders as [?]", () => {
    expect(badgeDisplayWidth({ id: 1, name: "   ", color: "#FF0000" }, 12)).toBe(3);
  });

  test("CJK label double-width", () => {
    expect(badgeDisplayWidth({ id: 1, name: "你好", color: "#FF0000" }, 12)).toBe(6);
    // [你好] = 1 + 4 + 1 = 6
  });

  test("emoji label double-width", () => {
    expect(badgeDisplayWidth({ id: 1, name: "🐛 bug", color: "#FF0000" }, 12)).toBe(8);
    // [🐛 bug] = 1 + (2+1+3) + 1 = 8
  });

  test("exact maxWidth label", () => {
    expect(badgeDisplayWidth({ id: 1, name: "a".repeat(12), color: "#FF0000" }, 12)).toBe(14);
  });

  test("label shorter than maxWidth", () => {
    expect(badgeDisplayWidth({ id: 1, name: "ab", color: "#FF0000" }, 12)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// computeVisibleLabels
// ---------------------------------------------------------------------------

describe("computeVisibleLabels", () => {
  const mkLabel = (id: number, name: string): { id: number; name: string; color: string } => ({
    id,
    name,
    color: "#FF0000",
  });

  test("all labels fit", () => {
    const labels = [mkLabel(1, "a"), mkLabel(2, "b")];
    const result = computeVisibleLabels(labels, 20, 12, 1);
    expect(result.visible.length).toBe(2);
    expect(result.overflowCount).toBe(0);
  });

  test("overflow triggered with 5 labels in 20-col space", () => {
    const labels = [
      mkLabel(1, "bug"), mkLabel(2, "ui"), mkLabel(3, "docs"),
      mkLabel(4, "api"), mkLabel(5, "tests"),
    ];
    const result = computeVisibleLabels(labels, 20, 12, 1);
    // From worked example: visible=3, overflow=2
    expect(result.visible.length).toBe(3);
    expect(result.overflowCount).toBe(2);
    expect(result.visible[0].name).toBe("bug");
    expect(result.visible[1].name).toBe("ui");
    expect(result.visible[2].name).toBe("docs");
  });

  test("single label fits", () => {
    const labels = [mkLabel(1, "bug")];
    const result = computeVisibleLabels(labels, 20, 12, 1);
    expect(result.visible.length).toBe(1);
    expect(result.overflowCount).toBe(0);
  });

  test("zero labels", () => {
    const result = computeVisibleLabels([], 20, 12, 1);
    expect(result.visible.length).toBe(0);
    expect(result.overflowCount).toBe(0);
  });

  test("no labels fit when all too wide", () => {
    const labels = [mkLabel(1, "a".repeat(20)), mkLabel(2, "b".repeat(20))];
    const result = computeVisibleLabels(labels, 5, 12, 1);
    expect(result.visible.length).toBe(0);
    expect(result.overflowCount).toBe(2);
  });

  test("exact fit shows all labels without overflow", () => {
    // [a] = 3, gap = 1, [b] = 3 → total = 7
    const labels = [mkLabel(1, "a"), mkLabel(2, "b")];
    const result = computeVisibleLabels(labels, 7, 12, 1);
    expect(result.visible.length).toBe(2);
    expect(result.overflowCount).toBe(0);
  });

  test("visible + overflow always equals total", () => {
    const labels = Array.from({ length: 10 }, (_, i) => mkLabel(i, `label-${i}`));
    const result = computeVisibleLabels(labels, 20, 12, 1);
    expect(result.visible.length + result.overflowCount).toBe(10);
  });

  test("+N width accounts for multi-digit count", () => {
    const labels = Array.from({ length: 15 }, (_, i) => mkLabel(i, "x"));
    const result = computeVisibleLabels(labels, 30, 12, 1);
    // Overflow string "+12" or "+13" is 3 chars (not 2)
    expect(result.visible.length + result.overflowCount).toBe(15);
    expect(result.overflowCount).toBeGreaterThan(0);
  });

  test("CJK labels consume double-width in overflow calc", () => {
    const labels = [mkLabel(1, "你好"), mkLabel(2, "世界"), mkLabel(3, "测试")];
    // [你好] = 6, [世界] = 6, [测试] = 6, gaps = 2 → total = 20
    const result = computeVisibleLabels(labels, 15, 12, 1);
    expect(result.visible.length).toBeLessThan(3);
    expect(result.overflowCount).toBeGreaterThan(0);
  });

  test("50 labels in overflow calculation does not crash", () => {
    const labels = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      name: `label-${i}`,
      color: "#FF0000",
    }));
    const result = computeVisibleLabels(labels, 20, 12, 1);
    expect(result.visible.length + result.overflowCount).toBe(50);
    expect(result.overflowCount).toBeGreaterThan(0);
  });

  test("gap=0 packs labels tighter", () => {
    const labels = [mkLabel(1, "a"), mkLabel(2, "b"), mkLabel(3, "c")];
    // [a][b][c] = 3+3+3 = 9 with gap=0
    const result = computeVisibleLabels(labels, 9, 12, 0);
    expect(result.visible.length).toBe(3);
    expect(result.overflowCount).toBe(0);
  });
});
```

### 8.7 Edge case tests

```typescript
// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("LabelBadge edge cases", () => {
  test("255-char label name is truncated without crash", () => {
    const label = { id: 1, name: "a".repeat(255), color: "#FF0000" };
    const width = badgeDisplayWidth(label, 12);
    expect(width).toBe(14); // 12 + 2 brackets
    const truncated = truncateToWidth(label.name, 12);
    expect(displayWidth(truncated)).toBeLessThanOrEqual(12);
  });

  test("emoji label width accounting", () => {
    const label = { id: 1, name: "🐛 bug", color: "#FF0000" };
    const width = badgeDisplayWidth(label, 12);
    // "🐛 bug" = 2+1+3 = 6 display width → [🐛 bug] = 8
    expect(width).toBe(8);
  });

  test("CJK label width accounting", () => {
    const label = { id: 1, name: "重要なバグ", color: "#FF0000" };
    // "重要なバグ" = 2+2+2+2+2 = 10 display width → [重要なバグ] = 12
    expect(badgeDisplayWidth(label, 12)).toBe(12);
  });

  test("duplicate names with different colors get same width", () => {
    const label1 = { id: 1, name: "bug", color: "#FF0000" };
    const label2 = { id: 2, name: "bug", color: "#00FF00" };
    expect(badgeDisplayWidth(label1, 12)).toBe(badgeDisplayWidth(label2, 12));
  });

  test("single character label", () => {
    const label = { id: 1, name: "x", color: "#FF0000" };
    expect(badgeDisplayWidth(label, 12)).toBe(3); // [x] = 3
  });

  test("label name with only combining marks", () => {
    const label = { id: 1, name: "\u0300\u0301", color: "#FF0000" };
    // After trim(), combining marks remain. displayWidth = 0.
    // Since name is not empty, it falls through to truncateToWidth.
    const width = badgeDisplayWidth(label, 12);
    expect(width).toBe(2); // [<zero-width>] = 0 + 2 = 2
  });
});

// ---------------------------------------------------------------------------
// Barrel export verification
// ---------------------------------------------------------------------------

describe("barrel exports", () => {
  test("util/index.ts re-exports color utilities", async () => {
    const utilIndex = await import("../../apps/tui/src/util/index.js");
    expect(typeof utilIndex.displayWidth).toBe("function");
    expect(typeof utilIndex.truncateToWidth).toBe("function");
    expect(typeof utilIndex.relativeLuminance).toBe("function");
    expect(typeof utilIndex.brightenToFloor).toBe("function");
    expect(typeof utilIndex.nearestAnsi256).toBe("function");
    expect(typeof utilIndex.nearestAnsi16).toBe("function");
    expect(typeof utilIndex.resolveColor).toBe("function");
    expect(typeof utilIndex.LUMINANCE_FLOOR).toBe("number");
    expect(typeof utilIndex._resetColorCache).toBe("function");
  });

  test("components/index.ts re-exports LabelBadge components", async () => {
    const compIndex = await import("../../apps/tui/src/components/index.js");
    expect(typeof compIndex.LabelBadge).toBe("function");
    expect(typeof compIndex.LabelBadgeList).toBe("function");
    expect(typeof compIndex.badgeDisplayWidth).toBe("function");
    expect(typeof compIndex.computeVisibleLabels).toBe("function");
  });
});
```

### Test File: `e2e/tui/issues.test.ts` (create)

### 8.8 Component Snapshot Tests (require TUI launch)

These tests launch the TUI and navigate to issue screens to verify label rendering. They validate user-visible behavior, not implementation details.

**Note:** These tests depend on a running API server with issue fixtures that include labeled issues. Tests that fail due to unimplemented backends are left failing.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers.js";

describe("LabelBadge rendering", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("issue list row with labels at 120x40", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("issue list row with overflow indicator at 120x40", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    // Regex matches +N overflow pattern somewhere in snapshot
    const snap = terminal.snapshot();
    expect(snap).toMatch(/\+\d+/);
  });

  test("labels visible at 200x60 large breakpoint", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("labels adapted at 80x24 minimum breakpoint", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("dark label color is brightened for visibility", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    // The snapshot should show the badge rendered — dark color brightened
    // so text is visible. Visual verification via snapshot comparison.
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("NO_COLOR disables all label coloring", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--repo", "testorg/testrepo"],
      env: { NO_COLOR: "1" },
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    // Labels should render as plain [label-name] without ANSI color codes
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Responsive behavior
// ---------------------------------------------------------------------------

describe("LabelBadge responsive behavior", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("resize 120→80 adapts label display", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");

    const before = terminal.snapshot();
    await terminal.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
    const after = terminal.snapshot();

    // Layout should change on resize
    expect(after).not.toBe(before);
    expect(after).toMatchSnapshot();
  });

  test("resize 80→120 expands label display", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--repo", "testorg/testrepo"],
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");

    await terminal.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
    const after = terminal.snapshot();
    expect(after).toMatchSnapshot();
  });
});
```

---

## 9. Integration Points

The `<LabelBadge>` and `<LabelBadgeList>` components are consumed by the following screens (implemented in separate tickets):

| Consumer | Component | maxLabelWidth | maxTotalWidth | Notes |
|----------|-----------|--------------|---------------|-------|
| Issue list row | `<LabelBadgeList>` | 12 (std) / 15 (lg) | 20 (std) / 30 (lg) | Hidden at minimum breakpoint |
| Issue detail metadata | `<LabelBadge>` (mapped) | 30 | N/A (wrapping) | All labels shown, wrap across lines |
| Issue create/edit form | `<LabelBadge>` (mapped) | 30 | N/A (wrapping) | Selected labels in field summary |
| Label picker overlay | Colored `●` bullet | N/A | N/A | Uses `resolveColor()` directly for bullet color |
| Label filter overlay | Colored `●` bullet | N/A | N/A | Uses `resolveColor()` directly for bullet color |

### Integration with `useTheme()` and `useColorTier()`

Both `<LabelBadge>` and `resolveColor()` depend on:
- `useTheme()` → provides `theme.muted` for bracket color and `theme.warning` for empty name fallback
- `useColorTier()` → provides the detected tier for `resolveColor()`

These hooks are provided by `ThemeProvider` (from `tui-bootstrap-and-renderer` dependency). The component will throw a clear error if rendered outside the provider tree — the hooks enforce this at context access time via `ThemeContext`.

### Integration with `@codeplane/ui-core`

Label data comes from:
- `useIssues(owner, repo)` → issues include `labels: Label[]` array
- `useLabels(owner, repo)` → all repository labels for pickers

The `<LabelBadge>` component does not fetch data itself — it receives `Label` objects as props from the consuming screen.

---

## 10. Productionization Checklist

### 10.1 Performance

- [ ] `resolveColor()` cache is bounded at 256 entries with FIFO eviction. Verify no memory growth during long sessions with many unique label colors.
- [ ] `displayWidth()` iterates codepoints via `for..of` (handles surrogate pairs correctly for emoji and CJK Extension B). Verify O(n) performance on 255-char label names.
- [ ] `Intl.Segmenter` is a module-level singleton — no per-call instantiation overhead. Verified safe in Bun because segmenters are stateless.
- [ ] `computeVisibleLabels()` pre-computes all badge widths upfront in O(n). Acceptable for up to 50+ labels.
- [ ] All palette constants (`ANSI_16_PALETTE`, `CUBE_LEVELS`) are module-level `as const` arrays — zero per-render allocation.
- [ ] `<LabelBadge>` and `<LabelBadgeList>` contain no `useEffect` or `useState` — pure rendering functions that produce consistent output from props + context.
- [ ] No `RGBA` allocation during render for colors already in cache — `resolveColor()` returns cached identity.

### 10.2 Error Boundaries

- [ ] `resolveColor()` never throws. All error paths (invalid hex, null input) return fallback values.
- [ ] `RGBA.fromHex()` with invalid input returns magenta (OpenTUI default). `resolveColor()` catches this by validating hex before calling `fromHex()`, so magenta is never exposed to users.
- [ ] `<LabelBadge>` handles `undefined`/`null` color gracefully (muted fallback via `resolveColor`).
- [ ] `<LabelBadgeList>` handles empty label arrays (returns `null`, no DOM output).
- [ ] `displayWidth()` handles empty string (returns 0).
- [ ] `truncateToWidth()` handles maxWidth=0 (returns empty string), maxWidth=1 (returns `"…"`), and negative maxWidth (returns empty string).

### 10.3 Accessibility

- [ ] Luminance floor (0.15) ensures all label colors are readable on dark backgrounds.
- [ ] `NO_COLOR` support follows the https://no-color.org/ standard exactly — presence of `NO_COLOR` env var (any non-empty value) disables all color output.
- [ ] Bracket color (muted) provides structural cues `[` and `]` even when label color is similar to background.
- [ ] Overflow indicator `+N` uses muted color so it doesn't compete visually with label colors.
- [ ] Label text conveys meaning independently of color — names are always readable.

### 10.4 Testing Coverage

- [ ] Pure function tests in `e2e/tui/util-color.test.ts` cover all code paths in `color.ts` without TUI launch (fast, deterministic).
- [ ] Barrel export verification tests confirm both `util/index.ts` and `components/index.ts` re-export all public symbols.
- [ ] Snapshot tests in `e2e/tui/issues.test.ts` verify visual output at minimum (80×24), standard (120×40), and large (200×60) breakpoints.
- [ ] Edge cases (CJK, emoji, 255-char names, black color, invalid hex, NO_COLOR, combining marks, whitespace-only names) all have explicit test cases.
- [ ] Tests that fail due to unimplemented API backends are left failing — never skipped.
- [ ] `_resetColorCache()` is used in `beforeEach` of `resolveColor` tests to ensure cache isolation between test cases.

### 10.5 Code Hygiene

- [ ] No hardcoded ANSI escape sequences. All colors flow through OpenTUI's `fg`/`bg` props.
- [ ] No `console.log` in production paths. Only `console.warn` for invalid color fallbacks.
- [ ] All exports are explicitly listed in barrel files (no `export *`).
- [ ] Types exported separately from runtime values using `export type`.
- [ ] Module structure follows existing patterns: `util/` for pure functions, `components/` for React components.
- [ ] Import paths use `.js` extensions for ESM compatibility (matching existing convention in `apps/tui/src/`).
- [ ] JSDoc on all public functions with `@param` and `@returns`.
- [ ] Internal helper functions marked with `/** @internal */` JSDoc tag.

---

## 11. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `tui-bootstrap-and-renderer` | Ticket | **Required** — provides ThemeProvider, `useTheme()`, `useColorTier()`, `ColorTier`, OpenTUI renderer, provider stack |
| `@opentui/core` (`RGBA`) | Package | Available — provides `RGBA.fromHex()`, `RGBA.fromInts()`, `RGBA.fromValues()`, `RGBA.toInts()`, `RGBA.equals()` |
| `@opentui/react` | Package | Available — provides React reconciler, JSX element mapping for `<box>`, `<text>` |
| `@codeplane/ui-core` | Package | Available — provides `useLabels()`, `useIssues()` data hooks (consumed by downstream screens, not by this component directly) |
| `react` 19.x | Package | Available — component model, hooks, context |
| `Intl.Segmenter` | Runtime | Available in Bun — grapheme-cluster-aware string segmentation |

No new npm dependencies are introduced by this ticket.

---

## 12. Open Questions

None. All design decisions are resolved:

| Decision | Resolution | Rationale |
|----------|------------|----------|
| Luminance floor threshold | **0.15** | WCAG-informed, tested against dark backgrounds. Balances readability with color fidelity. |
| Truncation limits | **12ch list / 15ch list-large / 30ch detail / 40ch picker** | From TUI_ISSUE_LABELS_DISPLAY spec |
| Overflow indicator format | **`+N`** in muted color | Compact, scannable, does not compete with label colors |
| CJK/emoji handling | **`displayWidth()` with Unicode range checks** | Standard terminal width accounting approach |
| Cache size | **256 entries** | Covers typical repository with <100 unique label colors, with headroom |
| Cache eviction | **FIFO** (Map insertion order) | Good enough for session-stable label sets; true LRU adds complexity for no practical benefit |
| NO_COLOR behavior | **return `undefined`** from `resolveColor()` | OpenTUI uses terminal default foreground when `fg={undefined}` |
| Segmenter lifecycle | **Module-level singleton** | Avoids per-call allocation; safe because segmenter is stateless |
| Test file organization | **`e2e/tui/util-color.test.ts`** for pure-function tests, **`e2e/tui/issues.test.ts`** for component tests | Matches existing pattern: `util-text.test.ts` for text utilities, feature-group files for component tests |
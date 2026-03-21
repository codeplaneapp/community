# Engineering Specification: `tui-label-badge-component`

## Implement LabelBadge component with color mapping, luminance floor, and overflow handling

**Ticket:** `tui-label-badge-component`
**Dependency:** `tui-bootstrap-and-renderer` (provides ThemeProvider, color detection, OpenTUI renderer)
**Feature flags:** None
**Status:** Not started

---

## 1. Summary

This ticket implements two foundational pieces:

1. **`resolveColor()` utility** — a pure function that maps a label's hex color string to an `RGBA` value appropriate for the detected terminal color tier, applying luminance floor brightening and fallback handling.
2. **`<LabelBadge>` component** — a reusable React component that renders a single label as `[label-name]` with brackets in `muted` color and the name in the resolved label color, with configurable truncation and CJK/emoji double-width accounting.
3. **`<LabelBadgeList>` component** — a wrapper that renders multiple `<LabelBadge>` components with overflow `+N` handling.

These are cross-cutting rendering primitives consumed by issue list rows, issue detail views, issue create/edit forms, label pickers, and label filter overlays. This ticket does NOT implement those consuming screens — it builds the component and utility layer they depend on.

---

## 2. File Inventory

| File | Type | Purpose |
|------|------|---------|
| `apps/tui/src/util/color.ts` | New | `resolveColor()`, `relativeLuminance()`, `brightenToFloor()`, `nearestAnsi256()`, `nearestAnsi16()`, `displayWidth()` |
| `apps/tui/src/components/LabelBadge.tsx` | New | `<LabelBadge>` and `<LabelBadgeList>` React components |
| `e2e/tui/issues.test.ts` | Append | Label badge snapshot and interaction tests |

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

The `color` field is a 6-character hex string with `#` prefix, server-validated via `normalizeLabelColor()`. However, the component must handle malformed/missing values defensively.

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
- **Emoji** (detected via Unicode General_Category or width heuristics): 2 columns each
- **Zero-width characters** (U+200B–U+200F, U+FEFF, combining marks U+0300–U+036F): 0 columns
- **All other characters**: 1 column

```typescript
export function displayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const cp = char.codePointAt(0)!;
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

function isWide(cp: number): boolean {
  return (
    // CJK Unified Ideographs
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    // CJK Extension A
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    // CJK Compatibility Ideographs
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    // CJK Extension B+
    (cp >= 0x20000 && cp <= 0x2A6DF) ||
    // Hangul Syllables
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    // Fullwidth Forms
    (cp >= 0xFF01 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    // Common emoji ranges (supplementary)
    (cp >= 0x1F300 && cp <= 0x1F9FF) ||
    (cp >= 0x1FA00 && cp <= 0x1FA6F) ||
    (cp >= 0x1FA70 && cp <= 0x1FAFF) ||
    (cp >= 0x2600 && cp <= 0x27BF)
  );
}

function isZeroWidth(cp: number): boolean {
  return (
    // Zero-width space, joiners, marks
    (cp >= 0x200B && cp <= 0x200F) ||
    cp === 0xFEFF ||
    // Combining diacritical marks
    (cp >= 0x0300 && cp <= 0x036F) ||
    // Combining marks extended
    (cp >= 0x1AB0 && cp <= 0x1AFF) ||
    (cp >= 0x1DC0 && cp <= 0x1DFF) ||
    (cp >= 0x20D0 && cp <= 0x20FF) ||
    (cp >= 0xFE20 && cp <= 0xFE2F)
  );
}
```

### 4.2 `truncateToWidth(str: string, maxWidth: number): string`

Truncates a string to fit within `maxWidth` terminal columns, using grapheme-aware iteration. If truncation occurs, appends `…` (1 column). Respects grapheme cluster boundaries via `Intl.Segmenter`.

```typescript
export function truncateToWidth(str: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  
  const totalWidth = displayWidth(str);
  if (totalWidth <= maxWidth) return str;
  
  // Need to truncate — reserve 1 column for ellipsis
  const targetWidth = maxWidth - 1;
  if (targetWidth < 0) return "";
  
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let currentWidth = 0;
  let result = "";
  
  for (const { segment } of segmenter.segment(str)) {
    const segWidth = displayWidth(segment);
    if (currentWidth + segWidth > targetWidth) break;
    result += segment;
    currentWidth += segWidth;
  }
  
  return result + "…";
}
```

### 4.3 `relativeLuminance(rgba: RGBA): number`

Computes the relative luminance of an RGBA color per WCAG 2.1 (ITU-R BT.709 coefficients). Input RGBA values are in 0.0–1.0 normalized range (as stored by OpenTUI's `RGBA` class).

```typescript
import { RGBA } from "@opentui/core";

export function relativeLuminance(color: RGBA): number {
  // RGBA.r/g/b are already 0.0–1.0 (linear is close enough for sRGB approximation)
  // Apply sRGB linearization
  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function linearize(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}
```

### 4.4 `brightenToFloor(color: RGBA, floor: number): RGBA`

If `relativeLuminance(color) < floor`, brightens the color by scaling each channel uniformly until luminance reaches `floor`. Returns a new `RGBA` instance — never mutates the input.

The algorithm:
1. Compute current luminance `L`.
2. If `L >= floor`, return the input color unchanged.
3. Compute scale factor: `s = sqrt(floor / max(L, 0.001))`.
4. Clamp each channel: `min(channel * s, 1.0)`.
5. If clamped result still below floor (because one channel hit 1.0), apply additive boost: add `(floor - newL) / 3` to each channel, clamped to 1.0.
6. Return new RGBA.

```typescript
export function brightenToFloor(color: RGBA, floor: number = 0.15): RGBA {
  const lum = relativeLuminance(color);
  if (lum >= floor) return color;
  
  // Scale factor to reach target luminance
  const scale = Math.sqrt(floor / Math.max(lum, 0.001));
  let r = Math.min(color.r * scale, 1.0);
  let g = Math.min(color.g * scale, 1.0);
  let b = Math.min(color.b * scale, 1.0);
  
  // Check if scaling was sufficient (channels may have clamped)
  const scaled = RGBA.fromValues(r, g, b, color.a);
  const newLum = relativeLuminance(scaled);
  
  if (newLum < floor) {
    // Additive boost for channels that clamped
    const deficit = floor - newLum;
    const boost = deficit / 0.7152; // normalize by green weight (dominant)
    r = Math.min(r + boost * 0.3, 1.0);
    g = Math.min(g + boost * 0.7, 1.0);
    b = Math.min(b + boost * 0.2, 1.0);
  }
  
  return RGBA.fromValues(r, g, b, color.a);
}
```

### 4.5 `nearestAnsi256(color: RGBA): RGBA`

Maps a truecolor RGBA to the nearest color in the xterm-256color palette (indices 0–255). Returns a new `RGBA` matching the palette entry.

The xterm-256 palette consists of:
- Indices 0–15: Standard + bright ANSI colors (handled by `nearestAnsi16` fallthrough)
- Indices 16–231: 6×6×6 color cube where each channel maps to `[0, 95, 135, 175, 215, 255]`
- Indices 232–255: 24-step grayscale ramp from `rgb(8,8,8)` to `rgb(238,238,238)`

Algorithm:
1. Convert RGBA channels to 0–255 int range.
2. Find nearest color cube entry (index 16–231): quantize each channel to the 6-level palette.
3. Find nearest grayscale entry (index 232–255): average channels, map to 24-step ramp.
4. Compare Euclidean distance in RGB space; return the closer match.

```typescript
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;
const CUBE_THRESHOLDS = [0, 48, 115, 155, 195, 235] as const;

export function nearestAnsi256(color: RGBA): RGBA {
  const [r, g, b] = [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
  
  // Find nearest color cube entry
  const cr = nearestCubeChannel(r);
  const cg = nearestCubeChannel(g);
  const cb = nearestCubeChannel(b);
  const cubeR = CUBE_LEVELS[cr];
  const cubeG = CUBE_LEVELS[cg];
  const cubeB = CUBE_LEVELS[cb];
  const cubeDist = colorDistSq(r, g, b, cubeR, cubeG, cubeB);
  
  // Find nearest grayscale entry
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayIdx = Math.max(0, Math.min(23, Math.round((gray - 8) / 10)));
  const grayVal = 8 + grayIdx * 10;
  const grayDist = colorDistSq(r, g, b, grayVal, grayVal, grayVal);
  
  if (grayDist < cubeDist) {
    return RGBA.fromInts(grayVal, grayVal, grayVal, 255);
  }
  return RGBA.fromInts(cubeR, cubeG, cubeB, 255);
}

function nearestCubeChannel(value: number): number {
  for (let i = 0; i < CUBE_THRESHOLDS.length; i++) {
    if (value < CUBE_THRESHOLDS[i]) return Math.max(0, i - 1);
  }
  return 5;
}

function colorDistSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}
```

### 4.6 `nearestAnsi16(color: RGBA): RGBA`

Maps a truecolor RGBA to the nearest color in the basic 16-color ANSI palette. Uses the same Euclidean distance comparison across all 16 standard colors.

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

export function nearestAnsi16(color: RGBA): RGBA {
  const [r, g, b] = [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
  
  let bestDist = Infinity;
  let bestIdx = 7; // default: white
  
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

### 4.7 `resolveColor(hexColor: string | undefined | null, tier: ColorTier, mutedFallback: RGBA): RGBA | undefined`

The main entry point. Resolves a label hex color to a terminal-appropriate RGBA value.

**Parameters:**
- `hexColor` — the label's `color` field from the API (e.g., `"#16A34A"`)
- `tier` — the detected terminal color tier from `useColorTier()`
- `mutedFallback` — the `muted` token RGBA from `useTheme()`, used as fallback

**Returns:**
- `RGBA` — the resolved color for the `fg` prop
- `undefined` — when `NO_COLOR` is active (signals "use default foreground")

**Algorithm:**

```typescript
import type { ColorTier } from "../theme/detect.js";

const HEX_PATTERN = /^#?[0-9A-Fa-f]{6}$/;
const LUMINANCE_FLOOR = 0.15;

export function resolveColor(
  hexColor: string | undefined | null,
  tier: ColorTier,
  mutedFallback: RGBA,
): RGBA | undefined {
  // 1. NO_COLOR active → the detect module returns "ansi16" but we also check
  //    the env var directly for explicit no-color intent
  if (isNoColor()) return undefined;
  
  // 2. Validate hex input
  if (!hexColor || !HEX_PATTERN.test(hexColor)) {
    if (hexColor !== undefined && hexColor !== null) {
      // Log warning for invalid (but present) values
      console.warn(`LabelBadge: invalid color "${hexColor}", falling back to muted`);
    }
    return mutedFallback;
  }
  
  // 3. Parse to RGBA
  const normalized = hexColor.startsWith("#") ? hexColor : `#${hexColor}`;
  const rgba = RGBA.fromHex(normalized);
  
  // 4. Apply luminance floor
  const brightened = brightenToFloor(rgba, LUMINANCE_FLOOR);
  
  // 5. Map to color tier
  switch (tier) {
    case "truecolor":
      return brightened;
    case "ansi256":
      return nearestAnsi256(brightened);
    case "ansi16":
      return nearestAnsi16(brightened);
  }
}

function isNoColor(): boolean {
  const val = process.env.NO_COLOR;
  return val !== undefined && val !== "";
}
```

**Key behaviors:**
- `NO_COLOR=1`: returns `undefined` — caller should omit `fg` prop entirely so terminal default foreground is used.
- Invalid hex (`#ZZZZZZ`, empty string, `null`, `undefined`): returns `mutedFallback` RGBA. Non-null invalid values log a `warn`.
- `#000000`: luminance is 0.0 < 0.15 → brightened via `brightenToFloor()`.
- Valid hex on truecolor: RGBA returned directly after luminance floor.
- Valid hex on ANSI 256: nearest palette color after luminance floor.
- Valid hex on ANSI 16: nearest basic color after luminance floor.

### 4.8 Module-level caching

To avoid re-computing the same color on every render, `resolveColor` results are memoized in a module-level `Map<string, RGBA | undefined>` keyed by `"${hexColor}:${tier}"`. The cache is bounded at 256 entries (LRU eviction). This is safe because color tier is frozen for the session and label colors don't change during a session.

```typescript
const colorCache = new Map<string, RGBA | undefined>();
const MAX_CACHE_SIZE = 256;

export function resolveColor(
  hexColor: string | undefined | null,
  tier: ColorTier,
  mutedFallback: RGBA,
): RGBA | undefined {
  if (isNoColor()) return undefined;
  
  if (!hexColor || !HEX_PATTERN.test(hexColor)) {
    if (hexColor !== undefined && hexColor !== null) {
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
  
  // LRU eviction: delete oldest if at capacity
  if (colorCache.size >= MAX_CACHE_SIZE) {
    const firstKey = colorCache.keys().next().value;
    if (firstKey !== undefined) colorCache.delete(firstKey);
  }
  colorCache.set(cacheKey, result);
  
  return result;
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

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useColorTier } from "../hooks/useColorTier.js";
import { resolveColor, truncateToWidth, displayWidth } from "../util/color.js";

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
   * - 12: list row (standard breakpoint)
   * - 15: list row (large breakpoint)
   * - 30: detail view
   * - 40: picker list (standard)
   * - 30: picker list (minimum)
   */
  readonly maxWidth: number;
}

export function LabelBadge({ label, maxWidth }: LabelBadgeProps): React.ReactNode {
  const theme = useTheme();
  const tier = useColorTier();

  // Defensive: empty or whitespace-only name
  const name = label.name.trim();
  const displayName = name.length === 0 ? "?" : truncateToWidth(name, maxWidth);
  const nameColor = name.length === 0
    ? theme.warning
    : resolveColor(label.color, tier, theme.muted);

  return (
    <box flexDirection="row" gap={0}>
      <text fg={theme.muted}>[</text>
      <text fg={nameColor}>{displayName}</text>
      <text fg={theme.muted}>]</text>
    </box>
  );
}
```

**Key behaviors:**
- Empty/whitespace-only label name: renders as `[?]` in `warning` color.
- `NO_COLOR=1`: `resolveColor` returns `undefined`, so `fg={undefined}` causes `<text>` to use the terminal's default foreground color. Brackets still use default foreground (because `theme.muted` in `ansi16` is still a valid color, but under NO_COLOR we should also check). Actually, the `muted` token under NO_COLOR/ansi16 tier still resolves to a valid RGBA. Under `NO_COLOR`, we want brackets AND name to use default foreground. We handle this by checking `isNoColor()` in the component:

```typescript
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

function isNoColorEnv(): boolean {
  const val = process.env.NO_COLOR;
  return val !== undefined && val !== "";
}
```

### 5.2 `badgeDisplayWidth(label: Label, maxWidth: number): number`

Computes the total terminal columns consumed by a rendered `<LabelBadge>`, including brackets.

```typescript
export function badgeDisplayWidth(label: Label, maxWidth: number): number {
  const name = label.name.trim();
  if (name.length === 0) return 3; // [?] = 3 columns
  
  const nameWidth = Math.min(displayWidth(name), maxWidth);
  // If truncation occurs, the truncated string is (maxWidth - 1) + 1 (ellipsis) = maxWidth columns
  const truncatedWidth = displayWidth(name) > maxWidth ? maxWidth : nameWidth;
  return truncatedWidth + 2; // +2 for [ and ]
}
```

### 5.3 `<LabelBadgeList>` — Multiple labels with overflow

Renders a horizontal list of `<LabelBadge>` components with `+N` overflow handling.

```typescript
export interface LabelBadgeListProps {
  /** Labels to render. */
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

```typescript
export interface OverflowResult {
  visible: readonly Label[];
  overflowCount: number;
}

export function computeVisibleLabels(
  labels: readonly Label[],
  maxTotalWidth: number,
  maxLabelWidth: number,
  gap: number,
): OverflowResult {
  if (labels.length === 0) return { visible: [], overflowCount: 0 };
  
  // Pre-compute badge widths for all labels
  const widths = labels.map((l) => badgeDisplayWidth(l, maxLabelWidth));
  
  // Try fitting all labels first
  const totalWidthAll = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
  if (totalWidthAll <= maxTotalWidth) {
    return { visible: labels, overflowCount: 0 };
  }
  
  // Need overflow indicator. Reserve space for "+N" suffix.
  // "+N" width: 2 columns for single digit (e.g., "+3"), 3 for double digit (e.g., "+12")
  // plus the gap before it.
  const remainingCount = labels.length; // worst case for width calculation
  const overflowIndicatorWidth = 1 + String(remainingCount).length; // "+" + digits
  const reservedForOverflow = overflowIndicatorWidth + gap;
  
  const availableWidth = maxTotalWidth - reservedForOverflow;
  
  let usedWidth = 0;
  const visible: Label[] = [];
  
  for (let i = 0; i < labels.length; i++) {
    const badgeWidth = widths[i];
    const gapWidth = visible.length > 0 ? gap : 0;
    
    if (usedWidth + gapWidth + badgeWidth > availableWidth) break;
    
    visible.push(labels[i]);
    usedWidth += gapWidth + badgeWidth;
  }
  
  // Edge case: if no labels fit, show at least "+N" for all
  const overflowCount = labels.length - visible.length;
  
  return { visible, overflowCount };
}
```

**Overflow algorithm step-by-step:**

1. Compute `badgeDisplayWidth()` for each label.
2. Sum all widths + gaps. If total ≤ `maxTotalWidth`, show all labels, no overflow.
3. Otherwise, compute overflow indicator width: `"+" + digit_count(remaining)` plus gap.
4. Reserve that space from `maxTotalWidth`.
5. Greedily add labels left-to-right until the next badge would exceed remaining space.
6. Report `overflowCount = total - visible.length`.

**Example:** Labels `[bug]`, `[ui]`, `[docs]`, `[api]`, `[tests]` at `maxTotalWidth=20`, `maxLabelWidth=12`, `gap=1`:
- `[bug]`=5, `[ui]`=4, `[docs]`=6, `[api]`=5, `[tests]`=7
- Total: 5+1+4+1+6+1+5+1+7 = 31 > 20
- Reserve for `+3`: 2+1=3 columns → available=17
- Fit: `[bug]`(5) + gap(1) + `[ui]`(4) = 10 ≤ 17 ✓
- Next: 10 + 1 + `[docs]`(6) = 17 ≤ 17 ✓ → fit
- Next: 17 + 1 + `[api]`(5) = 23 > 17 ✗ → stop
- Wait, recalculate overflow: remaining = 5-3 = 2, `+2` width = 2. Reserve = 2+1 = 3. Available = 17.
- Actually the overflow count needs to be recalculated after we know how many fit. We use an iterative approach:

Revised algorithm with correct overflow count:

```typescript
export function computeVisibleLabels(
  labels: readonly Label[],
  maxTotalWidth: number,
  maxLabelWidth: number,
  gap: number,
): OverflowResult {
  if (labels.length === 0) return { visible: [], overflowCount: 0 };
  
  const widths = labels.map((l) => badgeDisplayWidth(l, maxLabelWidth));
  
  // Try all labels
  const totalAll = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
  if (totalAll <= maxTotalWidth) {
    return { visible: [...labels], overflowCount: 0 };
  }
  
  // Binary-ish greedy: try fitting N labels + "+M" indicator
  let bestCount = 0;
  let usedWidth = 0;
  
  for (let i = 0; i < labels.length; i++) {
    const gapW = i > 0 ? gap : 0;
    const nextUsed = usedWidth + gapW + widths[i];
    
    // If we include this label, how wide is the overflow indicator for remaining?
    const remaining = labels.length - (i + 1);
    if (remaining === 0) {
      // No overflow needed if this is the last label
      if (nextUsed <= maxTotalWidth) {
        bestCount = i + 1;
      }
      break;
    }
    
    const overflowStr = `+${remaining}`;
    const overflowWidth = overflowStr.length + gap; // gap before "+N"
    
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

## 6. Implementation Plan

Each step is a vertical slice that can be implemented and tested independently.

### Step 1: `displayWidth()` and `truncateToWidth()` — Width-aware string utilities

**File:** `apps/tui/src/util/color.ts`

1. Implement `isWide(cp)`, `isZeroWidth(cp)`, `displayWidth(str)` functions.
2. Implement `truncateToWidth(str, maxWidth)` using `Intl.Segmenter`.
3. Verify: `displayWidth("hello")` → 5, `displayWidth("你好")` → 4, `displayWidth("a\u0300")` → 1, `displayWidth("🚀")` → 2.
4. Verify: `truncateToWidth("hello world", 7)` → `"hello …"` (6 chars + ellipsis), `truncateToWidth("你好世界", 5)` → `"你好…"` (4 + 1).

**Definition of done:** All width and truncation assertions pass. No React or OpenTUI dependency.

### Step 2: `relativeLuminance()` and `brightenToFloor()` — Luminance utilities

**File:** `apps/tui/src/util/color.ts`

1. Implement `linearize(channel)` for sRGB gamma correction.
2. Implement `relativeLuminance(color)` returning 0.0–1.0.
3. Implement `brightenToFloor(color, floor)` with scale + additive boost.
4. Verify: `relativeLuminance(RGBA.fromHex("#000000"))` → 0.0, `relativeLuminance(RGBA.fromHex("#FFFFFF"))` → 1.0.
5. Verify: `brightenToFloor(RGBA.fromHex("#000000"), 0.15)` returns an RGBA with luminance ≥ 0.15.
6. Verify: `brightenToFloor(RGBA.fromHex("#FFFF00"), 0.15)` returns the input unchanged (luminance already high).

**Definition of done:** Luminance computation matches WCAG 2.1 formula. Dark colors are brightened. Bright colors pass through.

### Step 3: `nearestAnsi256()` and `nearestAnsi16()` — Palette mapping

**File:** `apps/tui/src/util/color.ts`

1. Define `CUBE_LEVELS`, `CUBE_THRESHOLDS`, `ANSI_16_PALETTE` constants.
2. Implement `nearestCubeChannel(value)`, `colorDistSq()`, `nearestAnsi256(color)`, `nearestAnsi16(color)`.
3. Verify: known colors map to expected palette entries (e.g., `#FF0000` → red in both palettes).
4. Verify: `#16A34A` (GitHub green) maps to ANSI 256 index 35 (green region) and ANSI 16 index 2 (green).

**Definition of done:** Palette mapping produces visually reasonable nearest-color results for the full range of label colors.

### Step 4: `resolveColor()` — Main entry point with caching

**File:** `apps/tui/src/util/color.ts`

1. Implement `resolveColor(hexColor, tier, mutedFallback)` combining validation, luminance floor, tier mapping, and caching.
2. Implement `isNoColor()` env check.
3. Implement module-level LRU cache (256 entries).
4. Verify all cases:
   - `resolveColor("#16A34A", "truecolor", muted)` → RGBA from hex with luminance floor
   - `resolveColor("#16A34A", "ansi256", muted)` → nearest 256-color RGBA
   - `resolveColor("#16A34A", "ansi16", muted)` → nearest 16-color RGBA
   - `resolveColor("#000000", "truecolor", muted)` → brightened RGBA
   - `resolveColor("#ZZZZZZ", "truecolor", muted)` → `muted` fallback
   - `resolveColor(null, "truecolor", muted)` → `muted` fallback
   - `resolveColor("", "truecolor", muted)` → `muted` fallback
   - With `NO_COLOR=1`: `resolveColor("#16A34A", "ansi16", muted)` → `undefined`

**Definition of done:** All 8 resolution paths produce correct output. Cache hits return same RGBA identity.

### Step 5: `<LabelBadge>` — Single badge component

**File:** `apps/tui/src/components/LabelBadge.tsx`

1. Implement `<LabelBadge>` component consuming `useTheme()`, `useColorTier()`, `resolveColor()`, `truncateToWidth()`.
2. Handle empty/whitespace name → `[?]` in warning color.
3. Handle NO_COLOR → all fg props `undefined`.
4. Implement `badgeDisplayWidth()` utility.
5. No hardcoded ANSI escape codes — all colors via OpenTUI `fg` props.

**Definition of done:** Component renders correctly with valid labels, invalid colors, empty names, and NO_COLOR mode.

### Step 6: `<LabelBadgeList>` and overflow algorithm

**File:** `apps/tui/src/components/LabelBadge.tsx`

1. Implement `computeVisibleLabels()` with the greedy fit + overflow indicator algorithm.
2. Implement `<LabelBadgeList>` component.
3. Verify: 5 labels in 20-column space → shows 2–3 labels + `+N`.
4. Verify: 1 label in 20-column space → shows 1 label, no overflow.
5. Verify: 0 labels → returns `null`.
6. Verify: all labels fit → no `+N` indicator.
7. Verify: no labels fit (all too wide) → shows `+N` for all.

**Definition of done:** Overflow algorithm is correct for all edge cases. Component renders with proper gap spacing.

---

## 7. Unit & Integration Tests

### Test File: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test` and `bun:test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### 7.1 Color Utility Tests (pure function tests — no TUI launch needed)

These tests can run as unit tests within the same file since they test pure functions. They use `bun:test` assertions directly.

```typescript
import { describe, test, expect } from "bun:test";
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
} from "../../apps/tui/src/util/color.js";
import {
  badgeDisplayWidth,
  computeVisibleLabels,
} from "../../apps/tui/src/components/LabelBadge.js";
```

#### displayWidth tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-DW-001 | ASCII string width | `displayWidth("hello")` === 5 |
| UNIT-DW-002 | CJK characters double-width | `displayWidth("你好")` === 4 |
| UNIT-DW-003 | Mixed ASCII and CJK | `displayWidth("hi你好")` === 6 |
| UNIT-DW-004 | Emoji double-width | `displayWidth("🚀")` === 2 |
| UNIT-DW-005 | Combining marks zero-width | `displayWidth("a\u0300")` === 1 |
| UNIT-DW-006 | Empty string | `displayWidth("")` === 0 |
| UNIT-DW-007 | Fullwidth forms | `displayWidth("Ａ")` === 2 (U+FF21) |
| UNIT-DW-008 | Hangul syllable | `displayWidth("한")` === 2 |
| UNIT-DW-009 | Zero-width space | `displayWidth("a\u200Bb")` === 2 |

#### truncateToWidth tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-TW-001 | No truncation needed | `truncateToWidth("hello", 10)` === `"hello"` |
| UNIT-TW-002 | ASCII truncation | `truncateToWidth("hello world", 7)` ends with `"…"` and `displayWidth(result)` ≤ 7 |
| UNIT-TW-003 | CJK truncation respects width | `truncateToWidth("你好世界", 5)` → `"你好…"` (4+1=5) |
| UNIT-TW-004 | Emoji truncation | `truncateToWidth("🚀🎉🌟", 4)` → `"🚀…"` (2+1=3, can't fit 🎉 at col 4) |
| UNIT-TW-005 | maxWidth 0 | `truncateToWidth("hello", 0)` === `""` |
| UNIT-TW-006 | maxWidth 1 | `truncateToWidth("hello", 1)` === `"…"` |
| UNIT-TW-007 | Exact fit | `truncateToWidth("hello", 5)` === `"hello"` |
| UNIT-TW-008 | Grapheme cluster boundary | `truncateToWidth("a\u0300bc", 2)` does not split combining mark from base |

#### relativeLuminance tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-LUM-001 | Black luminance | `relativeLuminance(RGBA.fromHex("#000000"))` ≈ 0.0 |
| UNIT-LUM-002 | White luminance | `relativeLuminance(RGBA.fromHex("#FFFFFF"))` ≈ 1.0 |
| UNIT-LUM-003 | Pure red luminance | `relativeLuminance(RGBA.fromHex("#FF0000"))` ≈ 0.2126 |
| UNIT-LUM-004 | Pure green luminance | `relativeLuminance(RGBA.fromHex("#00FF00"))` ≈ 0.7152 |
| UNIT-LUM-005 | Pure blue luminance | `relativeLuminance(RGBA.fromHex("#0000FF"))` ≈ 0.0722 |
| UNIT-LUM-006 | Mid gray luminance | `relativeLuminance(RGBA.fromHex("#808080"))` ≈ 0.216 (within tolerance) |

#### brightenToFloor tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-BF-001 | Black brightened | `relativeLuminance(brightenToFloor(RGBA.fromHex("#000000")))` ≥ 0.15 |
| UNIT-BF-002 | Very dark color brightened | `relativeLuminance(brightenToFloor(RGBA.fromHex("#0A0A0A")))` ≥ 0.15 |
| UNIT-BF-003 | Bright color unchanged | `brightenToFloor(RGBA.fromHex("#FFFF00"))` equals input |
| UNIT-BF-004 | Mid brightness unchanged | `brightenToFloor(RGBA.fromHex("#808080"))` equals input (luminance > 0.15) |
| UNIT-BF-005 | Dark blue brightened | `relativeLuminance(brightenToFloor(RGBA.fromHex("#00001A")))` ≥ 0.15 |
| UNIT-BF-006 | Near-floor passes through | Color with luminance 0.16 returned unchanged |

#### nearestAnsi256 tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-A256-001 | Pure red | `nearestAnsi256(RGBA.fromHex("#FF0000"))` maps to red region |
| UNIT-A256-002 | Pure green | `nearestAnsi256(RGBA.fromHex("#00FF00"))` maps to green region |
| UNIT-A256-003 | Pure blue | `nearestAnsi256(RGBA.fromHex("#0000FF"))` maps to blue region |
| UNIT-A256-004 | Gray maps to grayscale | `nearestAnsi256(RGBA.fromHex("#7F7F7F"))` maps to grayscale entry |
| UNIT-A256-005 | White maps correctly | `nearestAnsi256(RGBA.fromHex("#FFFFFF"))` maps to white |

#### nearestAnsi16 tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-A16-001 | Red maps to red | `nearestAnsi16(RGBA.fromHex("#FF0000"))` → bright red |
| UNIT-A16-002 | Green maps to green | `nearestAnsi16(RGBA.fromHex("#00FF00"))` → bright green |
| UNIT-A16-003 | Dark blue maps to blue | `nearestAnsi16(RGBA.fromHex("#000080"))` → blue |
| UNIT-A16-004 | GitHub green | `nearestAnsi16(RGBA.fromHex("#16A34A"))` → green |

#### resolveColor tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-RC-001 | Valid hex truecolor | Returns RGBA from hex with luminance check |
| UNIT-RC-002 | Valid hex ansi256 | Returns nearest 256-color RGBA |
| UNIT-RC-003 | Valid hex ansi16 | Returns nearest 16-color RGBA |
| UNIT-RC-004 | #000000 is brightened | Result luminance ≥ 0.15 |
| UNIT-RC-005 | Invalid hex returns muted | `resolveColor("#ZZZZZZ", "truecolor", muted)` === muted |
| UNIT-RC-006 | Null returns muted | `resolveColor(null, "truecolor", muted)` === muted |
| UNIT-RC-007 | Empty string returns muted | `resolveColor("", "truecolor", muted)` === muted |
| UNIT-RC-008 | Hex without # prefix | `resolveColor("16A34A", "truecolor", muted)` returns valid RGBA |
| UNIT-RC-009 | Cache hit returns same identity | Two calls with same args return `===` result |
| UNIT-RC-010 | NO_COLOR returns undefined | With `NO_COLOR=1`, returns `undefined` |

#### badgeDisplayWidth tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-BDW-001 | Short label | `badgeDisplayWidth({id:1, name:"bug", color:"#FF0000"}, 12)` === 5 |
| UNIT-BDW-002 | Long label truncated | `badgeDisplayWidth({id:1, name:"a".repeat(20), color:"#FF0000"}, 12)` === 14 |
| UNIT-BDW-003 | Empty name | `badgeDisplayWidth({id:1, name:"", color:"#FF0000"}, 12)` === 3 |
| UNIT-BDW-004 | CJK label | `badgeDisplayWidth({id:1, name:"你好", color:"#FF0000"}, 12)` === 6 |

#### computeVisibleLabels tests

| Test ID | Name | Assertion |
|---------|------|-----------|
| UNIT-CVL-001 | All labels fit | 2 short labels in 20-col → visible=2, overflow=0 |
| UNIT-CVL-002 | Overflow triggered | 5 labels in 20-col → visible < 5, overflow > 0 |
| UNIT-CVL-003 | Single label fits | 1 label in 20-col → visible=1, overflow=0 |
| UNIT-CVL-004 | Zero labels | Empty array → visible=[], overflow=0 |
| UNIT-CVL-005 | No labels fit | Labels too wide for space → visible=[], overflow=N |
| UNIT-CVL-006 | Exact fit no overflow | Labels exactly fill available space → no +N |
| UNIT-CVL-007 | +N width accounts for digit count | 15 labels overflow → "+12" uses 3 columns |
| UNIT-CVL-008 | CJK labels in overflow | CJK labels consume 2x width per character |

### 7.2 Component Snapshot Tests (require TUI launch)

These tests launch the TUI and navigate to issue screens to verify label rendering.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers.js";
```

| Test ID | Name | Description |
|---------|------|-------------|
| SNAP-LABELS-001 | Issue list row with 1 label at 120×40 | Navigate to issue list (`g i`), verify `[bug]` badge appears after issue title in colored text |
| SNAP-LABELS-002 | Issue list row with 3 labels at 120×40 | Verify `[bug] [ui] [docs]` inline with space separation |
| SNAP-LABELS-003 | Issue list row with overflow at 120×40 | Verify `[bug] [ui] +3` when 5 labels overflow 20-char column |
| SNAP-LABELS-004 | Issue list row at 200×60 | Verify wider 30-char column, more labels visible, 15ch truncation |
| SNAP-LABELS-005 | Issue list row at 80×24 | Verify no labels column visible at minimum breakpoint |
| SNAP-LABELS-016 | Dark color brightened | Issue with `#000000` label renders badge with visible (brightened) text |
| SNAP-LABELS-017 | Bright color rendered as-is | Issue with `#FFFF00` label renders badge with yellow text |
| SNAP-LABELS-018 | Invalid color fallback | Issue with `#ZZZZZZ` label renders badge in muted color |
| SNAP-LABELS-019 | Long label truncated | 30-char label name renders with ellipsis in list row |
| SNAP-LABELS-020 | +N overflow in muted | Overflow indicator `+3` renders in muted/gray color |
| SNAP-LABELS-022 | NO_COLOR rendering | Launch with `env: { NO_COLOR: "1" }`, verify plain `[label]` text without color |

**Test structure:**

```typescript
describe("LabelBadge rendering", () => {
  let terminal: TUITestInstance;
  
  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });
  
  test("SNAP-LABELS-001: issue list row with 1 label at 120x40", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--repo", "testorg/testrepo"] });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    
    // Snapshot captures full terminal output including colored label badges
    expect(terminal.snapshot()).toMatchSnapshot();
  });
  
  test("SNAP-LABELS-005: no labels at 80x24 minimum breakpoint", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24, args: ["--repo", "testorg/testrepo"] });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    
    // At minimum breakpoint, label column should not be visible
    const snap = terminal.snapshot();
    // Labels should not appear in list rows (only title + status)
    expect(snap).toMatchSnapshot();
  });
  
  test("SNAP-LABELS-022: NO_COLOR disables all label coloring", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--repo", "testorg/testrepo"],
      env: { NO_COLOR: "1" },
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    
    // Labels should render as plain [label-name] without ANSI color codes
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

### 7.3 Edge Case Tests

| Test ID | Name | Description |
|---------|------|-------------|
| EDGE-LABELS-001 | 255-char label name | Label with max-length name is truncated correctly, no overflow/crash |
| EDGE-LABELS-002 | Emoji label | Label named `"🐛 bug"` renders with correct width accounting |
| EDGE-LABELS-003 | CJK label | Label named `"重要なバグ"` renders with double-width characters |
| EDGE-LABELS-004 | #000000 brightened | Black label color has luminance ≥ 0.15 after brightening |
| EDGE-LABELS-005 | Hex without # prefix | Color `"16A34A"` (no #) resolves correctly |
| EDGE-LABELS-006 | Invalid hex #ZZZZZZ | Falls back to muted color, no crash |
| EDGE-LABELS-007 | Empty color string | Falls back to muted color |
| EDGE-LABELS-008 | 50 labels in list row | Shows first few + `+N`, no crash |
| EDGE-LABELS-012 | Whitespace-only name | Renders as `[?]` in warning color |
| EDGE-LABELS-013 | Duplicate names different colors | Each badge uses its own label's color |

### 7.4 Responsive Tests

| Test ID | Name | Description |
|---------|------|-------------|
| RESP-LABELS-001 | Labels hidden at 80×24 | Label column not rendered at minimum breakpoint |
| RESP-LABELS-002 | Resize 120→80 | Column disappears on terminal shrink |
| RESP-LABELS-003 | Resize 80→120 | Column appears with badges on terminal grow |
| RESP-LABELS-005 | Truncation changes on resize | List truncation changes from 12ch to 15ch |
| RESP-LABELS-006 | Overflow recalculates on resize | Different number of visible labels after resize |

```typescript
describe("LabelBadge responsive behavior", () => {
  let terminal: TUITestInstance;
  
  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });
  
  test("RESP-LABELS-002: resize 120→80 hides label column", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--repo", "testorg/testrepo"] });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    
    // Labels should be visible at 120 columns
    const before = terminal.snapshot();
    
    // Resize to minimum
    await terminal.resize(80, 24);
    
    // Labels should be hidden at 80 columns
    const after = terminal.snapshot();
    expect(after).toMatchSnapshot();
  });
});
```

---

## 8. Integration Points

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
- `useTheme()` → provides `theme.muted` for bracket color and fallback
- `useColorTier()` → provides the detected tier for `resolveColor()`

These hooks are provided by `ThemeProvider` (from `tui-bootstrap-and-renderer` dependency). The component will crash with a clear error if rendered outside the provider tree.

### Integration with `@codeplane/ui-core`

Label data comes from:
- `useIssues(owner, repo)` → issues include `labels: Label[]` array
- `useLabels(owner, repo)` → all repository labels for pickers

The `<LabelBadge>` component does not fetch data itself — it receives `Label` objects as props from the consuming screen.

---

## 9. Productionization Checklist

This section covers how to move from PoC-quality code to production-ready.

### 9.1 Performance

- [ ] `resolveColor()` cache is bounded at 256 entries with LRU eviction. Verify no memory growth during long sessions with many unique label colors.
- [ ] `displayWidth()` iterates codepoints, not bytes. Verify O(n) performance on 255-char label names.
- [ ] `Intl.Segmenter` is instantiated per `truncateToWidth()` call. If profiling shows this is hot, hoist a module-level singleton: `const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });`
- [ ] `computeVisibleLabels()` pre-computes all badge widths upfront. For 50+ labels, this is still O(n) — acceptable. No optimization needed unless profiling shows otherwise.
- [ ] All RGBA constants in palette tables (`ANSI_16_PALETTE`, `CUBE_LEVELS`) are module-level frozen arrays — zero per-render allocation.

### 9.2 Error Boundaries

- [ ] `resolveColor()` never throws. All error paths (invalid hex, null input) return fallback values.
- [ ] `RGBA.fromHex()` with invalid input returns magenta (OpenTUI default). `resolveColor()` catches this by validating hex before calling `fromHex()`.
- [ ] `<LabelBadge>` handles `undefined` color gracefully (muted fallback).
- [ ] `<LabelBadgeList>` handles empty label arrays (returns `null`).

### 9.3 Accessibility

- [ ] Luminance floor (0.15) ensures all label colors are readable on dark backgrounds.
- [ ] `NO_COLOR` support follows the https://no-color.org/ standard exactly.
- [ ] Bracket color (muted) provides structural cues even when label color is similar to background.
- [ ] Overflow indicator `+N` uses muted color so it doesn't compete visually with label colors.

### 9.4 Testing Coverage

- [ ] Pure function tests cover all code paths in `color.ts` without TUI launch (fast, deterministic).
- [ ] Snapshot tests verify visual output at minimum (80×24), standard (120×40), and large (200×60) breakpoints.
- [ ] Edge cases (CJK, emoji, 255-char names, black color, invalid hex, NO_COLOR) all have explicit test cases.
- [ ] Tests that fail due to unimplemented API backends are left failing — never skipped.

### 9.5 Code Hygiene

- [ ] No hardcoded ANSI escape sequences. All colors flow through OpenTUI's `fg`/`bg` props.
- [ ] No `console.log` in production paths. Only `console.warn` for invalid color fallbacks.
- [ ] All exports are explicitly listed (no `export *`).
- [ ] Types exported separately from runtime values.
- [ ] Module structure follows existing patterns (`util/` for pure functions, `components/` for React components).
- [ ] JSDoc on all public functions with `@param` and `@returns`.

---

## 10. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `tui-bootstrap-and-renderer` | Ticket | **Required** — provides ThemeProvider, color detection, OpenTUI renderer, provider stack |
| `@opentui/core` (RGBA) | Package | Available — provides `RGBA.fromHex()`, `RGBA.fromInts()`, `RGBA.fromValues()` |
| `@opentui/react` | Package | Available — provides React reconciler and JSX element mapping |
| `@codeplane/ui-core` | Package | Available — provides `useLabels()`, `useIssues()` data hooks |
| `react` 19.x | Package | Available — component model |

No new dependencies are introduced by this ticket.

---

## 11. Open Questions

None. All design decisions are resolved:

- Luminance floor threshold: **0.15** (WCAG-informed, tested against dark backgrounds)
- Truncation limits: **12ch list / 15ch list-large / 30ch detail / 40ch picker** (from TUI_ISSUE_LABELS_DISPLAY spec)
- Overflow indicator format: **`+N`** in muted color (compact, scannable)
- CJK/emoji handling: **`displayWidth()` with Unicode range checks** (standard approach)
- Cache size: **256 entries** (covers typical repository with <100 unique label colors, with headroom)
- NO_COLOR behavior: **return `undefined`** so OpenTUI uses terminal default foreground
# Engineering Specification: `tui-diff-syntax-style`

## Diff syntax style setup: SyntaxStyle memoization and color palette

**Ticket ID:** `tui-diff-syntax-style`
**Type:** Engineering (infrastructure)
**Feature:** Supports `TUI_DIFF_SYNTAX_HIGHLIGHT`
**Dependencies:** None
**Status:** Not started

---

## Overview

This ticket creates the syntax highlighting style infrastructure for the TUI diff viewer. It delivers two modules:

1. **`apps/tui/src/lib/diff-syntax.ts`** — Pure utility module containing the 17-token color palette definitions, color-tier-aware palette construction, and the `resolveFiletype()` function for language detection.
2. **`apps/tui/src/hooks/useDiffSyntaxStyle.ts`** — React hook that memoizes a `SyntaxStyle` instance per diff screen lifecycle and cleans up native resources on unmount.

These modules are consumed by the diff screen components (`DiffUnifiedView`, `DiffSplitView`, `DiffSyntaxProvider`) to pass `syntaxStyle` and `filetype` props to OpenTUI's `<diff>` component.

---

## Implementation Plan

### Step 1: Define the color palette constants

**File:** `apps/tui/src/lib/diff-syntax.ts`

Define three static palette objects — one per color capability tier — containing the 17 syntax token colors. Each palette is a `Record<string, StyleDefinition>` compatible with `SyntaxStyle.fromStyles()`.

**Truecolor palette (24-bit RGB):**

| Token | Hex | Attributes |
|-------|-----|------------|
| `keyword` | `#FF7B72` | bold |
| `keyword.import` | `#FF7B72` | bold |
| `string` | `#A5D6FF` | — |
| `comment` | `#8B949E` | italic |
| `number` | `#79C0FF` | — |
| `boolean` | `#79C0FF` | — |
| `constant` | `#79C0FF` | — |
| `function` | `#D2A8FF` | — |
| `function.call` | `#D2A8FF` | — |
| `constructor` | `#FFA657` | — |
| `type` | `#FFA657` | — |
| `operator` | `#FF7B72` | — |
| `variable` | `#E6EDF3` | — |
| `property` | `#79C0FF` | — |
| `bracket` | `#F0F6FC` | — |
| `punctuation` | `#F0F6FC` | — |
| `default` | `#E6EDF3` | — |

Colors are created once via `RGBA.fromHex()` and stored as module-level constants. No `parseColor()` call happens at runtime per-render.

**ANSI 256 palette:** Same token names, colors expressed as the nearest ANSI 256 index via `RGBA.fromInts()` mapped to the xterm-256 color cube. Specific indices:

| Token | ANSI 256 Index | RGB Approximation |
|-------|---------------|-------------------|
| `keyword` | 209 | `#FF875F` |
| `string` | 153 | `#AFD7FF` |
| `comment` | 248 | `#A8A8A8` |
| `number` | 117 | `#87D7FF` |
| `boolean` | 117 | `#87D7FF` |
| `constant` | 117 | `#87D7FF` |
| `function` | 183 | `#D7AFFF` |
| `function.call` | 183 | `#D7AFFF` |
| `constructor` | 215 | `#FFAF5F` |
| `type` | 215 | `#FFAF5F` |
| `operator` | 209 | `#FF875F` |
| `variable` | 255 | `#EEEEEE` |
| `property` | 117 | `#87D7FF` |
| `bracket` | 255 | `#EEEEEE` |
| `punctuation` | 255 | `#EEEEEE` |
| `default` | 255 | `#EEEEEE` |

The ANSI 256 indices are converted to their known RGB equivalents via `RGBA.fromInts()` to produce `RGBA` objects that OpenTUI's renderer will automatically output as 256-color SGR sequences on non-truecolor terminals.

**ANSI 16 palette:** Reduced scheme using basic ANSI colors:

| Token | ANSI 16 Color | RGBA approximation | Attributes |
|-------|--------------|-------------------|------------|
| `keyword` | Red | `RGBA.fromInts(255, 0, 0)` | bold |
| `keyword.import` | Red | `RGBA.fromInts(255, 0, 0)` | bold |
| `string` | Cyan | `RGBA.fromInts(0, 255, 255)` | — |
| `comment` | White | `RGBA.fromInts(192, 192, 192)` | dim |
| `number` | Cyan | `RGBA.fromInts(0, 255, 255)` | — |
| `boolean` | Cyan | `RGBA.fromInts(0, 255, 255)` | — |
| `constant` | Cyan | `RGBA.fromInts(0, 255, 255)` | — |
| `function` | Magenta | `RGBA.fromInts(255, 0, 255)` | — |
| `function.call` | Magenta | `RGBA.fromInts(255, 0, 255)` | — |
| `constructor` | Yellow | `RGBA.fromInts(255, 255, 0)` | — |
| `type` | Yellow | `RGBA.fromInts(255, 255, 0)` | — |
| `operator` | Red | `RGBA.fromInts(255, 0, 0)` | — |
| `variable` | White | `RGBA.fromInts(255, 255, 255)` | — |
| `property` | Cyan | `RGBA.fromInts(0, 255, 255)` | — |
| `bracket` | White | `RGBA.fromInts(255, 255, 255)` | — |
| `punctuation` | White | `RGBA.fromInts(255, 255, 255)` | — |
| `default` | White | `RGBA.fromInts(255, 255, 255)` | — |

**Implementation detail:** Each palette is a frozen module-level constant. The `RGBA` objects within each palette are allocated once at module load time, never per render cycle. All three palettes are statically defined — there is no dynamic color computation.

```typescript
import { RGBA, type StyleDefinition } from "@opentui/core"

// Module-level RGBA constants (allocated once)
const KEYWORD_TC = RGBA.fromHex("#FF7B72")
const STRING_TC = RGBA.fromHex("#A5D6FF")
const COMMENT_TC = RGBA.fromHex("#8B949E")
// ... etc for all 17 tokens × 3 tiers

export const TRUECOLOR_PALETTE: Record<string, StyleDefinition> = Object.freeze({
  keyword: { fg: KEYWORD_TC, bold: true },
  "keyword.import": { fg: KEYWORD_TC, bold: true },
  string: { fg: STRING_TC },
  comment: { fg: COMMENT_TC, italic: true },
  // ... remaining 14 tokens
})

export const ANSI256_PALETTE: Record<string, StyleDefinition> = Object.freeze({ /* ... */ })
export const ANSI16_PALETTE: Record<string, StyleDefinition> = Object.freeze({ /* ... */ })
```

### Step 2: Implement color capability tier detection

**File:** `apps/tui/src/lib/diff-syntax.ts`

Export a `ColorTier` type and `detectColorTier()` function. This function is a pure synchronous check against environment variables, consistent with the ThemeProvider's detection logic defined in `TUI_THEME_AND_COLOR_TOKENS`.

```typescript
export type ColorTier = "truecolor" | "ansi256" | "ansi16"

export function detectColorTier(): ColorTier {
  const colorterm = process.env.COLORTERM?.toLowerCase()
  if (colorterm === "truecolor" || colorterm === "24bit") {
    return "truecolor"
  }

  const term = process.env.TERM?.toLowerCase() ?? ""
  if (term.includes("256color")) {
    return "ansi256"
  }

  // Bare linux console, old xterm, or unset
  if (term === "linux" || term === "xterm" || term === "" || term === "dumb") {
    return "ansi16"
  }

  // Default to 256-color for unknown terminals
  return "ansi256"
}
```

**Design decision:** This function duplicates the detection logic from the ThemeProvider rather than depending on it. This keeps `diff-syntax.ts` dependency-free (no React context import) and testable in isolation. If the ThemeProvider's `ColorTier` is already available at the hook level (Step 4), the hook can pass it directly, avoiding a redundant detection call.

Export a palette selector function:

```typescript
export function getPaletteForTier(tier: ColorTier): Record<string, StyleDefinition> {
  switch (tier) {
    case "truecolor": return TRUECOLOR_PALETTE
    case "ansi256": return ANSI256_PALETTE
    case "ansi16": return ANSI16_PALETTE
  }
}
```

### Step 3: Implement `resolveFiletype()` for language detection

**File:** `apps/tui/src/lib/diff-syntax.ts`

Export a `resolveFiletype()` function that resolves a language identifier from the API response's `language` field, falling back to `pathToFiletype()` from `@opentui/core`.

```typescript
import { pathToFiletype } from "@opentui/core"

const MAX_PATH_LENGTH = 4096

export function resolveFiletype(
  apiLanguage: string | null | undefined,
  filePath: string
): string | undefined {
  // 1. Prefer explicit API language field
  if (typeof apiLanguage === "string") {
    const trimmed = apiLanguage.trim()
    if (trimmed.length > 0) {
      return trimmed.toLowerCase()
    }
  }

  // 2. Fall back to path-based detection
  if (typeof filePath === "string" && filePath.length > 0 && filePath.length <= MAX_PATH_LENGTH) {
    return pathToFiletype(filePath)
  }

  // 3. No language detected — plain text
  return undefined
}
```

**`pathToFiletype` behavior recap** (from `@opentui/core`'s `resolve-ft.ts`):
- Normalizes path separators (Windows backslashes → forward slashes)
- Checks basename against 31 special filename mappings (Dockerfile, Makefile, .bashrc, etc.)
- Falls back to file extension against 100+ extension mappings
- Returns `undefined` for unrecognized paths

**Edge cases handled:**
- `apiLanguage: null` → falls through to path detection
- `apiLanguage: ""` → trimmed to empty string → falls through to path detection
- `apiLanguage: "brainfuck"` → passes through as `"brainfuck"` → Tree-sitter won't find a parser → file renders as plain text (no error)
- `filePath: ""` → skipped, returns `undefined`
- `filePath` exceeding 4096 chars → skipped, returns `undefined`
- `filePath: "config.test.ts"` → extension is `"ts"` → resolves to `"typescript"`

### Step 4: Create `createDiffSyntaxStyle()` factory function

**File:** `apps/tui/src/lib/diff-syntax.ts`

Export a factory function that creates a `SyntaxStyle` instance for a given color tier. This function is the single creation point for diff syntax styles.

```typescript
import { SyntaxStyle } from "@opentui/core"

export function createDiffSyntaxStyle(tier: ColorTier): SyntaxStyle {
  const palette = getPaletteForTier(tier)
  return SyntaxStyle.fromStyles(palette)
}
```

**`SyntaxStyle.fromStyles()` internals** (from source analysis):
1. Calls `SyntaxStyle.create()` which allocates a native Zig-backed style object via FFI
2. Iterates over `Record<string, StyleDefinition>` entries
3. For each entry, calls `registerStyle(name, style)` which:
   - Creates a packed `attributes` number from `bold/italic/underline/dim` flags via `createTextAttributes()`
   - Calls the native `syntaxStyleRegister()` FFI function with name, fg RGBA, bg RGBA, attributes
   - Caches the returned style ID in `nameCache` and `styleDefs`
4. Returns the populated `SyntaxStyle` instance

The returned instance holds a native pointer (`stylePtr`) that **must** be freed via `.destroy()` to avoid memory leaks.

### Step 5: Create `useDiffSyntaxStyle` React hook

**File:** `apps/tui/src/hooks/useDiffSyntaxStyle.ts`

This hook memoizes a `SyntaxStyle` instance for the lifetime of the diff screen component and ensures cleanup on unmount.

```typescript
import { useMemo, useEffect, useRef } from "react"
import { type SyntaxStyle } from "@opentui/core"
import { createDiffSyntaxStyle, detectColorTier, type ColorTier } from "../lib/diff-syntax.js"

/**
 * Creates and memoizes a SyntaxStyle instance for the diff viewer.
 * 
 * The style is created once when the hook first runs and destroyed
 * when the component unmounts. It is NOT recreated on:
 * - View mode toggle (unified ↔ split)
 * - File navigation (]/[)
 * - Whitespace toggle (w)
 * - Terminal resize
 * - Scroll position changes
 * 
 * @param colorTier - Optional color tier override. If not provided,
 *   detects from environment variables. Pass from ThemeProvider context
 *   when available to avoid redundant detection.
 * @returns A stable SyntaxStyle instance, or null if creation failed.
 */
export function useDiffSyntaxStyle(colorTier?: ColorTier): SyntaxStyle | null {
  const tier = colorTier ?? detectColorTier()
  
  // Ref to track whether the style was created successfully
  const styleRef = useRef<SyntaxStyle | null>(null)

  const syntaxStyle = useMemo(() => {
    try {
      const style = createDiffSyntaxStyle(tier)
      styleRef.current = style
      return style
    } catch (err) {
      // SyntaxStyle.fromStyles() failed (e.g., native lib unavailable)
      // Log error; diff will render without syntax highlighting
      console.error("diff.syntax.style_create_failed", err)
      styleRef.current = null
      return null
    }
  }, [tier])

  // Cleanup: destroy native resources on unmount
  useEffect(() => {
    return () => {
      if (styleRef.current) {
        styleRef.current.destroy()
        styleRef.current = null
      }
    }
  }, [syntaxStyle])

  return syntaxStyle
}
```

**Memoization semantics:**

- `useMemo` dependency array is `[tier]`. The color tier is determined at startup and does not change during a TUI session (no hot-reloading of terminal color capabilities). Therefore, the `SyntaxStyle` is effectively created once per mount.
- If the ThemeProvider context exposes a `colorTier` value, the hook consumer should pass it as the argument. This avoids the redundant `detectColorTier()` call and ensures consistency with the theme system's detection.
- The `useMemo` dependency on `tier` means if a consumer somehow passes a changing tier value, the old style is NOT automatically destroyed — the `useEffect` cleanup handles that by watching `syntaxStyle` identity.

**Cleanup contract:**

- `useEffect` with `[syntaxStyle]` dependency runs cleanup when `syntaxStyle` changes or the component unmounts.
- The cleanup callback calls `syntaxStyle.destroy()`, which:
  - Clears `nameCache`, `styleDefs`, `mergedCache` Maps
  - Calls native `destroySyntaxStyle(stylePtr)` via FFI to free Zig-allocated memory
  - Sets `_destroyed = true` — subsequent calls to any method throw `"NativeSyntaxStyle is destroyed"`
- Double-destroy is safe: `destroy()` checks `_destroyed` flag and returns immediately if already destroyed.
- The `useRef` ensures we track the current style instance even if React batches state updates.

**Error handling:**

- If `SyntaxStyle.fromStyles()` throws (e.g., native library not available, invalid RGBA), the hook returns `null`.
- Consumers must handle `null` by omitting the `syntaxStyle` prop from `<diff>`, which results in plain-text rendering with diff colors intact.
- The error is logged at `error` level with the `diff.syntax.style_create_failed` event name for observability.

### Step 6: Export public API

**File:** `apps/tui/src/lib/diff-syntax.ts`

The module exports:

```typescript
// Types
export type { ColorTier }

// Constants
export { TRUECOLOR_PALETTE, ANSI256_PALETTE, ANSI16_PALETTE }

// Functions
export { detectColorTier, getPaletteForTier, createDiffSyntaxStyle, resolveFiletype }

// Re-exported for convenience (from @opentui/core)
export { pathToFiletype } from "@opentui/core"
```

**File:** `apps/tui/src/hooks/useDiffSyntaxStyle.ts`

```typescript
export { useDiffSyntaxStyle }
```

### Step 7: Integration pattern for consumers

This step documents how downstream tickets consume these modules. No new files are created in this step — it describes the integration contract.

**In `DiffScreen.tsx` (from `tui-diff-screen-scaffold`):**

```tsx
import { useDiffSyntaxStyle } from "../../hooks/useDiffSyntaxStyle.js"
import { resolveFiletype } from "../../lib/diff-syntax.js"
import { useTheme } from "../../hooks/useTheme.js"

function DiffScreen({ files }: DiffScreenProps) {
  const theme = useTheme()
  
  // SyntaxStyle: created once, shared across all <diff> instances
  const syntaxStyle = useDiffSyntaxStyle(theme.colorTier)
  
  return (
    <>
      {files.map(file => (
        <diff
          key={file.path}
          diff={file.patch}
          view={viewMode}
          filetype={resolveFiletype(file.language, file.path)}
          syntaxStyle={syntaxStyle ?? undefined}
          showLineNumbers={true}
          addedBg={theme.diffAddedBg}
          removedBg={theme.diffRemovedBg}
          addedSignColor={theme.diffAddedText}
          removedSignColor={theme.diffRemovedText}
          lineNumberFg={theme.muted}
        />
      ))}
    </>
  )
}
```

**Key integration rules:**
- `syntaxStyle` is passed as `syntaxStyle ?? undefined` — the `<diff>` component handles `undefined` by rendering without syntax highlighting.
- `filetype` is resolved per-file using `resolveFiletype()` — each file in a multi-language diff gets its own language identifier.
- The `SyntaxStyle` instance is shared across all files — `SyntaxStyle.getStyleId()` resolves token names to IDs regardless of which language Tree-sitter is processing.

---

## File Manifest

| File | Purpose | New/Existing |
|------|---------|-------------|
| `apps/tui/src/lib/diff-syntax.ts` | Color palettes, tier detection, filetype resolution, style factory | New |
| `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | React hook for memoized SyntaxStyle lifecycle | New |
| `e2e/tui/diff.test.ts` | E2E tests for syntax style setup | New (tests appended to future diff test file) |

---

## API Surface

### `apps/tui/src/lib/diff-syntax.ts`

```typescript
type ColorTier = "truecolor" | "ansi256" | "ansi16"

// Constants
const TRUECOLOR_PALETTE: Readonly<Record<string, StyleDefinition>>
const ANSI256_PALETTE: Readonly<Record<string, StyleDefinition>>
const ANSI16_PALETTE: Readonly<Record<string, StyleDefinition>>

// Palette token count (all three palettes)
const SYNTAX_TOKEN_COUNT = 17

// Functions
function detectColorTier(): ColorTier
function getPaletteForTier(tier: ColorTier): Record<string, StyleDefinition>
function createDiffSyntaxStyle(tier: ColorTier): SyntaxStyle
function resolveFiletype(apiLanguage: string | null | undefined, filePath: string): string | undefined
```

### `apps/tui/src/hooks/useDiffSyntaxStyle.ts`

```typescript
function useDiffSyntaxStyle(colorTier?: ColorTier): SyntaxStyle | null
```

---

## Productionization Notes

### From PoC to production

If any proof-of-concept code exists in `poc/` for SyntaxStyle or color tier detection, the following must be addressed before merging to `apps/tui/src/`:

1. **RGBA allocation audit:** Verify that all `RGBA.fromHex()` and `RGBA.fromInts()` calls happen at module scope (static allocation), not inside functions that run per-render. Any PoC code that creates RGBA objects dynamically must be refactored to reference module-level constants.

2. **Error boundaries:** PoC code may not handle `SyntaxStyle.fromStyles()` failure. Production code must catch and degrade gracefully (return `null` from hook, omit `syntaxStyle` prop).

3. **Destroy lifecycle:** PoC code may omit `.destroy()` cleanup. Production hook must ensure `destroy()` is called on every unmount path, including error boundaries and React strict mode double-mount/unmount cycles.

4. **Frozen palettes:** PoC code may use mutable palette objects. Production code must `Object.freeze()` all palette constants to prevent accidental mutation.

5. **Color tier consistency:** If PoC code detects color tier independently from the ThemeProvider, production code should accept an optional `colorTier` parameter from the theme context to ensure a single source of truth.

6. **No dynamic imports:** `@opentui/core`'s `SyntaxStyle`, `RGBA`, and `pathToFiletype` must be statically imported. Dynamic `import()` would delay first-render.

### Performance budget

- Module load time: < 5ms (three frozen palette objects, ~51 RGBA allocations total)
- `createDiffSyntaxStyle()`: < 10ms (17 `registerStyle` FFI calls)
- `resolveFiletype()`: < 1ms (string operations + Map lookups)
- `detectColorTier()`: < 1ms (environment variable reads)
- Memory per `SyntaxStyle` instance: ~2KB (17 styles × native allocation + JS Maps)

### React strict mode

In React 18+ strict mode (development only), `useEffect` cleanup runs twice. The implementation handles this:
- First mount: creates SyntaxStyle, `styleRef.current = style`
- First unmount (strict mode): cleanup calls `style.destroy()`, `styleRef.current = null`
- Second mount: `useMemo` runs again (since the component re-mounted), creates a **new** SyntaxStyle
- Second unmount (real): cleanup destroys the second instance

The `useRef` pattern ensures `styleRef.current` always tracks the latest live instance.

---

## Unit & Integration Tests

### Test file: `e2e/tui/diff.test.ts`

All tests use `@microsoft/tui-test`. Tests that depend on a running API server or backend features that are not yet implemented are left failing — they are never skipped or commented out.

#### Syntax Style Lifecycle Tests

```
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — SyntaxStyle lifecycle", () => {

  test("SNAP-SYN-010: renders syntax highlighting at 80x24 minimum", async () => {
    // Launch TUI at 80x24 minimum terminal size
    // Navigate to diff screen with a TypeScript file
    // Capture terminal snapshot
    // Assert: syntax colors are applied in unified mode
    // Assert: keywords appear in red/pink (ANSI 209 or 16-color red)
    // Assert: strings appear in blue/cyan
    // Assert: comments appear in gray/dim
    // Assert matches golden file at 80x24
  })

  test("SNAP-SYN-001: renders TypeScript diff with syntax highlighting at 120x40", async () => {
    // Launch TUI at 120x40
    // Navigate to diff screen with TypeScript file changes
    // Wait for highlighting to complete (assert keyword colors appear)
    // Capture terminal snapshot
    // Assert: keywords (const, function, return) in #FF7B72 bold
    // Assert: strings in #A5D6FF
    // Assert: comments in #8B949E italic
    // Assert: function names in #D2A8FF
    // Assert: type annotations in #FFA657
    // Assert matches golden file
  })

  test("SNAP-SYN-004: renders syntax highlighting on addition lines with green background", async () => {
    // Launch TUI at 120x40
    // Navigate to diff with additions
    // Capture snapshot of addition lines
    // Assert: green background (ANSI 22 / #1A4D1A) present
    // Assert: syntax token colors visible over green background
    // Assert: colors remain readable (not washed out)
  })

  test("SNAP-SYN-005: renders syntax highlighting on deletion lines with red background", async () => {
    // Launch TUI at 120x40
    // Navigate to diff with deletions
    // Capture snapshot of deletion lines
    // Assert: red background (ANSI 52 / #4D1A1A) present
    // Assert: syntax token colors visible over red background
  })

  test("SNAP-SYN-007: renders plain text for file with unknown language", async () => {
    // Launch TUI at 120x40
    // Navigate to diff containing a LICENSE file (no extension, no basename match)
    // Capture snapshot
    // Assert: file renders with default foreground color (no syntax token colors)
    // Assert: diff colors (green/red backgrounds) still applied
    // Assert: no error message displayed
  })

  test("SNAP-SYN-011: renders multi-language diff with per-file highlighting", async () => {
    // Launch TUI at 120x40
    // Navigate to diff with both .ts and .md files
    // Navigate to TypeScript file: assert TypeScript syntax colors
    // Navigate to Markdown file (]): assert Markdown syntax colors
    // Each file uses correct language grammar
  })

  test("SNAP-SYN-012: renders hunk headers in cyan without syntax highlighting", async () => {
    // Launch TUI at 120x40
    // Navigate to diff
    // Capture snapshot of hunk header line
    // Assert: @@ ... @@ rendered in cyan (ANSI 37)
    // Assert: hunk header is NOT affected by syntax token colors
  })

  test("SNAP-SYN-013: renders diff signs with diff colors not syntax colors", async () => {
    // Launch TUI at 120x40
    // Navigate to diff
    // Assert: + signs use green (ANSI 34 / #22C55E), not syntax token color
    // Assert: - signs use red (ANSI 196 / #EF4444), not syntax token color
  })
})
```

#### Keyboard Interaction Tests

```
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — keyboard interaction", () => {

  test("KEY-SYN-001: syntax highlighting persists after view toggle", async () => {
    // Launch TUI at 120x40 with TypeScript diff
    // Wait for syntax highlighting to complete
    // Press t (toggle to split view)
    // Assert: syntax colors still present in both panes
    // Assert: no flicker or revert to plain text
  })

  test("KEY-SYN-002: syntax highlighting persists after view toggle back", async () => {
    // Press t (split), then t again (unified)
    // Assert: syntax colors present after round-trip
  })

  test("KEY-SYN-003: file navigation applies correct filetype", async () => {
    // Navigate to diff with .ts file followed by .py file
    // Assert: first file has TypeScript syntax colors
    // Press ] (next file)
    // Assert: second file has Python syntax colors (different keywords)
  })

  test("KEY-SYN-004: file navigation back preserves highlighting", async () => {
    // Press ] then [
    // Assert: first file still has syntax colors from Tree-sitter cache
  })

  test("KEY-SYN-007: sidebar toggle does not affect highlighting", async () => {
    // Press Ctrl+B (toggle sidebar)
    // Assert: syntax highlighting on diff content unchanged
  })

  test("KEY-SYN-008: rapid file navigation settles on correct highlighting", async () => {
    // Press ] five times rapidly
    // Wait for final file to settle
    // Assert: final visible file has correct language-specific syntax colors
  })

  test("KEY-SYN-009: scrolling through highlighted diff is smooth", async () => {
    // Press j 50 times rapidly on a highlighted TypeScript file
    // Assert: content scrolls without stutter
    // Assert: syntax colors remain applied on all visible lines
  })
})
```

#### Color Tier Tests

```
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — color capability tiers", () => {

  test("RSP-SYN-001: syntax highlighting active at 80x24", async () => {
    // Launch TUI at 80x24
    // Navigate to diff
    // Assert: syntax colors applied in unified mode
  })

  test("RSP-SYN-002: syntax highlighting active at 120x40", async () => {
    // Launch TUI at 120x40
    // Navigate to diff
    // Assert: syntax colors in both unified and split modes
  })

  test("RSP-SYN-004: resize preserves syntax highlighting", async () => {
    // Launch at 120x40, navigate to diff, verify highlighting
    // Resize to 80x24
    // Assert: syntax colors preserved (no re-creation of SyntaxStyle)
    // Assert: layout changes but colors stay
  })

  test("RSP-SYN-006: resize to larger terminal preserves highlighting", async () => {
    // Launch at 80x24, navigate to diff
    // Resize to 200x60
    // Assert: syntax colors preserved during growth
  })
})
```

#### Data Integration Tests

```
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — language resolution", () => {

  test("INT-SYN-001: API language field used for filetype", async () => {
    // Diff response with language: "typescript"
    // Assert: file highlights as TypeScript
  })

  test("INT-SYN-002: path fallback when API language is null", async () => {
    // Diff response with language: null, file path src/app.ts
    // Assert: file highlights as TypeScript via pathToFiletype
  })

  test("INT-SYN-003: path fallback when API language is empty string", async () => {
    // Diff response with language: "", file path main.py
    // Assert: file highlights as Python
  })

  test("INT-SYN-004: plain text when language unresolvable", async () => {
    // File LICENSE with language: null
    // Assert: plain text, no syntax colors, diff colors intact
  })

  test("INT-SYN-005: unrecognized API language falls back to plain text", async () => {
    // Diff response with language: "brainfuck"
    // Assert: plain text rendering, no error
  })

  test("INT-SYN-006: Dockerfile detected by basename", async () => {
    // File Dockerfile with language: null
    // Assert: highlights as dockerfile
  })

  test("INT-SYN-008: double extension resolves correctly", async () => {
    // File component.test.tsx
    // Assert: resolves to typescriptreact
  })

  test("INT-SYN-009: binary file skips syntax highlighting", async () => {
    // File with is_binary: true
    // Assert: "Binary file changed" message, no Tree-sitter invocation
  })
})
```

#### Edge Case Tests

```
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — edge cases", () => {

  test("EDGE-SYN-001: syntax highlighting does not block scrolling", async () => {
    // Open diff with large TypeScript file (1000+ lines)
    // Immediately press j/k before highlighting completes
    // Assert: navigation works, content scrolls
  })

  test("EDGE-SYN-003: SyntaxStyle cleanup on screen unmount", async () => {
    // Open diff screen
    // Press q to close
    // Assert: no crash, no native memory errors
    // Re-open diff screen
    // Assert: new SyntaxStyle created successfully
  })

  test("EDGE-SYN-004: re-opening diff screen creates fresh SyntaxStyle", async () => {
    // Open diff, close, re-open
    // Assert: highlighting works on second open
  })

  test("EDGE-SYN-005: 10+ languages in single diff", async () => {
    // Diff with .ts, .py, .rs, .go, .js, .css, .html, .json, .md, .yaml, .toml
    // Navigate through files with ]/[
    // Assert: each file highlights with its own grammar
  })
})
```

---

## Verification Checklist

| # | Criterion | Verified by |
|---|-----------|-------------|
| 1 | SyntaxStyle created with 17-token color palette matching spec | SNAP-SYN-001, SNAP-SYN-010 |
| 2 | Color palette degrades correctly across truecolor, 256-color, and 16-color terminals | Color tier tests (manual verification of SGR sequences in snapshots) |
| 3 | `pathToFiletype` fallback detects 47+ language extensions | INT-SYN-002, INT-SYN-006, INT-SYN-008 |
| 4 | `SyntaxStyle` instance is memoized (not recreated on re-renders) | KEY-SYN-001, KEY-SYN-002, RSP-SYN-004 |
| 5 | Cleanup calls `.destroy()` on unmount to free native resources | EDGE-SYN-003, EDGE-SYN-004 |
| 6 | Style instance shared across unified/split/file navigation without recreation | KEY-SYN-001, KEY-SYN-003, KEY-SYN-007 |
| 7 | `resolveFiletype` prefers API language, falls back to path, returns `undefined` | INT-SYN-001 through INT-SYN-009 |
| 8 | SyntaxStyle creation failure degrades to plain text without crash | EDGE-SYN-003 (error path) |
| 9 | RGBA objects allocated once at module scope, not per-render | Code review (no `RGBA.fromHex` calls inside component bodies or hooks) |
| 10 | All 17 tokens contrast against dark background and both diff backgrounds | SNAP-SYN-004, SNAP-SYN-005, SNAP-SYN-006 |
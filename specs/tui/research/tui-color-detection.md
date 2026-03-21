# Research Findings: tui-color-detection

## 1. Existing `detectColorTier` in `apps/tui/src/lib/diff-syntax.ts`
The codebase currently has a color capability detection function in `apps/tui/src/lib/diff-syntax.ts` (lines 93-111). 

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

**Known Consumers of the existing `detectColorTier`:**
- `apps/tui/src/lib/index.ts` (re-exports it)
- `apps/tui/src/hooks/useDiffSyntaxStyle.ts`
- `apps/tui/src/screens/Agents/components/colors.ts`
- `apps/tui/src/theme/syntaxStyle.ts`

The engineering spec mandates leaving this existing function untouched for now to avoid cascading changes, and instead implementing the new robust module at `apps/tui/src/theme/detect.ts`.

## 2. Target File: `apps/tui/src/theme/detect.ts`
This file doesn't exist yet and will need to be created. It must have *zero* React dependencies, zero `@opentui/core` dependencies, and should only use `process.env`. It will contain:
- `ColorTier` type
- `detectColorCapability()`
- `isUnicodeSupported()`

## 3. Existing `apps/tui/src/theme/index.ts`
Currently, `apps/tui/src/theme/index.ts` is a documentation-only file containing comments and an `export {}` statement:

```typescript
/**
 * Theme system for the TUI application.
 *
 * Planned modules (see: specs/tui/engineering-architecture.md § Theme and Color Token System):
 *   tokens.ts   — 12 semantic color tokens: primary, success, warning, error, muted,
 *                 surface, border, diffAddedBg, diffRemovedBg, diffAddedText,
 *                 diffRemovedText, diffHunkHeader
 *   detect.ts   — Terminal color capability detection: truecolor | 256 | 16
 *                 Checks COLORTERM env for truecolor/24bit, TERM for 256color
 *   resolve.ts  — Token resolution: semantic token × color capability → concrete ANSI value
 *
 * Note: src/lib/diff-syntax.ts already implements ColorTier detection and palette
 * resolution for diff-specific syntax highlighting. The theme system will provide
 * a broader set of semantic tokens for all UI elements and may consume the same
 * detectColorTier() utility from lib/diff-syntax.ts.
 */

export {}
```
This will need to be replaced with the actual exports from `detect.ts` and `syntaxStyle.ts`.

## 4. Test Target: `e2e/tui/app-shell.test.ts`
The test file `e2e/tui/app-shell.test.ts` exists and currently includes testing for the Navigation Provider and App Shell using `bun:test` and test helpers like `run` and `bunEval` from `./helpers`. 

We will need to append the new 31 tests outlined in the engineering spec to this file inside a new `describe("TUI_APP_SHELL — Color capability detection", () => { ... })` block. The test helpers `bunEval` and `run` are already imported at the top of the file:
`import { launchTUI, TUI_ROOT, TUI_SRC, run, bunEval } from "./helpers";`

## 5. Summary of Architecture & Rules
- **Pure functions:** Everything in `theme/detect.ts` is pure, reading only `process.env`.
- **Hierarchy:** 
  1. `NO_COLOR` (returns `ansi16`, overrides all, must be non-empty)
  2. `TERM=dumb` (returns `ansi16`)
  3. `COLORTERM=truecolor` or `24bit` (returns `truecolor`)
  4. `TERM=*256color*` (returns `ansi256`)
  5. Default: `ansi256`
- **Unicode support (`isUnicodeSupported()`):** Returns `false` if `TERM=dumb` or `NO_COLOR` is set (non-empty). Returns `true` otherwise.
- **Independence:** The module must not break the existing implementations. The compatibility tests explicitly verify that `detectColorCapability` output matches the existing `detectColorTier` from `lib/diff-syntax.ts` for specific inputs.
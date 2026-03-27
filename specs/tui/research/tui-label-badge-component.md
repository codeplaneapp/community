# Research Findings: Codeplane TUI `LabelBadge` Component

This document synthesizes the codebase context required to implement the `tui-label-badge-component` ticket as requested by the Engineering Specification.

## 1. Theme and Color Dependencies
- **`ThemeTokens` and `useTheme()`:** Located in `apps/tui/src/theme/tokens.ts` and `apps/tui/src/hooks/useTheme.ts`. Theme tokens are pre-allocated `RGBA` instances mapped to standard terminal capabilities. The `muted` and `warning` tokens will be accessed via `useTheme()` inside the `LabelBadge` component.
- **`ColorTier` and `useColorTier()`:** Located in `apps/tui/src/theme/detect.ts` and `apps/tui/src/hooks/useColorTier.ts`. Valid tiers are `"truecolor" | "ansi256" | "ansi16"`. This dictates which nearest-color mapping algorithm is used in `resolveColor()`.
- **`RGBA` Implementation:** The core color primitive is imported from `@opentui/core`. Source is located in `context/opentui/packages/core/src/lib/RGBA.ts`. 
  - Instantiated via `RGBA.fromHex()` (parses string, warns and returns magenta on invalid hex).
  - `RGBA.fromValues(r, g, b, a)` accepts 0.0–1.0 floats.
  - `RGBA.fromInts(r, g, b, a)` accepts 0–255 integers.

## 2. Text and Truncation Utilities
- **Current Truncation:** `apps/tui/src/util/truncate.ts` implements string truncation (`truncateText`, `truncateLeft`), but they rely purely on `String.prototype.length` and are unaware of CJK double-width, surrogate pairs, or zero-width characters.
- **Requirement Alignment:** The `color.ts` implementation must include `displayWidth()` and `truncateToWidth()` specifically to handle these Unicode complexities using `Intl.Segmenter`.

## 3. NO_COLOR Support
- In `apps/tui/src/theme/detect.ts`, if `process.env.NO_COLOR` is present, it forces the color tier to `"ansi16"`. 
- However, the `resolveColor()` and `LabelBadge` logic needs a more aggressive override: when `NO_COLOR` is detected, all label-related `fg` properties must be omitted (passed as `undefined`) so OpenTUI falls back natively to the terminal's default foreground.

## 4. Barrel Exports
- TUI barrel files (`apps/tui/src/components/index.ts` and `apps/tui/src/util/index.ts`) use ES Modules with explicit `.js` extensions (e.g., `export { LabelBadge } from "./LabelBadge.js";`). 

## 5. Testing Patterns
- **Unit Tests:** The `e2e/tui/util-text.test.ts` file reveals the standard testing pattern using `bun:test`.
  - Direct imports with relative paths to the actual source files, e.g., `import { truncateText } from "../../apps/tui/src/util/truncate.js";`.
  - Uses `describe`, `test`, and `expect` blocks.
- **Snapshot Tests:** E2E snapshot components will be created in `e2e/tui/issues.test.ts` via the `launchTUI()` helper located in `e2e/tui/helpers.ts`, simulating user keystrokes (`sendKeys`) and awaiting UI updates (`waitForText`).
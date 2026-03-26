# Research Findings: TUI_DIFF_LINE_NUMBERS

## 1. Theme and Token Architecture (`apps/tui/src/theme/tokens.ts`)

The application uses a strict semantic token system for terminal colors to support different color capability tiers gracefully (Truecolor, ANSI 256, ANSI 16). 

*   **Interface:** `ThemeTokens` defines properties with the type `RGBA` (imported from `@opentui/core`).
*   **Existing Diff Tokens:** The system already has `diffAddedBg`, `diffRemovedBg`, `diffAddedText`, `diffRemovedText`, and `diffHunkHeader`.
*   **Color Tiers:** There are frozen objects for each tier (`TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, `ANSI16_TOKENS`).
*   **Implementation Need:** As per the spec, the 4 new gutter tokens (`diffLineNumberFg`, `diffGutterBg`, `diffAddedGutterBg`, `diffRemovedGutterBg`) need to be added to the `ThemeTokens` interface and populated across all three color capability constants, mapping hex colors to their respective `RGBA.fromHex()` or `RGBA.fromInts()` variants. 
*   **Token Count:** `export const THEME_TOKEN_COUNT = 12;` is at the bottom of the file and must be incremented to `16`.

## 2. Layout and Breakpoints (`apps/tui/src/hooks/useLayout.ts` & `apps/tui/src/types/breakpoint.ts`)

Terminal sizing is strictly partitioned into named breakpoints.

*   **`Breakpoint` Type:** Defined as `"minimum" | "standard" | "large"` in `breakpoint.ts`.
*   **Mapping:** 
    *   `< 80x24` returns `null` (unsupported).
    *   `< 120x40` returns `"minimum"`.
    *   `< 200x60` returns `"standard"`.
    *   Otherwise returns `"large"`.
*   **Hook (`useLayout`):** Exposes `breakpoint` via `useTerminalDimensions()` from `@opentui/react`. The hook memoizes the context and triggers synchronous re-renders. The `useGutterWidth` hook planned for this ticket will neatly stack on top of `useLayout()`, consuming its `breakpoint` field to determine the `GutterTier`.

## 3. OpenTUI `<diff>` Component Capabilities (`context/opentui/`)

By inspecting OpenTUI's `DiffRenderable` (`packages/core/src/renderables/Diff.ts`) and React examples (`packages/react/examples/diff.tsx`), the underlying component perfectly supports the required props out of the box:

*   **Supported Props:**
    *   `showLineNumbers?: boolean`
    *   `lineNumberFg?: string | RGBA`
    *   `lineNumberBg?: string | RGBA`
    *   `addedLineNumberBg?: string | RGBA`
    *   `removedLineNumberBg?: string | RGBA`
    *   `addedSignColor?: string | RGBA`
    *   `removedSignColor?: string | RGBA`
*   **Mechanics:** `DiffRenderable` manages parsing the diff string, handling hunk layout, split vs unified views, and spawning `LineNumberRenderable` instances on the left/right. It automatically synchronizes the colors correctly when padding lines for split views or managing addition/deletion line background states.

## 4. E2E Testing Patterns (`e2e/tui/diff.test.ts`)

The E2E file already exists and tests `TUI_DIFF_SYNTAX_HIGHLIGHT`. We will append the new `describe` blocks at the end of the file. 

*   **Tooling:** It uses `launchTUI({ cols, rows })` from a local `./helpers.ts` file.
*   **Interactions:** Keyboard input is simulated via `tui.sendKeys(...)`, resizing via `tui.resize(cols, rows)`, and verification is driven by `tui.snapshot()` which asserts against golden terminal files.
*   **Spec Alignment:** The spec includes 51 E2E tests for the line numbers. These will perfectly match the existing file structure and test paradigms already used for syntax highlighting.

## 5. Directory State (`apps/tui/src/screens/DiffScreen/`)

Upon checking `apps/tui/src/screens/`, the `DiffScreen` folder does not exist yet. This aligns with the engineering spec marking the `UnifiedDiffViewer.tsx` file as `(modified — this file is created by tui-diff-unified-view)`. As this is a dependency ticket, our work can provide the `useGutterWidth` hook, the `diff-gutter-config.ts` pure logic, and the `tokens.ts` additions. We will implement the wiring inside `UnifiedDiffViewer.tsx` depending on how the PR integration is staged, or assume its basic skeleton exists for patching purposes during the build phase.
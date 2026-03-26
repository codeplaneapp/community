# Codebase Research: `tui-wiki-highlighted-text`

## 1. Context & Readiness
Based on the codebase investigation, the workspace is fully ready for the implementation of the `HighlightedText` component. The necessary OpenTUI primitives (`<text>`, `<span>`), the semantic theming engine (`useTheme`), and the end-to-end testing harnesses (`@microsoft/tui-test` via `helpers.ts`) are already present in the repository.

## 2. Existing Theming Architecture

The component relies on the existing theme provider. The investigation confirmed that `tui-theme-provider` is implemented and available.

- **Theme Tokens Definition (`apps/tui/src/theme/tokens.ts`)**:
  - The `ThemeTokens` interface defines standard color tokens such as `primary`, `success`, `warning`, `error`, `muted`, `surface`, and `border`.
  - The token `primary` is correctly available as an `@opentui/core` `RGBA` object.
  - The file also exports `TextAttributes`, specifically `TextAttributes.BOLD` (`1 << 0`), which will be used to style the matching text segments in `HighlightedText.tsx`.

- **Theme Hook (`apps/tui/src/hooks/useTheme.ts`)**:
  - Exposes `export function useTheme(): Readonly<ThemeTokens>`.
  - Returns referentially stable theme tokens across renders.
  - Must be called from inside a `<ThemeProvider>` context.

## 3. Component Architecture

- **Target Path:** `apps/tui/src/components/HighlightedText.tsx` currently does not exist and will need to be created.
- **Component Barrel File (`apps/tui/src/components/index.ts`)**:
  - Already exports foundational UI components like `AppShell`, `HeaderBar`, `StatusBar`, etc.
  - Will need to be updated to export the new `HighlightedText` component as per the engineering spec: `export { HighlightedText } from "./HighlightedText.js";`.

## 4. Testing Infrastructure (`e2e/tui/`)

- **Target Test File (`e2e/tui/wiki.test.ts`)**:
  - The file `e2e/tui/wiki.test.ts` does not exist yet. It will be created as a new test suite exclusively for wiki functionality and the `HighlightedText` integration.
- **Test Helpers (`e2e/tui/helpers.ts`)**:
  - The file `e2e/tui/helpers.ts` provides the foundational test utilities required by the spec.
  - `launchTUI`: Starts a headless TUI process for snapshot and interaction testing.
  - `createMockAPIEnv`: Provides mocked backend endpoints to the TUI instance.
  - `TUITestInstance`: The interface for the returned terminal instance, enabling methods like `terminal.sendKeys()` and `terminal.snapshot()`.

## 5. Runtime & Native API Support

- **`Intl.Segmenter`**:
  - The engineering spec requires grapheme-aware truncation using `Intl.Segmenter`.
  - Codeplane's ecosystem utilizes Bun (`bunfig.toml` and lockfiles present). Bun natively bundles a modern V8 engine which has built-in, unflagged support for `Intl.Segmenter`. No external polyfills or extra dependencies are required.
  - The pure functions `_findSegments_FOR_TESTING` and `_truncateGraphemeAware_FOR_TESTING` should be implemented directly within the component file as internal helpers, and exported purely for the unit tests in `e2e/tui/wiki.test.ts`.

## 6. Actionable Implementation Steps

1. **Create** `apps/tui/src/components/HighlightedText.tsx` containing the `<HighlightedTextInner>` component wrapped in `React.memo`, alongside the exported pure functions `findSegments` and `truncateGraphemeAware`.
2. **Import** `useTheme` from `../hooks/useTheme.js` and `TextAttributes` from `../theme/tokens.js`.
3. **Export** the component in `apps/tui/src/components/index.ts`.
4. **Create** `e2e/tui/wiki.test.ts` and import the pure functions directly to write granular unit tests, as well as launching the TUI integration tests via `launchTUI` from `./helpers.ts`.
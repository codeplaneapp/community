# Research Findings: Codeplane TUI ThemeProvider

## 1. Theme Foundation (`apps/tui/src/theme/`)

The underlying theme logic is already implemented and ready to be consumed by the provider:

- **`apps/tui/src/theme/detect.ts`**: 
  - Exports the `ColorTier` union type (`"truecolor" | "ansi256" | "ansi16"`).
  - Exports the `detectColorCapability()` function which synchronously determines the tier based on environment variables (`NO_COLOR`, `TERM`, `COLORTERM`).
- **`apps/tui/src/theme/tokens.ts`**: 
  - Exports the `ThemeTokens` interface, defining semantic colors like `primary`, `success`, `warning`, `error`, `muted`, `surface`, and `border` as `@opentui/core` `RGBA` objects.
  - Exports the `createTheme(tier: ColorTier)` function, returning a frozen `ThemeTokens` object pre-allocated for the appropriate color capability.

## 2. Provider Patterns (`apps/tui/src/providers/`)

The `NavigationProvider` in `apps/tui/src/providers/NavigationProvider.tsx` establishes a clear precedent for context providers in the TUI:

- **Context Creation**: Uses `createContext<ContextType | null>(null)`.
- **Component Structure**: Accepts `children` and specific props. Renders `<Context.Provider value={contextValue}>{children}</Context.Provider>` directly without extra UI wrappers.
- **Memoization**: The context value is wrapped in `useMemo` to prevent unnecessary re-renders. For the `ThemeProvider`, an empty dependency array `[]` will be sufficient since the color tier is evaluated once and never changes.
- **Error Handling**: Hooks consuming the context explicitly check for `null` and throw an informative error if used outside the provider (e.g., `useNavigation` hook pattern).

## 3. Barrel Exports

- **`apps/tui/src/providers/index.ts`**:
  - Currently exports `NavigationProvider` and `NavigationContext`.
  - Contains a `Planned providers` comment that explicitly lists `ThemeProvider` as upcoming. This comment needs to be updated when `ThemeProvider` is added.
- **`apps/tui/src/hooks/index.ts`**:
  - A standard module barrel file exporting hooks like `useNavigation`, `useClipboard`, etc., with `.js` extensions as per the project's ESM configuration.

## 4. E2E Testing (`e2e/tui/app-shell.test.ts`)

The test suite utilizes the `@microsoft/tui-test` framework and custom helpers:

- **Structure**: Tests are grouped into descriptive `describe` blocks.
- **Utilities**: Makes heavy use of `bunEval` and `run` to perform module-level validations (file existence, compilation, hook behavior) without spinning up a full TUI.
- **Integration Tests**: Full layout rendering is tested via `launchTUI`, capturing screenshots or validating output lines. Tests that expect to fail (due to unimplemented entry point wiring) should be left as-is, following repository philosophy.
- **Target Location**: The new `describe("TUI_APP_SHELL — ThemeProvider and useTheme hook")` block from the specification should be appended at the very end of this file, right after the `describe("TUI_APP_SHELL — Theme token definitions")` block.

## 5. Next Steps for Implementation

Based on these findings, implementing the `ThemeProvider` is straightforward and completely decoupled from UI layout complexities. The steps are:
1. Create `ThemeProvider.tsx` utilizing `detectColorCapability` and `createTheme`.
2. Create `useTheme.ts` and `useColorTier.ts` to consume the context.
3. Hook everything into the barrel exports.
4. Append the 24 exhaustive tests to `e2e/tui/app-shell.test.ts`.
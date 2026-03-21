# TUI_ERROR_BOUNDARY Research Findings

## 1. Existing ErrorBoundary POC
**File:** `apps/tui/src/components/ErrorBoundary.tsx`
- Currently contains an 83-line POC implementation.
- Provides a basic React class component (`ErrorBoundary`) and a simple functional component (`ErrorBoundaryScreen`).
- Uses hardcoded hex colors (`#DC2626`, `#A3A3A3`) instead of semantic theme tokens from the `ThemeProvider`.
- Directly calls `process.exit(0)` on quit (`q`), which skips proper terminal teardown (such as cursor restore and alt screen exit).
- Does not handle crash loop detection, stack trace scrolling, text wrapping, telemetry, or responsive layout logic.
- Needs to be completely replaced by the production `ErrorBoundary` class and the separate `ErrorScreen` component as defined in the spec.

## 2. App Structure and Provider Stack Integration
**Files:** `apps/tui/src/index.tsx`, `apps/tui/src/components/AppShell.tsx`
- In `index.tsx`, the `ErrorBoundary` currently wraps the entire application stack including the theme and auth providers:
  ```tsx
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <SSEProvider>
          <NavigationProvider>
            <GlobalKeybindings>
              <AppShell />
            ...
  ```
- The engineering spec requires moving the `ErrorBoundary` **inside** the provider stack so it sits *below* `AuthProvider` (to maintain token context during errors) and *above* `NavigationProvider` (to catch navigation crashes and manage resetting the navigation key).
- Currently, `AppShell.tsx` is located at the leaf of the providers and renders `<HeaderBar />`, `<ScreenRouter />`, and `<StatusBar />`.
- To match the spec's requirement that the header and status bars remain visible during errors, either `AppShell` will need to render the `ErrorBoundary` inside its content `<box>`, wrapping the `ScreenRouter` (while moving `NavigationProvider` below it), or `index.tsx` must be restructured so `AppShell` acts as a higher-level wrapper around the boundary.

## 3. Utility Dependencies
**Files:** `apps/tui/src/util/text.ts`, `apps/tui/src/types/breakpoint.ts`
- The engineering spec lists dependencies on `wrapText` and `truncateText` from a `../util/truncate.js` module. 
- A grep search reveals that `truncateText` and `wrapText` were specified in the `tui-util-text` ticket.
- However, `apps/tui/src/util/truncate.ts` does not currently exist. The closest existing file is `apps/tui/src/util/text.ts`, which exports `truncateRight`, `truncateBreadcrumb`, and `fitWidth`.
- The implementation phase will need to accommodate these missing utilities by either defining them in `text.ts` or stubbing them according to the `tui-util-text` definitions.
- `apps/tui/src/types/breakpoint.ts` successfully exports the required `Breakpoint` type and `getBreakpoint` calculation function to support the responsive adaptations on the error screen.

## 4. Test Infrastructure and Crash Hooks
**Files:** `e2e/tui/app-shell.test.ts`, `apps/tui/src/screens/PlaceholderScreen.tsx`
- The test file `e2e/tui/app-shell.test.ts` is robust and already contains over 2000 lines of existing tests spanning navigation, resizing, theme tokens, and capability detection. The new `TUI_ERROR_BOUNDARY` test suites (Snapshot, Keyboard, Responsive, Crash Loop, and Unit) should be carefully appended to this file.
- The `launchTUI` helper defined in `e2e/tui/helpers.ts` provides a complete mock terminal instance supporting `.sendKeys()`, `.waitForText()`, `.resize()`, and `.snapshot()`, which fully covers the E2E needs of the error boundary test suite.
- The spec requires simulating exceptions by triggering a `<TestCrashHook />` component during `NODE_ENV=test` runs based on `CODEPLANE_TUI_TEST_THROW*` environment variables. 
- Because the `Dashboard` screen is not yet explicitly implemented, `apps/tui/src/screens/PlaceholderScreen.tsx` currently serves as the fallback for all unknown or pending screens (including Dashboard). Placing the `<TestCrashHook>` at the top of `PlaceholderScreen.tsx` is the most effective way to ensure errors can be reliably injected during initial render for testing.

## 5. New Modules to Create
Based on the spec, the following new files must be scaffolded and implemented:
- `apps/tui/src/lib/crash-loop.ts` (Stateful ring-buffer for detecting repeated restart failures)
- `apps/tui/src/lib/telemetry.ts` (Global telemetry singleton stub for future ingestion)
- `apps/tui/src/lib/logger.ts` (Structured stderr logging, bypassing terminal UI output)
- `apps/tui/src/lib/normalize-error.ts` (Error normalization ensuring string/null outputs map to `Error` objects)
- `apps/tui/src/components/ErrorScreen.tsx` (Terminal visuals, manual stack scrolling, breakpoint calculations using `@opentui/react`)
- `apps/tui/src/components/ErrorBoundary.tsx` (Complete rewrite of the POC class component connecting the logic together)
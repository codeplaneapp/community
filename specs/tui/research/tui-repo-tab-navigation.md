# Research Findings: tui-repo-tab-navigation

## 1. Missing Prerequisites
According to the engineering specification, this ticket depends on two preceding tickets: `tui-repo-tab-bar-component` and `tui-repo-screen-scaffold`. 

My codebase search confirmed that **none of the expected dependency files exist yet**. Specifically, the following paths yielded no results:
- `apps/tui/src/components/TabBar.tsx`
- `apps/tui/src/contexts/RepoTabContext.tsx`
- `apps/tui/src/screens/Repository/**/*.tsx` (The entire `Repository` screen folder is missing)

**Actionable Insight:** The implementation of this ticket cannot proceed strictly as an integration task until its dependencies are merged. If assigned to implement this, you will either need to wait for those PRs or scaffold out the missing components (`TabBar`, `RepoOverviewScreen`, `RepoTabContext`, etc.) yourself to unblock development.

## 2. Deep Linking Infrastructure
The file `apps/tui/src/navigation/deepLinks.ts` handles CLI arguments and constructs the initial screen stack.
- It defines `DeepLinkArgs` with current properties: `screen`, `repo`, `sessionId`, and `org`.
- It maps screen names and pushes entries via `createEntry(ScreenName, params)`.
- **Implementation context:** To support the `--tab` parameter, `DeepLinkArgs` will need to be extended to include `tab?: string`. In `buildInitialStack`, if a `tab` is provided, it should be appended to the `params` object passed to `createEntry(ScreenName.RepoOverview, params)`.

## 3. Telemetry Integration
The file `apps/tui/src/lib/telemetry.ts` provides the exact API required by the spec.
- It exports an `emit(name: string, properties: Record<string, any>)` function.
- It currently outputs telemetry to `stderr` when `CODEPLANE_TUI_DEBUG="true"`.
- **Implementation context:** The required `apps/tui/src/screens/Repository/tab-telemetry.ts` file can confidently import and use `emit` to fire `tui.repo.tab_switched`, `tui.repo.tab_viewed`, and `tui.repo.tab_error` events exactly as designed.

## 4. Keybindings and Status Bar Hints
The file `apps/tui/src/hooks/useScreenKeybindings.ts` exists and matches the expected API.
- It takes an array of `KeyHandler` definitions and an optional array of `StatusBarHint` definitions.
- **Implementation context:** The `RepoOverviewContent` component will be able to easily register screen-level keys (like `s` for star and `R` for retry) alongside the tab-specific keybindings, passing them down into the status bar context seamlessly.

## 5. E2E Testing Helpers
The file `e2e/tui/helpers.ts` contains all the necessary utilities for writing the specified 60 E2E tests.
- It exports `launchTUI()`, which returns a `TUITestInstance` with methods like `sendKeys()`, `waitForText()`, `snapshot()`, and `resize()`.
- It defines `TERMINAL_SIZES` which matches the breakpoints in the spec (`minimum: 80x24`, `standard: 120x40`, `large: 200x60`).
- **Implementation context:** The E2E tests provided in the specification can be copied practically verbatim into `e2e/tui/repository.test.ts` as the `launchTUI` environment handles all the actual PTY and Xterm emulation under the hood.
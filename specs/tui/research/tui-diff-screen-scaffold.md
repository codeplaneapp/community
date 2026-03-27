# Research Findings: DiffScreen Component Shell (`tui-diff-screen-scaffold`)

## 1. Registry & Navigation (`apps/tui/src/router/registry.ts`)
- The `DiffView` screen is currently defined as `[ScreenName.DiffView]` in `registry.ts` and maps to `PlaceholderScreen`.
- It already has `requiresRepo: true` and `breadcrumbLabel: () => "Diff"`. This aligns perfectly with the spec's requirement to update the `breadcrumbLabel` function with contextual logic and replace the `PlaceholderScreen` component with `DiffScreen`.

## 2. Layout & Theme Hooks (`apps/tui/src/hooks/`)
- **`useLayout`**: Located at `apps/tui/src/hooks/useLayout.ts`. It returns an object containing `width`, `height`, `contentHeight`, `breakpoint`, `sidebarVisible`, and `sidebarWidth`. This supports the requirements for rendering the responsive sidebar and recalculating zone focus.
- **`useScreenKeybindings`**: Located at `apps/tui/src/hooks/useScreenKeybindings.ts`. Takes `bindings: KeyHandler[]` and an optional second argument `hints?: StatusBarHint[]`. It handles the custom status bar hints required by the spec.
- **`useTheme`**: Available to fetch `theme.primary`, `theme.border`, `theme.muted`, and `theme.error` for styling the active focus zones and placeholder texts.

## 3. Loading & Error Components (`apps/tui/src/components/`)
- **`FullScreenLoading`**: Exists in `apps/tui/src/components/FullScreenLoading.tsx`. Requires `spinnerFrame` and `label` props. Automatically centers vertically/horizontally within the `contentHeight`.
- **`FullScreenError`**: Exists in `apps/tui/src/components/FullScreenError.tsx`. Requires `screenLabel` and `error` (of type `LoadingError`) props. 
- **`useScreenLoading`**: Exists in `apps/tui/src/hooks/useScreenLoading.ts`. Accepts `{ id, label, isLoading, error, onRetry }` and handles the underlying logic for debounced retry (`R` keybinding), spinner skip threshold, and timeout. It yields `{ showSpinner, showError, loadingError, retry, spinnerFrame }`.

## 4. Missing Dependencies (`useChangeDiff`, `useLandingDiff`, Types)
- **Data Hooks**: Searches confirm that `useChangeDiff.ts` and `useLandingDiff.ts` do NOT exist in `apps/tui/src/hooks/` yet. They are part of the `tui-diff-data-hooks` ticket which seems incomplete or not merged.
- **Diff Types**: The file `apps/tui/src/types/diff.ts` and its `FileDiffItem` / `LandingChangeDiff` exports do not exist yet. `FileDiffItem` is only defined in the server/SDK packages so far.
- **Action Required**: Since the implementation dictates `import { useChangeDiff } from "../../hooks/useChangeDiff.js"` and `import type { FileDiffItem, LandingChangeDiff } from "../../types/diff.js"`, these files will need to be minimally stubbed (exporting dummy types and hooks) during the creation of this shell, so that TypeScript compilation passes.

## 5. E2E Tests (`e2e/tui/diff.test.ts`)
- The file `e2e/tui/diff.test.ts` exists and currently contains snapshot and keyboard tests for `TUI_DIFF_SYNTAX_HIGHLIGHT`.
- The new `describe` blocks (`TUI_DIFF_SCREEN_SCAFFOLD`...) can be cleanly appended directly to this file.
- The test suite utilizes the `launchTUI` helper from `./helpers.ts` which provides `terminal.sendKeys`, `terminal.waitForText`, `terminal.snapshot()`, and `terminal.resize()` as specified in the test requirements.
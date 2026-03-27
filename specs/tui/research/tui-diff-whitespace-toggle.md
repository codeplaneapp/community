# Research Document: TUI_DIFF_WHITESPACE_TOGGLE

## 1. Directory Structure & Implementation Status
- **Target Directory**: The spec targets `apps/tui/src/screens/Diff` and `apps/tui/src/hooks/useDiffData.ts`. However, these files and directories do not currently exist in the main branch. The engineering spec notes `tui-diff-screen` and `tui-diff-data-hooks` as dependencies, meaning this whitespace toggle feature either relies on pending PRs or assumes these stubs will be created during implementation.
- **UI Core Shared Package**: The `ui-core` package is located at `specs/tui/packages/ui-core/` instead of `packages/ui-core/`. The hooks `useChangeDiff` and `useLandingDiff` mentioned in the spec are not yet present in `ui-core`.

## 2. Existing TUI Patterns (`apps/tui/src/`)

### Keybindings & Navigation
- `useScreenKeybindings`: Found in `apps/tui/src/hooks/useScreenKeybindings.ts`. This hook registers screen-level hotkeys (like the new `w` key) and automatically maps them to the `StatusBar` hints. It takes an array of `KeyHandler` objects and an optional array of `StatusBarHint` objects.
- **Status Bar Composition**: The spec requires placing the `WhitespaceIndicator` in the right section of the `StatusBar`. However, `apps/tui/src/components/StatusBar.tsx` currently hardcodes the right-side layout (e.g., `? help`). Implementing the spec will require refactoring `StatusBar.tsx` to accept custom right-side render elements via context or props.

### Layout & Responsive Sizing
- `useLayout()`: Found in `apps/tui/src/hooks/useLayout.ts`. This hook provides `width`, `height`, and `breakpoint` (`"large"`, `"standard"`, or `"minimum"`), utilizing `@opentui/react`'s `useTerminalDimensions`. This directly supports the `isAbbreviated` checks in the `WhitespaceIndicator`.

### Theming
- **Tokens**: `apps/tui/src/theme/tokens.ts` defines all semantic colors. The required tokens from the spec—`theme.muted` (ANSI 245 gray) and `theme.warning` (ANSI 178 yellow), and `theme.primary` (ANSI 33 blue)—are properly defined and available via the `useTheme()` hook.

### Telemetry & Logging Discrepancies
- **Telemetry**: The spec calls `trackEvent(name, properties)`. However, `apps/tui/src/lib/telemetry.ts` exports an `emit(name, properties)` function. The implementation must import and use `emit` instead, or add an alias.
- **Logging**: The spec uses `log.info("name", { properties })`. However, `apps/tui/src/lib/logger.ts` currently exports a `logger` object (`logger.info`, `logger.error`) that only accepts a single `message: string` argument. The implementation must stringify the properties or the logger utility must be updated to accept metadata objects.

## 3. OpenTUI Component APIs (`context/opentui/`)
- **Renderables**: Checked `context/opentui/packages/react/src/types/components.ts`. OpenTUI's React reconciler provides `<box>`, `<scrollbox>`, `<text>`, and `<diff>` components as standard JSX elements.
- **Scroll Box Behavior**: The inline loading indicator is supposed to render above the `<scrollbox>` inside a flex container. Based on standard OpenTUI flex behavior, conditionally rendering a `<box>` above the `<scrollbox>` is supported, but it requires validation to ensure the `<scrollbox>` doesn't reset its internal scroll position upon re-layout.

## 4. Pending Prerequisites
- The caching mechanism mentioned in the spec (`apps/tui/src/lib/diff-cache.ts`) does not exist yet. The cache invalidation logic will need to be built alongside the diff data hooks.
- The debouncing utility requires standard Node/Bun `setTimeout` combined with React's `useEffect` cleanup, which is safe in the OpenTUI React reconciler.
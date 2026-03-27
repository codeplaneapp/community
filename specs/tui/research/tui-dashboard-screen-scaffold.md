# TUI Dashboard Screen Scaffold - Research Findings

## Existing Components and Patterns
### 1. `PlaceholderScreen.tsx`
Provides the current `PlaceholderScreen` component used by the Dashboard screen. It uses `<box flexDirection="column" ...>` and `<text>` elements to render a placeholder. 
Props are defined as `ScreenComponentProps` which includes `entry` containing `ScreenEntry` params.

### 2. `router/registry.ts` and `router/types.ts`
- **Registry:** Maps `ScreenName.Dashboard` to `PlaceholderScreen`. It needs to be updated to map to `DashboardScreen`.
- **Types:** `ScreenName` enum contains `Dashboard = "Dashboard"`. The `ScreenDefinition` configures the router to display the correct component and defines if `requiresRepo` or `requiresOrg` is true (both are `false` for Dashboard).

### 3. `hooks/useScreenKeybindings.ts` and `providers/keybinding-types.ts`
- **Hook:** `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])` is available to register keybindings and status bar hints for the active screen.
- **Types:** `KeyHandler` includes `key`, `description`, `group`, and `handler`. `StatusBarHint` includes `keys`, `label`, and `order`.
- The Dashboard scaffold needs to use this hook to register a minimal "r" keybinding for navigation (as a placeholder) and basic global status bar hints (`g`, `:`, `?`).

### 4. Layout and Theme (`hooks/useLayout.ts`, `hooks/useTheme.ts`)
- **`useLayout`:** Provides a responsive layout context (`width`, `height`, `breakpoint`, `contentHeight`, `sidebarVisible`, etc.) that recalculates on terminal resize.
- **`useTheme`:** Provides semantic color tokens (e.g., `muted`, `primary`, `success`, `error`) adapted for the terminal's color capabilities. The Dashboard scaffold uses `theme.muted` for its placeholder welcome text.

### 5. Screens Barrel (`screens/index.ts`)
- Currently exports nothing (`export {}`). Needs to be modified to export `DashboardScreen`.

### 6. E2E Testing (`e2e/tui/helpers.ts`)
- Tests in `e2e/tui/` use `@microsoft/tui-test` wrapped by `launchTUI()`.
- Standard breakpoints are available in `TERMINAL_SIZES` (`minimum`, `standard`, `large`).
- Mock environments can be created via `createMockAPIEnv()`.
- Provides methods on the terminal instance: `waitForText`, `sendKeys`, `snapshot`, `getLine`, `resize`, `terminate`.

## Alignment with Engineering Spec
The provided implementation plan in the ticket requires:
- Creating `apps/tui/src/screens/Dashboard/index.tsx`.
- Modifying `apps/tui/src/router/registry.ts` to replace `PlaceholderScreen` with `DashboardScreen` for `ScreenName.Dashboard`.
- Modifying `apps/tui/src/screens/index.ts` to export `DashboardScreen`.
- Writing robust tests in `e2e/tui/dashboard.test.ts` to verify the scaffold works across various dimensions and with keybindings. 

All existing utilities and hooks are available in the repository as requested by the plan.
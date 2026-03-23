# TUI_SCREEN_ROUTER Research Findings

## 1. Existing Router Infrastructure (`apps/tui/src/router/`)
- **`types.ts`**: Contains necessary enums (`ScreenName`), interfaces (`ScreenEntry`, `NavigationContext`, `ScreenComponentProps`, `ScreenDefinition`), and constants (`MAX_STACK_DEPTH`, `DEFAULT_ROOT_SCREEN`).
- **`registry.ts`**: Implements `screenRegistry` mapping all defined `ScreenName` entries to definitions. All current screens use `PlaceholderScreen` as their component. Also includes breadcrumb labels and repo/org requirement flags.
- **`ScreenRouter.tsx`**: Currently a basic scaffold. It successfully reads from `useNavigation` and resolves the component from `screenRegistry`, but **lacks**: 
  - Empty stack guarding (defensive push to `Dashboard`).
  - Rendering unknown screens defensively.
  - Key-based unmount/remount isolation (currently missing `key={currentScreen.id}`).
  - Error boundaries per screen.
- **`index.ts`**: Barrel exports router types and components. Needs updating to include the new `ScreenErrorBoundary`.

## 2. Navigation State (`apps/tui/src/providers/NavigationProvider.tsx`)
- Implements the stack as `ScreenEntry[]` with each entry containing an `id: string` generated via `crypto.randomUUID()`. This ID is critical for the `ScreenRouter` to use as a React `key` to enforce full unmount/remount on navigation changes.
- Exposes `push`, `pop`, `replace`, `reset`, and current stack information. The `currentScreen` getter provides the topmost element.
- Defines `useNavigation()`, which will be the primary hook consumed by `ScreenRouter`.

## 3. AppShell & Bootstrap (`apps/tui/src/components/AppShell.tsx` & `apps/tui/src/index.tsx`)
- **`AppShell.tsx`**: Currently accepts `children: React.ReactNode` and renders them between `HeaderBar` and `StatusBar` inside a flexible `<box flexGrow={1}>`. The spec requires this to change to explicitly importing and rendering `<ScreenRouter />` directly, removing the `children` prop.
- **`index.tsx`**: Currently mounts the tree as `<AppShell><ScreenRouter /></AppShell>`. Once `AppShell` owns the `ScreenRouter` rendering, `index.tsx` will simplify to just `<AppShell />`.

## 4. Screen Error Boundary (`apps/tui/src/router/ScreenErrorBoundary.tsx`)
- **Missing**: This file does not exist yet. Needs to be implemented as a class component capturing errors via `componentDidCatch`/`getDerivedStateFromError`.
- Will need to render a fallback UI using `<box>` and `<text>` showing the error, and include a child functional component (e.g., `<ScreenErrorActions>`) that hooks into `useScreenKeybindings` to provide `q` (back), `r` (retry), and `s` (toggle stack trace) actions when a screen crashes.
- Verified that `apps/tui/src/hooks/useScreenKeybindings.ts` exists and can be imported to support these local error-state keybindings.

## 5. Placeholder Screen (`apps/tui/src/screens/PlaceholderScreen.tsx`)
- Currently renders a fully populated list of parameters and screen name. Can be refactored to align with the simpler `<text color="gray">{entry.breadcrumb}</text>` pattern requested in the spec, ensuring it correctly implements `ScreenComponentProps`.

## 6. Testing (`e2e/tui/app-shell.test.ts`)
- The test file exists and contains roughly ~1500 lines of existing bootstrap, hook, and layout tests for `TUI_APP_SHELL`.
- The new `describe("TUI_SCREEN_ROUTER")` block will need to be appended or inserted into this file containing snapshot, transition, edge case, and deep linking tests using the `@microsoft/tui-test` framework and `launchTUI` helper defined in `e2e/tui/helpers.ts`.
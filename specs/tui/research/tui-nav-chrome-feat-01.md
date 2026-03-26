# Research Findings for tui-nav-chrome-feat-01

## Overview
The goal of this ticket is to implement a stack-based screen router with `LoadingScreen`, mid-session 401 `AuthExpiredScreen`, complete go-to navigation via `GlobalKeybindings`, and robust status bar integration in the Codeplane TUI.

## Codebase Discovery

### 1. Existing Router and Navigation
- **`apps/tui/src/router/ScreenRouter.tsx`**: Currently a very minimal component (28 lines). It simply gets `currentScreen` from `useNavigation()` and renders the mapped component from `screenRegistry`. It lacks `LoadingProvider` integration, `AuthExpiredScreen` interception, and key-based remount lifecycle.
- **`apps/tui/src/providers/NavigationProvider.tsx`**: Fully implemented. Exposes `push`, `pop`, `replace`, and `reset` functions. It manages a `stack` array (max depth 32) and includes a scroll position cache. To implement telemetry, `emit` calls will need to be added to the state updaters in `push` and `pop`.

### 2. Global Keybindings & Go-To Mode
- **`apps/tui/src/components/GlobalKeybindings.tsx`**: Currently wires up `onQuit` (using `nav.canGoBack`), `onEscape`, and `onForceQuit`. Functions for `onHelp`, `onCommandPalette`, and `onGoTo` are empty stubs marked with `TODO`. The file needs a complete rewrite to maintain the `goToActive` state, 1500ms timeout, and dynamically register the `PRIORITY.GOTO` scope.
- **`apps/tui/src/hooks/useGlobalKeybindings.ts`**: Registers global handlers (Priority 5) correctly. It exposes the `GlobalKeybindingActions` interface which will remain unchanged.
- **`apps/tui/src/navigation/goToBindings.ts`**: Provides `goToBindings` array (mapping `g`, `r`, `i`, etc. to screens) and the `executeGoTo` utility, which validates repo context. This file is complete and ready to be imported into `GlobalKeybindings.tsx`.
- **`apps/tui/src/providers/KeybindingProvider.tsx`**: Exposes `registerScope`, `removeScope`, `overrideHints`, and handles priority dispatch. `StatusBarHintsContext` is exported here, providing `overrideHints` which will be used by go-to mode to display `"-- GO TO --"`.

### 3. Loading, Errors, and Status Bar
- **`apps/tui/src/providers/LoadingProvider.tsx`**: Provides `isScreenLoading`, `currentScreenLoading`, and `statusBarError`. It does *not* currently expose a direct `setStatusBarError` function, which `GlobalKeybindings` needs for transient errors like "No repository in context". Adding `setStatusBarError` and an `initialStatusBarError` prop is necessary.
- **`apps/tui/src/components/StatusBar.tsx`**: Renders hints and `statusBarError`. The first hint can be checked for `keys === "-- GO TO --"` to render the go-to indicator in warning color.

### 4. Application Shell and Entry Point
- **`apps/tui/src/index.tsx`**: Captures deep-link errors via `buildInitialStack()`, but currently does not pass the error anywhere. It needs to pass `deepLinkResult.error` to `LoadingProvider`.
- **`apps/tui/src/lib/telemetry.ts`**: Exposes an `emit(name, properties)` function. We will use this in `GlobalKeybindings` (`tui.navigate.goto`, `tui.navigate.goto_fail`) and `NavigationProvider` (`tui.navigate.push`, `tui.navigate.pop`).

### 5. OpenTUI Interactivity and Focus
- **`@opentui/react` `useKeyboard`**: `KeybindingProvider.tsx` uses a single `useKeyboard` hook and implements its own priority queue (TEXT_INPUT=1, MODAL=2, GOTO=3, SCREEN=4, GLOBAL=5). OpenTUI input components automatically consume text input when focused, which generally prevents normal character strokes from propagating to global hooks. Option A (registering a-z catch-all in GOTO scope) is recommended for fallback to cancel go-to mode on unmapped keys.

### 6. E2E Tests
- **`e2e/tui/app-shell.test.ts`**: Contains over 1000 lines of existing structural and layout tests using `@microsoft/tui-test`. New test blocks for `TUI_SCREEN_ROUTER — Snapshots`, `TUI_SCREEN_ROUTER — Keyboard interactions`, `TUI_SCREEN_ROUTER — Deep links`, `TUI_SCREEN_ROUTER — Responsive`, and `TUI_SCREEN_ROUTER — Integration` should be appended directly to this file, utilizing the `launchTUI()` helper.

## Implementation Strategy Path
1. **Create `LoadingScreen.tsx` & `AuthExpiredScreen.tsx`**: Add these to `apps/tui/src/components/`.
2. **Enhance `LoadingProvider.tsx`**: Add `setStatusBarError` to context and handle `initialStatusBarError`.
3. **Update `index.tsx`**: Pass deep-link errors to `LoadingProvider`.
4. **Update `ScreenRouter.tsx`**: Intercept `currentScreenLoading` from `useLoading()`, render auth error or loading screens, and apply `key={nav.currentScreen.id}` to manage remount lifecycle.
5. **Rewrite `GlobalKeybindings.tsx`**: Add go-to mode state logic, dynamic `registerScope` for `PRIORITY.GOTO`, timeout handling, and telemetry emission.
6. **Update `StatusBar.tsx`**: Hook into go-to hints and correctly render `"-- GO TO --"`.
7. **Update `NavigationProvider.tsx`**: Add `emit` events for push/pop actions.
8. **Write E2E Tests**: Port all 30+ tests defined in the spec to `e2e/tui/app-shell.test.ts`.
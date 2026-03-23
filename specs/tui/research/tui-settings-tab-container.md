# Settings Tab Container Research

## 1. Directory Structure and Conventions
- **Base Directory**: `apps/tui/src/`
- **Screens Location**: Screens are located in `apps/tui/src/screens/`.
- **Hooks**: Custom hooks like `useLayout`, `useTheme`, `useNavigation`, and `useScreenKeybindings` are located in `apps/tui/src/hooks/` and re-exported from `apps/tui/src/hooks/index.ts`.
- **Providers**: Global contexts like `NavigationProvider` and `KeybindingProvider` are in `apps/tui/src/providers/`.
- **Router**: Router types and registry are in `apps/tui/src/router/types.ts` and `apps/tui/src/router/registry.ts`.

## 2. Existing Screen Definitions
In `apps/tui/src/router/registry.ts`, the `Settings` screen is currently defined as a `PlaceholderScreen`:
```typescript
[ScreenName.Settings]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Settings",
},
```
To implement the `SettingsTabContainer`, we will need to create the `Settings` folder in `apps/tui/src/screens/Settings` and replace `PlaceholderScreen` with `SettingsScreen` in the registry.

## 3. Important Hooks and Components
- **`useLayout`**: Returns `{ width, height, breakpoint, contentHeight }`. Used to determine if `breakpoint === "minimum"` for responsive layouts.
- **`useTheme`**: Returns semantic tokens like `primary`, `muted`, `surface`, etc. Used for highlighting active tabs and borders.
- **`useNavigation`**: Returns the `NavigationContext` object, containing `{ currentScreen, push, pop, replace }`. 
- **`useScreenKeybindings`**: Registers screen-specific hotkeys to be displayed in the status bar and handled locally.
- **`useKeyboard`**: Direct OpenTUI React hook for handling raw keyboard input (`event => { ... }`). We will use this in the container to capture `j`, `k`, `h`, `l`, `Tab`, `Shift+Tab`, and numeric keys `1-7`.

## 4. E2E Testing Patterns
E2E tests in the TUI use `bun:test` and a set of custom helpers exported from `e2e/tui/helpers.ts` (such as `launchTUI`, `TERMINAL_SIZES`).
Test structure typically looks like this:
```typescript
import { describe, test, expect } from "bun:test"
import { launchTUI, TERMINAL_SIZES } from "./helpers.ts"

describe("TUI_SETTINGS — Navigation", () => {
  test("KEY-SET-001: Sidebar navigation with j/k", async () => {
    // Setup and interactions
  })
})
```
Snapshots or specific assertions should be made according to the `@microsoft/tui-test` conventions (though `helpers.ts` provides the runner interface).

## 5. Implementation Strategy
1.  **Config**: Create `apps/tui/src/screens/Settings/config.ts` exporting `SETTINGS_TABS` array with `id`, `title`, and `hotkey`.
2.  **Container**: Create `apps/tui/src/screens/Settings/SettingsTabContainer.tsx`. Use `useLayout` to switch between horizontal (`<box flexDirection="row">`) and vertical (`<box flexDirection="column">`) layouts depending on `breakpoint === 'minimum'`.
3.  **State**: Manage `activeTab` (defaulting from `entry.params.section` or `'home'`) and `focusZone` (`'nav'` or `'content'`).
4.  **Keybindings**: Intercept keys with `useKeyboard` in the container. Update `activeTab` via numeric keys or directional vim-keys (depending on the `layout.breakpoint` and `focusZone`).
5.  **Screen Shell**: Create `apps/tui/src/screens/Settings/SettingsScreen.tsx`, wrapping the container and passing the `activeTab` to conditional components or stub texts.
6.  **Registry**: Update `apps/tui/src/router/registry.ts` to import and use the new `SettingsScreen`.
7.  **Tests**: Implement layout and navigation tests in `e2e/tui/settings.test.ts` following the existing `bun:test` setup.
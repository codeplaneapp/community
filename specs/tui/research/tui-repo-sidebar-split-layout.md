# Research Findings: tui-repo-sidebar-split-layout

## 1. Existing State in `apps/tui/src/`

### `useLayout` (`apps/tui/src/hooks/useLayout.ts`)
- The `useLayout` hook exists and provides everything required by `SplitLayout` for responsiveness.
- It returns a `LayoutContext` containing:
  - `sidebarVisible` (`boolean`): Whether the sidebar should be rendered based on the breakpoint and user toggle state.
  - `sidebarWidth` (`string`): A percentage width (e.g., `"25%"` or `"30%"`) used directly in OpenTUI `<box width={...}>`.
  - `sidebar`: An object of type `SidebarState` which contains a `toggle()` method used to show/hide the sidebar.
- Responsiveness works by computing these synchronously on terminal resize via `useTerminalDimensions()` from `@opentui/react`.

### `useTheme` (`apps/tui/src/hooks/useTheme.ts`)
- Exposes the current application theme tokens synchronously.
- Returns a frozen, referentially stable `ThemeTokens` object containing color values so that child elements (e.g., `<scrollbox>`) can react accordingly.

### Keybinding Architecture
- Defined in `apps/tui/src/providers/keybinding-types.ts`.
- Key format uses specific descriptor strings normalized via `normalizeKeyDescriptor()`, e.g., `"ctrl+b"`, `"ctrl+w"`, `"tab"`.
- The dispatch flow prioritizes dynamically mounted scope bindings (e.g., `PRIORITY.SCREEN`) over `PRIORITY.GLOBAL` allowing `SplitLayout`'s context to catch a `Ctrl+B` keypress before it hits the application-wide fallback.

## 3. Preparation for Implementation
- All base dependencies (`tui-responsive-layout`, `tui-theme-tokens`) are implemented and functioning.
- The path forward involves creating `useSplitFocus.ts`, `SplitLayout.tsx`, and updating existing global keybinding files.
- The E2E testing framework (`@microsoft/tui-test`) structure supports snapshotting and interaction sequences using `launchTUI()` helper, ensuring resizing and keypress events correctly render focus changes.
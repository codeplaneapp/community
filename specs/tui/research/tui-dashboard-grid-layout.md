# Research Context for `tui-dashboard-grid-layout`

## 1. Dashboard Screen Scaffold Status
- **Current State**: The `apps/tui/src/screens/Dashboard/` directory does not currently exist on the working branch. 
- **Routing**: In `apps/tui/src/router/registry.ts`, `ScreenName.Dashboard` is mapped to a generic `PlaceholderScreen`.
- **Takeaway**: The implementation for this ticket (`tui-dashboard-grid-layout`) assumes that the `tui-dashboard-screen-scaffold` ticket has been completed. Implementing this ticket will require establishing the `DashboardScreen` from scratch and updating the router registry if the scaffold hasn't been merged.

## 2. Layout & Responsiveness Hooks
- **`useLayout` Hook**: Located at `apps/tui/src/hooks/useLayout.ts`. It provides an essential `LayoutContext` object containing:
  - `breakpoint`: Can be `"large"`, `"standard"`, `"minimum"`, or `null`. This is the perfect state primitive for determining whether to render the grid (standard/large) or stacked (minimum) layout.
  - `contentHeight`: Automatically calculated as `height - 2` (accounting for the 1-row header and 1-row status bar). The spec uses `contentHeight - QUICK_ACTIONS_HEIGHT` to determine the panel layout area.
- **`useBreakpoint` Hook**: Located at `apps/tui/src/hooks/useBreakpoint.ts`. It reads terminal dimensions from OpenTUI's `useTerminalDimensions()` and derives the breakpoint.
- **Terminal Too Small**: The `AppShell` component (`apps/tui/src/components/AppShell.tsx`) already handles the gate for unsupported terminal sizes (when `breakpoint` is `null`), displaying the `TerminalTooSmallScreen`. The dashboard grid layout does not need to handle sizes below 80x24 natively.

## 3. Theming & Colors
- **`useTheme` Hook**: The TUI uses a strongly-typed theme system located at `apps/tui/src/theme/tokens.ts`.
- **Color Tokens**: Colors are provided as OpenTUI `RGBA` objects (no raw ANSI codes). For the grid layout, we will use:
  - `theme.primary` for the focused panel border color.
  - `theme.border` for unfocused panel borders and the quick-actions separator.
  - `theme.muted` for placeholder text and status hints.

## 4. Keybindings & Navigation
- **`useScreenKeybindings` Hook**: Located at `apps/tui/src/hooks/useScreenKeybindings.ts`.
  - It takes an array of `KeyHandler` objects (e.g., `{ key: "j", description: "Focus panel below", group: "Panels", handler: () => {...} }`).
  - It registers these bindings at the `PRIORITY.SCREEN` level, ensuring they only apply when the Dashboard is active.
- **Dynamic Bindings**: We can dynamically build the array of `KeyHandler`s passed to this hook based on the current layout mode (grid vs. stacked) to support `h/j/k/l` spatial navigation or `Tab`/`Shift+Tab` cycling.

## 5. Status Bar Hints
- **`useStatusBarHints` Hook / Context**: The `useScreenKeybindings` hook also accepts an optional second argument: an array of `StatusBarHint` objects (e.g., `{ keys: "Tab", label: "next panel", order: -10 }`).
- **Integration**: The `StatusBar` component (`apps/tui/src/components/StatusBar.tsx`) reads these hints and renders them at the bottom left. We can pass dynamic hint arrays that adapt to the current `layoutMode`.

## 6. OpenTUI Components & Props
- **Component Definitions**: Available in `context/opentui/packages/react/src/types/components.ts`:
  - **`<box>`**: Acts as the layout container (powered by Yoga flexbox). It accepts props like `flexDirection`, `width`, `height`, `justifyContent`, `border`, `borderStyle` (e.g., `"single"` for drawing `┌─┐│└┘`), `borderColor`, `title`, and `titleAlignment`.
  - **`<text>`**: Used for inline text rendering, accepting an `fg` prop for foreground color based on the theme tokens.

## 7. Testing Context
- The e2e tests for the TUI use `@microsoft/tui-test`. 
- Currently, `e2e/tui/dashboard.test.ts` does not exist. The tests for this ticket will involve creating that file and writing snapshot matches (e.g., `terminal.snapshot().toMatchSnapshot()`), validating content (`terminal.waitForText(...)`), and testing keystroke navigation (`terminal.sendKeys(...)`) while mocking different terminal sizes (`terminal.resize(...)`).
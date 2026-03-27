# TUI Dashboard Panel Focus Manager - Research Document

## 1. Existing Infrastructure Analysis

### Keybinding Architecture (`apps/tui/src/providers/keybinding-types.ts`)
The TUI uses a well-defined priority-based keybinding dispatch system. The `PRIORITY` enum exports several levels, specifically:
- `TEXT_INPUT`: 1
- `MODAL`: 2
- `GOTO`: 3
- `SCREEN`: 4
- `GLOBAL`: 5

The `KeyHandler` interface supports a `when?: () => boolean` predicate. This is critical for the `tui-dashboard-panel-focus-manager` ticket as we need to suppress navigation keys (like `j`, `k`, `h`, `l`) when the filter input is focused. We can achieve this by supplying `when: () => !isInputFocused` to our handlers.

### Screen Keybindings Hook (`apps/tui/src/hooks/useScreenKeybindings.ts`)
The `useScreenKeybindings` hook correctly manages pushing and popping the `PRIORITY.SCREEN` scope. It also natively handles status bar hints using `StatusBarHintsContext`. 
- It uses a ref-based approach (`bindingsRef`) internally, ensuring that updating handlers does not trigger unnecessary scope re-registrations.
- Status bar hints are extracted either from the first 8 bindings or from an explicit `hints` array passed to the hook. We will need to use the explicit `hints` parameter to match the exact requirement from the spec.

### Layout Context (`apps/tui/src/hooks/useLayout.ts`)
The `useLayout` hook exposes a responsive layout context:
- Provides the `breakpoint` value (`"large"`, `"standard"`, `"minimum"`, etc.).
- The layout logic evaluates synchronously, meaning `isGridMode` (`breakpoint !== 'minimum'`) will correctly trigger re-renders when crossing breakpoints, allowing our focus manager to enable/disable grid-specific keybindings (like `h` and `l`).

## 2. Directory & Scaffold Status (Missing Files)

After exploring the codebase, the expected scaffolding from the predecessor ticket (`tui-dashboard-screen-scaffold`) is **not yet present** in the working directory:

- `apps/tui/src/screens/Dashboard/` directory does not exist.
- `e2e/tui/dashboard.test.ts` does not exist.
- `apps/tui/src/router/registry.ts` currently maps `ScreenName.Dashboard` to the `PlaceholderScreen`.

**Implication**: Instead of appending to or modifying existing dashboard files, we will need to create the dashboard files (`types.ts`, `useDashboardFocus.ts`, `useDashboardKeybindings.ts`, `index.tsx`) from scratch, update the router registry to point to the new `DashboardScreen`, and create the new `e2e/tui/dashboard.test.ts` file in its entirety.

## 3. OpenTUI Context

- Based on the provided component specs, we will use the `<box>` component for layout. Although the actual panel rendering is scoped to a future ticket (`tui-dashboard-panel-component`), we will build the boilerplate `<box>` hierarchy as placeholders in `DashboardScreen`.
- React state/refs will track the cursor and panel focus across the different panels, but the `<scrollbox>` interaction (scroll syncing) will also be fleshed out in the component ticket. For now, the hook needs to strictly manage and output `scrollOffset` and `cursorIndex` state per panel.

## 4. Key Implementation Takeaways

1. **Ref-based State for Handlers:** Because `useScreenKeybindings` captures the `KeyHandler[]` array, we must use `useRef` for all dynamic states (e.g., `focusManager`, `isInputFocused`) inside `useDashboardKeybindings.ts` to prevent stale closures. The spec correctly identifies this pattern.
2. **Cursor Clamping Logic:** The `clampCursor` logic must handle cases where a panel is empty (0 items) by clamping the cursor safely to 0.
3. **Go-To Mode Integration:** The `g g` keybinding specifically requires the `PRIORITY.GOTO` scope. Since `tui-global-keybindings` (Go-to mode) is not fully implemented, the tests for `g g` will intentionally fail. We should write the test, but leave the implementation for `g g` as an architectural note, as specified.
4. **Input Focus Escape:** We will need an explicit handler for `Escape` with `when: () => fmRef.current.isInputFocused` to gracefully clear the input focus state, allowing normal global `Escape` logic (screen popping) to resume when input is blurred.
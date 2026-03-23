# Implementation Plan: TUI Help Overlay (`tui-nav-chrome-feat-06`)

## Overview
This plan outlines the step-by-step implementation of the `TUI_HELP_OVERLAY` feature. It introduces a context-aware help modal triggered by `?` that aggregates global, navigation, and screen-specific keybindings, rendering them in a highly responsive overlay using OpenTUI.

## Step 1: Create Help Overlay Context
**File:** `apps/tui/src/providers/HelpOverlayContext.tsx`
- Define `KeybindingEntry`, `KeybindingGroup`, and `HelpOverlayContextType` interfaces.
- Implement `HelpOverlayContextProvider` to maintain registered screen groups using a `useRef` (for the actual data) and a `useState` version counter (to trigger re-renders).
- Export a hardcoded `GLOBAL_GROUP` (containing `?`, `:`, `q`, `Esc`, `Ctrl+C`).
- Export a `GO_TO_GROUP` dynamically mapped from `goToBindings.ts` (prefixing keys with `g `).
- Provide `getAllGroups()` to return the combined array: `[GLOBAL_GROUP, GO_TO_GROUP, ...screenGroups]`.
- Implement a duplicate check to log `warn`-level messages if a screen group overrides a global key.
- Export a `useHelpOverlay()` convenience hook that throws if used outside the provider.

## Step 2: Create Screen Registration Hook
**File:** `apps/tui/src/hooks/useHelpKeybindings.ts`
- Create and export `useHelpKeybindings(groups: KeybindingGroup[])`.
- Utilize `useEffect` to invoke `helpCtx.registerScreenGroups(groups)`.
- Ensure the cleanup function returned by `registerScreenGroups` is returned by the `useEffect` to handle screen unmounting gracefully.

## Step 3: Implement the Help Overlay Component
**File:** `apps/tui/src/components/HelpOverlay.tsx`
- Create the `HelpOverlay` component which manages its own virtual scrolling state (`scrollOffset`).
- Implement chord logic for `g g` using `useState` (`gPending`) and a timer `useRef`.
- Use `useLayout()` to calculate dynamic breakpoints: `visibleRows`, `overlayColumns`, `keyColWidth`, and `descColWidth` based on terminal size (`minimum`, `standard`, `large`).
- Flatten the groups from `useHelpOverlay().getAllGroups()` into a 1D array of `RenderRow` objects (`gap`, `heading`, `separator`, `binding`).
- Register a `PRIORITY.MODAL` keybinding scope on mount to handle scroll actions (`j`, `k`, `Down`, `Up`, `G`, `g`, `Ctrl+D`, `Ctrl+U`).
- Specifically suppress active keys that shouldn't bleed through (`:`, `q`, `/`, `return`, `space`, `tab`, `shift+tab`) by registering them as no-op handlers in the same `PRIORITY.MODAL` scope.
- Render the UI utilizing OpenTUI's `<box>` and `<text>` components. 
- Use semantic theming (`theme.primary` for headers, `theme.warning` for keys, `theme.muted` for descriptions).
- Apply `truncateText` from `../util/text.js` to ensure keys and descriptions do not overflow their calculated column widths.

## Step 4: Update Overlay Layer
**File:** `apps/tui/src/components/OverlayLayer.tsx`
- Import the new `HelpOverlay` component.
- Update the rendering conditional: if `activeOverlay === "help"`, render `<HelpOverlay />`.
- Conditionally apply `padding={0}` to the parent `<box>` when `isHelp` is true, as the `HelpOverlay` handles its own internal padding, title bar, and border separation. Retain the standard wrapper chrome for `command-palette` and `confirm` overlays.

## Step 5: Wire Global Keybinding
**File:** `apps/tui/src/components/GlobalKeybindings.tsx`
- Import `useOverlay` from `../hooks/useOverlay.js`.
- Destructure `openOverlay` from the hook.
- Update the `onHelp` callback to execute `openOverlay("help")`. The `OverlayManager` natively handles the toggle logic if `"help"` is already active.

## Step 6: Update Overlay Manager Status Bar Hints
**File:** `apps/tui/src/providers/OverlayManager.tsx`
- Within the `overlayHints` array, conditionally spread additional hint objects if `type === "help"`.
- Add `{ keys: "j/k", label: "scroll", order: 10 }` and `{ keys: "G", label: "bottom", order: 20 }` to improve discoverability of the help modal's scrolling capabilities.

## Step 7: Inject Provider into App Stack
**File:** `apps/tui/src/index.tsx`
- Import `HelpOverlayContextProvider`.
- Inject `<HelpOverlayContextProvider>` directly inside the `<OverlayManager>` wrapper. This ensures it has access to any top-level layout/theme contexts while being available to all internal screens and keybindings.

## Step 8: Add End-to-End Tests
**File:** `e2e/tui/app-shell.test.ts`
- Create a new `describe("TUI_HELP_OVERLAY")` block at the bottom of the file.
- Implement the 34 specific test cases detailed in the specification using the `@microsoft/tui-test` framework and the existing `launchTUI()` helper.
- **Rendering Tests:** Verify `?` toggles the overlay, checks for `Global` and `Go To` groups, asserts box-drawing characters, and confirms ANSI color presence via snapshot matching.
- **Keyboard Tests:** Validate scroll bounds (`j`, `k`, `G`), `g g` jump to top, paging (`Ctrl+D`, `Ctrl+U`), and strict key suppression (e.g., `:` does not open command palette).
- **Responsive Tests:** Manually trigger `.resize()` via the test runner to assert column width reduction, text truncation at `80x24`, and proper expansion at `200x60`, ensuring `scrollOffset` preserves state without out-of-bounds errors.
- **Context Tests:** Verify status bar hints are applied correctly and scroll indicators (`1-20 of 45`) render accurately.
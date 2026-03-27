# TUI Help Overlay Research

This document outlines the existing patterns and context found in the Codeplane TUI codebase relevant to implementing the `tui-help-overlay` feature.

## 1. Overlay Layer & Manager Context (`OverlayLayer.tsx`, `OverlayManager.tsx`)
- **`OverlayLayer.tsx`**: Renders an absolutely-positioned `<box>` for overlays. Currently, it renders `[Help overlay content — pending TUI_HELP_OVERLAY implementation]` when `activeOverlay === "help"`. We will replace this placeholder with `<HelpOverlay />`.
- The container already provides `border={true}`, `borderColor={theme.border}`, `backgroundColor={theme.surface}`, `padding={1}`, and manages the title (`Keybindings`) and an `Esc close` hint. It also sets width and height based on `useLayout()`.
- **`OverlayManager.tsx`**: Manages overlay state. `openOverlay("help")` handles the modal keybinding registration for `escape` at `PRIORITY.MODAL`. Opening a currently active overlay toggles it closed. This toggle logic aligns with the specification.

## 2. Global Keybindings (`GlobalKeybindings.tsx`)
- Contains a stub: `const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);`.
- It connects to `useGlobalKeybindings`. We can wire `onHelp` to `useOverlay().openOverlay("help")` to trigger the overlay toggling on `?` keypress.

## 3. Keybinding System (`KeybindingProvider.tsx`)
- Exposes `getAllBindings(): Map<string, KeyHandler[]>` which extracts all active bindings across scopes.
- Exposes `getScreenBindings(): KeyHandler[]` which gets the top `PRIORITY.SCREEN` bindings, useful for the context-sensitive "Screen-specific" help group.
- Keybindings have a `priority`, `group`, `key`, `description`, and a `handler`.

## 4. Go-To Bindings (`goToBindings.ts`)
- Defines an exported array `goToBindings` containing entries like `{ key: "d", screen: ScreenName.Dashboard, description: "Dashboard" }`.
- It has exactly 11 static entries which perfectly matches the "Go To" section requirements in the spec.

## 5. Responsive Layout & Theming (`useLayout.ts`, `useTheme.ts`)
- **`useLayout.ts`**: Provides `width`, `height`, and `breakpoint` from `useTerminalDimensions()` (OpenTUI hook). Breakpoints include `"minimum"`, `"standard"`, `"large"`, and `null` for unsupported tiny terminals.
- The spec specifies that the modal overlay height for `help` should be 70% at standard/large breakpoints and 90% at minimum breakpoints, overriding `layout.modalHeight` (which is 60%).
- **`useTheme.ts`**: Returns semantic tokens (`primary`, `muted`, `warning`, `border`, etc.).

## 6. String Manipulation (`truncate.ts`)
- Provides `truncateText(text, maxWidth)` which safely truncates strings and adds `…` based on a max column width. This is perfect for enforcing column constraints inside the overlay grid.

## 7. Status Bar (`StatusBar.tsx`)
- Has a section that prints `? help` using `theme.primary` and `theme.muted`. The specification mentions verifying that this hint is present.

## Summary for Implementation
- `HelpOverlay.tsx` will be a new component connecting `KeybindingContext`, `goToBindings`, `useTerminalDimensions` and `useTheme` to render scrollable lists using `<box>` and `<text>`.
- `OverlayLayer.tsx` needs minor adjustments to swap placeholder for `<HelpOverlay />` and customize height.
- Needs `useKeyboard` logic wrapped in a `registerScope` effect to safely capture `j`, `k`, `g g`, etc. locally within the `HelpOverlay`.
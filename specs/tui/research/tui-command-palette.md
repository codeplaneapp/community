# TUI Command Palette Research Findings

## 1. Directory Context & Structure

Based on exploration of the `apps/tui/src/` directory, the TUI codebase follows a standard React pattern tailored for OpenTUI:
- **Components**: UI elements (e.g., `OverlayLayer.tsx`, `AppShell.tsx`, `StatusBar.tsx`).
- **Providers**: System state and context (e.g., `KeybindingProvider.tsx`, `NavigationProvider.tsx`, `OverlayManager.tsx`).
- **Hooks**: Hooks encapsulating complex state interactions (e.g., `useLayout.ts`, `useOverlay.ts`, `useGlobalKeybindings.ts`).
- **Router**: Defines navigation targets and screen requirements (`router/registry.ts`, `router/types.ts`).

Notably, the `apps/tui/src/commands/` directory **does not exist yet**. This confirms that the Command Palette ticket requires scaffolding the command definitions, types, and registry entirely from scratch as indicated in the spec.

## 2. Overlays and OverlayLayer.tsx

The `OverlayLayer.tsx` handles mounting overlays over the base screen structure:
- It listens to `useOverlay()`, which returns `activeOverlay` and `closeOverlay`.
- Overlays use OpenTUI absolute positioning: `<box position="absolute" zIndex={100} ...>`.
- It currently contains explicit placeholder text for `"command-palette"`:
  ```tsx
  {activeOverlay === "command-palette" && (
    <text fg={theme.muted}>[Command palette content — pending TUI_COMMAND_PALETTE implementation]</text>
  )}
  ```
- It leverages `useLayout()` to calculate dimensions (falling back to `layout.modalWidth` and `layout.modalHeight`).

## 3. Keybinding System

The keybinding system is complex and priority-driven, located in `KeybindingProvider.tsx` and `keybinding-types.ts`:
- Keybinding scopes are registered with a priority enum:
  - `TEXT_INPUT`: 1
  - `MODAL`: 2
  - `GOTO`: 3
  - `SCREEN`: 4
  - `GLOBAL`: 5
- Currently, the dispatch loop inside `useKeyboard` loops over active scopes by priority and looks for exact key matches (`scope.bindings.get(descriptor)`).
- **Missing Feature**: There is currently no `onUnhandledKey` fallback implementation in `KeybindingProvider.tsx`. 
  To capture printable input for the fuzzy search query while handling `j` / `k` for navigation natively, we must extend `KeybindingScope` in `keybinding-types.ts` to include `onUnhandledKey?: (key: string, event: KeyEvent) => boolean` and invoke it inside the dispatch loop when no explicit binding matches.

## 4. Navigation and Router

The `NavigationProvider.tsx` and `router/types.ts` define how screens are tracked:
- Exposes `NavigationContext` containing `stack`, `currentScreen`, `push()`, `pop()`, `replace()`, `reset()`, `repoContext`, and `orgContext`.
- `ScreenName` in `router/types.ts` exposes all possible navigation destinations (e.g., `Dashboard`, `Issues`, `Workspaces`, `Workflows`).
- `router/registry.ts` maps `ScreenName` entries to `ScreenDefinition`s, and enforces whether a screen `requiresRepo` or `requiresOrg`.
- The context filtering for commands (e.g., hiding `Go to Issues` when not in a repository context) will utilize the `repoContext` exposed by `useNavigation()`.

## 5. Layout and Responsiveness

`apps/tui/src/hooks/useLayout.ts` calculates standard dimensions synchronously:
- Extracts size from `@opentui/react`'s `useTerminalDimensions()`.
- Determines a `breakpoint` (`null`, `"minimum"`, `"standard"`, `"large"`).
- Provides `modalWidth` and `modalHeight` properties (90% for standard, 60% for large, etc.).
- The spec asks for a specific layout tweak where the command palette height on the minimum breakpoint is 80% rather than the default 90%. We will need to enforce this directly in `OverlayLayer` when replacing the placeholder.

## 6. OpenTUI Renderables

`context/opentui/` contains a standard React-driven reconciliation engine for the terminal. 
- Provides components like `<box>`, `<text>`, `<scrollbox>` which support properties like `flexDirection`, `flexGrow`, `width`, `height`, and coloring (`fg`, `backgroundColor`).
- The standard approach to highlighting the active selection in a list is switching `backgroundColor` to `theme.primary` on a `<box>` element.

## 7. Next Steps Checklist based on Findings

1.  **Fuzzy Search Engine**: Build `fuzzyMatch.ts` inside `apps/tui/src/lib/` as a pure JS implementation.
2.  **Keybinding Engine Upgrade**: Enhance `KeybindingProvider.tsx` / `keybinding-types.ts` to add the `onUnhandledKey` interceptor mechanism.
3.  **Command Scaffolding**: Create the `apps/tui/src/commands/` folder, implement `types.ts`, `navigationCommands.ts`, and `index.ts` to establish the command metadata structures derived from `router/registry.ts`.
4.  **State Management**: Create `useCommandPalette.ts` in `hooks/` utilizing `useNavigation()`, `useLayout()`, and `useOverlay()`.
5.  **Component Rendering**: Create `<CommandPalette>` leveraging `<box>`, `<scrollbox>`, `<text>`.
6.  **Integration**: Replace the string placeholder in `OverlayLayer.tsx` with `<CommandPalette />` and wire the custom resize behavior.
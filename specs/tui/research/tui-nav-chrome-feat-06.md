# Research Findings: TUI Help Overlay (`tui-nav-chrome-feat-06`)

This document synthesizes findings from exploring the Codeplane TUI codebase to inform the implementation of the `TUI_HELP_OVERLAY` feature. It outlines existing architectural patterns, component structures, and available utilities relevant to the engineering specification.

## 1. Overlay System Architecture

### `OverlayManager` (`apps/tui/src/providers/OverlayManager.tsx`)
- Maintains the global `activeOverlay` state (`"help" | "command-palette" | "confirm" | null`).
- Exposes `openOverlay` and `closeOverlay` via `OverlayContext`.
- **Toggle Behavior:** The `openOverlay` function already implements toggle logic. If called with the currently active overlay type, it closes it (`if (prev === type) { ... return null; }`). This directly supports the requirement where pressing `?` while the help overlay is open closes it.
- **Keybinding Integration:** When an overlay opens, `OverlayManager` automatically registers a `PRIORITY.MODAL` keybinding scope for `Escape` to close the overlay. It also updates the status bar hints via `StatusBarHintsContext`.

### `OverlayLayer` (`apps/tui/src/components/OverlayLayer.tsx`)
- Responsible for visually rendering the active overlay.
- Wraps the content in a centered `<box>` with a border, title bar, and responsive dimensions retrieved from `useLayout()`.
- Currently renders a placeholder for the help overlay: `<text fg={theme.muted}>[Help overlay content — pending TUI_HELP_OVERLAY implementation]</text>`.
- When implementing `HelpOverlay`, it needs to take over the internal padding and title bar rendering, as `isHelp = activeOverlay === "help"` will change the container's padding to `0` according to the spec.

### `useOverlay` (`apps/tui/src/hooks/useOverlay.ts`)
- A convenience hook exposing the `OverlayContextType` to components. Useful for hooking up `openOverlay("help")` inside `GlobalKeybindings`.

## 2. Keybinding and Navigation Systems

### `GlobalKeybindings` (`apps/tui/src/components/GlobalKeybindings.tsx`)
- Currently contains an empty placeholder for the help action: `const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);`.
- Needs to be wired up to call `openOverlay("help")` from the `useOverlay` hook.

### `keybinding-types.ts` & `normalize-key.ts`
- `PRIORITY` levels are defined as: `TEXT_INPUT: 1`, `MODAL: 2`, `GOTO: 3`, `SCREEN: 4`, `GLOBAL: 5`.
- `KeyHandler` requires `key`, `description`, `group`, and `handler` fields.
- `normalizeKeyDescriptor()` in `normalize-key.ts` lowercases keys, handles aliases (`Enter` -> `return`, `Esc` -> `escape`), and transforms modifiers (`Ctrl+C` -> `ctrl+c`), while preserving exact casing for single uppercase letters (e.g., `G`). 

### `goToBindings` (`apps/tui/src/navigation/goToBindings.ts`)
- Exports `goToBindings`, a readonly array of 11 `GoToBinding` objects.
- Properties include `key` (e.g., `"d"`, `"r"`) and `description` (e.g., `"Dashboard"`, `"Repositories"`).
- The spec indicates the help overlay should map these into a `"Go To"` group by prefixing the key with `"g "` (e.g., `"g d"`).

## 3. UI and Theming Utilities

### OpenTUI JSX Elements
- `<box>`: Supports Flexbox props (`flexDirection`, `flexGrow`, `justifyContent`, `gap`, `paddingX`, etc.).
- `<text>`: Supports `fg` (foreground color), `bold`, and wrapping.

### `useTheme` & `tokens.ts`
- Semantic colors like `theme.primary` (used for group headings/titles), `theme.warning` (used for keys), `theme.muted` (used for descriptions/footer), and `theme.border` (used for separators) are available via the `useTheme()` hook and map to raw OpenTUI color instances.

### `util/text.ts`
- Exports `truncateText(text: string, maxLength: number): string`.
- This utility safely truncates strings to a maximum length and appends an ellipsis (`…`), fulfilling the responsive design requirement for truncating long descriptions.

### `index.tsx` (Provider Stack)
- The provider stack is well-ordered. `HelpOverlayContextProvider` must be injected inside `<OverlayManager>` and before components like `<AuthProvider>` or `<GlobalKeybindings>` that might register or trigger keybindings.

## 4. Testing Infrastructure

### `e2e/tui/app-shell.test.ts`
- E2E tests use `launchTUI()` which returns a `TUITestInstance` with methods like `.waitForText()`, `.sendKeys()`, `.snapshot()`, `.resize(cols, rows)`, and `.getLine(index)`.
- Standard breakpoints (`TERMINAL_SIZES`) are available for responsive testing (`minimum: 80x24`, `standard: 120x40`, `large: 200x60`).
- The extensive 34-test suite from the spec fits naturally at the bottom of this file, leveraging these helpers for testing snapshot rendering, keybinding interactions, and dynamic resizing behavior.

## Conclusion
All required underlying systems (Overlay system, Reconciler, Keybinding priorities, text truncation utilities, and testing harnesses) are firmly in place. The implementation involves creating the isolated context/component for the Help Overlay and surgically integrating it into `OverlayManager`, `OverlayLayer`, and `GlobalKeybindings` as outlined in the spec.
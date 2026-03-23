# TUI_COMMAND_PALETTE Research Findings

## 1. Keybinding System Architecture

The TUI handles keyboard events through a layered priority system managed by the `KeybindingProvider`. 

### Priority Layers (`PRIORITY` enum):
- `TEXT_INPUT (1)`: Highest priority, meant for focused text elements.
- `MODAL (2)`: For overlays like the Command Palette, Help, and Confirm dialogs.
- `GOTO (3)`: For 'g' prefixed quick navigation.
- `SCREEN (4)`: For screen-specific keybindings (e.g., list navigation).
- `GLOBAL (5)`: Fallback keybindings (e.g., `q` to quit, `:` to open command palette).

### `KeybindingProvider` Mechanics
`KeybindingProvider` hooks into `@opentui/react`'s `useKeyboard` at the root level and routes events:
1. It collects all registered `KeybindingScope`s and sorts them by priority (ascending, so `1` is first).
2. If a scope handles an event (and its optional `when()` predicate is true), it calls `event.preventDefault()` and `event.stopPropagation()`.
3. Unhandled events fall through to OpenTUI's native focused components or to component-level `useKeyboard` listeners.

## 2. Text Input and OpenTUI's `useKeyboard`

### Component-level `useKeyboard`
The `@opentui/react` package provides `useKeyboard(handler, options)`. 
- Captures key events emitted by the renderer.
- Emits single printable characters (`event.name` is the character itself, e.g., `a`, `B`).
- Events have properties: `name`, `sequence`, `ctrl`, `shift`, `meta`, `eventType`.

### Conflict Resolution for the Command Palette
The spec requires intercepting `j`/`k`/`Up`/`Down` for list navigation while allowing standard text typing for the search query. 
If we were to use the OpenTUI `<input>` component, it would naturally intercept all printable characters. However, intercepting `j` and `k` using a `MODAL` priority scope *before* they reach the input is preferred because the `KeybindingProvider` handles the scope resolution.

According to the engineering spec, the command palette should use `<text>` for displaying the query and a component-level `useKeyboard` listener to manually append printable characters (excluding `j` and `k` since they are mapped to navigation in the `MODAL` scope).

## 3. Overlay System

The `OverlayManager` provides the `useOverlay` hook.
- Uses `setActiveOverlay(type)`.
- Manages a central `MODAL` keybinding scope that registers `Escape` to close the active overlay.
- For `TUI_COMMAND_PALETTE`, the `CommandPalette` component will be rendered by `OverlayLayer` when `activeOverlay === "command-palette"`.
- The `CommandPalette` will register its own `MODAL` scope for `j`, `k`, `Enter`, `Ctrl+C`, etc. Since `KeybindingProvider` uses LIFO for scopes with the same priority, the `CommandPalette` scope will take precedence over the generic `OverlayManager` escape binding, giving it full control over interaction.

## 4. Navigation Targets (`goToBindings`)

The file `apps/tui/src/navigation/goToBindings.ts` exports `goToBindings`, an array containing destinations like `Dashboard`, `Issues`, `Workflows`, etc., alongside whether they require a `repoContext`. 
- The Command Palette needs to derive its "Navigate" commands directly from `goToBindings` to ensure the go-to shortcuts (`g d`, `g i`) always map to the exact same logic.
- The `executeGoTo(nav, binding, repoContext)` helper outlines the required navigation pattern: `nav.reset(ScreenName.Dashboard)` followed by `nav.push(ScreenName.RepoOverview, ...)` and finally `nav.push(binding.screen, ...)`.

## 5. Global Keybinding Toggle

The global `useGlobalKeybindings` maps `:` to `actions.onCommandPalette`. In `GlobalKeybindings.tsx`, this needs to be wired to `openOverlay("command-palette")`.
An important edge-case noted in the spec: `:` shouldn't open the command palette if a text input is currently focused. A `when` guard checking for text input focus will eventually be required, though for the initial implementation, managing this via context or active modal checks is necessary.

## 6. OpenTUI Layout and Breakpoints

The TUI uses `useLayout()` to expose terminal dimensions and breakpoints:
- `breakpoint === null` (Below 80x24): Auto-close palette.
- `breakpoint === "minimum"`: Minimal UI, hide category/description columns.
- Sizes scale responsive width/height fields (`modalWidth`, `modalHeight`).
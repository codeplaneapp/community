# Research Findings: `tui-repo-search-filter`

Based on a comprehensive search of the codebase, here are the key findings that inform the implementation of the `tui-repo-search-filter` feature.

## 1. `apps/tui/` Core Infrastructure

### Layout and Responsiveness
- **`useLayout.ts`**: The central responsive hook (`useLayout()`) returns a `LayoutContext` containing `width`, `height`, and a `breakpoint` (`"large" | "standard" | null`). It recalculates synchronously. This is crucial for rendering the `FilterToolbar` in different modes (minimum, standard, large).
- **`useBreakpoint.ts` / `useResponsiveValue.ts`**: The `useResponsiveValue` hook allows specifying a mapping object `{ minimum: T, standard: T, large: T }` to automatically return a value based on the active breakpoint.

### Keybindings System
- **`KeybindingProvider.tsx` & Types**: The TUI defines a strict keybinding priority system (`PRIORITY.TEXT_INPUT=1`, `PRIORITY.MODAL=2`, `PRIORITY.SCREEN=4`, `PRIORITY.GLOBAL=5`). 
- **`useScreenKeybindings.ts`**: This hook currently hardcodes registration at `PRIORITY.SCREEN`. Since the search input requires both `SCREEN` priority (when not focused) and `MODAL` priority (when focused to override general navigation), we cannot rely solely on `useScreenKeybindings`. Instead, the new `useSearchKeybindings` hook will need to interact directly with the `KeybindingContext` to register a `MODAL` scope when `inputFocused === true`, and a `SCREEN` scope otherwise.
- **Status Bar Hints**: `useScreenKeybindings` and `KeybindingProvider` provide `StatusBarHintsContext` to update hints dynamically. This satisfies the requirement to toggle status bar hints based on focus state.

### Utilities
- **`truncate.ts`**: Provides `truncateText(text, maxWidth)` which safely handles appending an ellipsis (`…`) if the text exceeds the character limit. This will be actively used for limiting badge and label widths in the `FilterToolbar`.

## 2. `context/opentui/` Component APIs

### Input Component
- **`types/components.ts`**: The OpenTUI `<input>` component defines `InputProps` extending `InputRenderableOptions`. Key props we will use:
  - `focused?: boolean`: Used to bind to `state.inputFocused`.
  - `onInput?: (value: string) => void`: Used to capture query text dynamically as the user types.
  - `onSubmit?: (value: string) => void`: Maps to the `Enter` confirmation action.

### Keyboard Hooks
- **`use-keyboard.ts`**: OpenTUI's `useKeyboard` handles key event subscriptions. It includes repeat detections (`e.repeated`). The `apps/tui` `KeybindingProvider` consumes this hook globally and delegates based on registered scopes, meaning our components should stick to scope registration via `KeybindingContext` rather than calling `useKeyboard` directly.

## 3. `packages/ui-core/` Data Hooks

- **Location Note**: The data hooks are actually located at `specs/tui/packages/ui-core/src/hooks/` for the TUI mock/stub environments.
- **`useIssues.ts`**: The signature is `useIssues(owner, repo, options?: IssuesOptions)`. The returned object includes `{ issues, totalCount, isLoading, error, ... }`. 
- **Search Query Parameter**: Currently, `useIssues` parses `options.state` but does not yet accept a search text parameter (`options.q` or `options.search`). As noted in the engineering spec's productionization notes, `?q=` needs to be added to these API hooks so `onServerSearch` can properly dispatch the debounced text query to the backend when `totalCount >= 200`.
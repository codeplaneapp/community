# TUI Dashboard Panel Component Research Findings

## 1. OpenTUI Component APIs (`context/opentui/`)

### `<input>` Component
Based on `context/opentui/packages/react/src/types/components.ts` and React examples, the `<input>` component supports the following key props:
- `value` (string): The current value of the input.
- `placeholder` (string): Text shown when the input is empty.
- `focused` (boolean): Whether the input currently captures keyboard priority (e.g., Priority 1 for text).
- `onInput` (function): Callback receiving the updated string as the user types.
- `onSubmit` (function): Callback triggered when the user presses Enter within the input.

*Example from OpenTUI `basic.tsx`:*
```tsx
<input
  placeholder="Enter your username..."
  onInput={handleUsernameChange}
  onSubmit={handleSubmit}
  focused={focused === "username"}
/>
```

### `<box>`, `<text>`, and Layout Components
- `<box>` supports standard flex layout properties: `flexDirection`, `flexGrow`, `justifyContent`, `alignItems`, `width`, `height`, `gap`.
- `<box border={true} borderColor={color}>` draws single borders natively.
- `<text>` supports `fg` (foreground color) and `attributes` for styling.

### `useKeyboard` Hook
- The `useKeyboard` hook captures global key presses. 
- When an `<input focused>` is active, it natively captures normal character presses. However, for specialized keyboard navigation (like Tab, Shift+Tab, or triggering the `/` filter), we must hook into `useKeyboard` at the Dashboard screen level.
- Example usage: `useKeyboard((key) => { if (key.name === "tab") { /* handle */ } })`.

## 2. Shared TUI Hooks & Utilities (`apps/tui/src/`)

### Theme System (`hooks/useTheme.ts`, `theme/tokens.ts`)
- `useTheme()` returns a frozen `ThemeTokens` object holding standard ANSI 256 or truecolor mapped properties.
- Useful tokens for the panel: `theme.primary` (focused border, title text), `theme.border` (unfocused border), `theme.muted` (empty/helper text), `theme.error` (error state).
- `TextAttributes`: An exported object containing semantic bitwise flags (`BOLD`, `DIM`, `UNDERLINE`, `REVERSE`). Usage: `attributes={TextAttributes.BOLD}`.

### Loading States (`hooks/useSpinner.ts`)
- `useSpinner(active: boolean)` returns a single braille character string representing the current animation frame.
- Can be composed natively inside `<text>`: `<text><span fg={theme.primary}>{useSpinner(true)}</span> Loading...</text>`.

### Layout System (`hooks/useLayout.ts`)
- `useLayout()` provides structural properties of the terminal screen, including `.breakpoint`.
- `breakpoint === "minimum"` corresponds to the compact mode trigger for stacking panels vertically instead of using the standard 2x2 grid.

### Utilities (`util/text.ts`)
- `truncateRight(text: string, maxWidth: number)` is available in `apps/tui/src/util/text.ts` to ensure titles do not overflow the panel container width.

## 3. Error Handling Patterns

### Error Formatting (`lib/normalize-error.ts`, `lib/logger.ts`)
- `normalizeError(thrown: unknown): Error` normalizes thrown exceptions into standard Error objects.
- `logger.error(...)` should be used inside `componentDidCatch` to append logs without disrupting the standard TUI stdout sequence.

### Error Boundary Reference (`components/ErrorBoundary.tsx`)
- The app-level boundary utilizes a standard React class component pattern:
  ```tsx
  static getDerivedStateFromError(thrown: unknown) { return { hasError: true, error: normalizeError(thrown) }; }
  componentDidCatch(thrown: unknown) { logger.error(...) }
  ```
- The per-panel boundary (`PanelErrorBoundary`) will follow this exact pattern but stripped of crash-loop detection and fallback to rendering a localized `<box>` error state.

## 4. Current Setup State in the Repository
- **Registry Status**: In `apps/tui/src/router/registry.ts`, `ScreenName.Dashboard` currently maps to `PlaceholderScreen`. The `DashboardScreen` files (from the `tui-dashboard-screen-scaffold` ticket) have not been checked into the main trunk yet, or they serve as an incoming scaffold dependency for this implementation.
- Therefore, the integration changes intended for `apps/tui/src/screens/Dashboard/index.tsx` will be created directly on top of the placeholder or alongside it when executing the component plan.
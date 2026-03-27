# Research Report: `tui-search-screen-scaffold`

This document outlines the existing codebase context, patterns, and files necessary to implement the Search screen scaffold.

## 1. Screen Registry & Routing

**`apps/tui/src/router/registry.ts`**
Currently, `ScreenName.Search` is mapped to `PlaceholderScreen`:
```typescript
  [ScreenName.Search]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Search",
  },
```
**Action:** Update the import to point to the newly created `SearchScreen` and replace `PlaceholderScreen` in the registry for `ScreenName.Search`.

**`apps/tui/src/router/types.ts`**
The `SearchScreen` component will need to accept `ScreenComponentProps`, which provides `entry` and `params`:
```typescript
export interface ScreenComponentProps {
  entry: ScreenEntry;
  params: Record<string, string>;
}
```

## 2. Navigation

**`apps/tui/src/navigation/goToBindings.ts`**
The `g s` keybinding is already correctly mapped to `ScreenName.Search`:
```typescript
{ key: "s", screen: ScreenName.Search, requiresRepo: false, description: "Search" }
```
No changes are needed here.

**`apps/tui/src/providers/NavigationProvider.tsx`**
The `useNavigation()` hook provides the `pop()` method, which is needed to handle the `Esc` key behavior (returning to the previous screen when the input is unfocused):
```typescript
export function useNavigation() { ... }
// Provides: { pop: () => void, push: (screen, params) => void, ... }
```

## 3. Shared Hooks

The required UI hooks are correctly defined and can be imported seamlessly:

**`apps/tui/src/hooks/useLayout.ts`**
Provides responsive breakpoints and terminal dimensions:
```typescript
export function useLayout(): LayoutContext
// Returns: { breakpoint: "minimum" | "standard" | "large", width, height, ... }
```

**`apps/tui/src/hooks/useTheme.ts`**
Provides the semantic color tokens for styling:
```typescript
export function useTheme(): Readonly<ThemeTokens>
// Returns semantic colors like `theme.primary`, `theme.muted`, `theme.border`, etc.
```

**`apps/tui/src/hooks/useScreenKeybindings.ts`**
Provides a way to register screen-specific keybindings and status bar hints:
```typescript
export function useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void
```

## 4. Testing Helpers

**`e2e/tui/helpers.ts`**
Contains all necessary functions to build the E2E tests for the new search screen:
- `launchTUI(options?: LaunchTUIOptions)`: Boots the TUI instance.
- `TERMINAL_SIZES`: Constants for terminal sizing (e.g., `TERMINAL_SIZES.minimum`, `TERMINAL_SIZES.standard`).
- `TUITestInstance`: Provides the interface for interaction: `sendKeys`, `sendText`, `waitForText`, `waitForNoText`, `getLine`.

## Implementation Next Steps

1. Scaffold **`useSearchInput.ts`** handling debounce and text clamping using standard React hooks (`useState`, `useRef`, `useCallback`, `useEffect`).
2. Scaffold **`SearchScreen.tsx`** using `<box>`, `<input>`, and `<text>` components from OpenTUI, using the data from `useLayout` to manage responsiveness and `useScreenKeybindings` to register the `escape` and `/` keybindings.
3. Add an `index.ts` barrel file inside `apps/tui/src/screens/Search/`.
4. Update **`registry.ts`** to render the `SearchScreen` component.
5. Scaffold the E2E test suite in **`e2e/tui/search.test.ts`** asserting the scaffold behavior using `launchTUI()`.
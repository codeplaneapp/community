# TUI Screen Registry Research

## 1. Existing Router Architecture (`apps/tui/src/router/`)

The router directory already exists and contains the foundational navigation types implemented in `tui-navigation-provider`.

### `apps/tui/src/router/types.ts`
Defines the core `ScreenEntry` and navigation limits:
- `MAX_STACK_DEPTH = 32`
- `DEFAULT_ROOT_SCREEN = "Dashboard"`
- `ScreenEntry` type with `id: string`, `screen: string`, and `params?: Record<string, string>`.
- `NavigationContextType` interface with `push`, `pop`, `replace`, `reset`, `canPop`, `stack`, and `current`.

### `apps/tui/src/router/index.ts`
Currently exports the types and constants from `./types.ts`:
```typescript
export type { ScreenEntry, NavigationContextType, NavigationProviderProps } from "./types";
export { MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN, screenEntriesEqual } from "./types";
```
This confirms the spec's instruction to append to this barrel export.

## 2. Testing Framework (`e2e/tui/app-shell.test.ts`)

The test suite for navigation and app shell is already well-established in `e2e/tui/app-shell.test.ts` using `bun:test` and `@microsoft/tui-test`.

It currently contains tests grouped under `describe("TUI Navigation Provider and App Shell", () => { ... })`, including:
- `NAV-SNAP-*`: Terminal snapshot tests (e.g., `NAV-SNAP-001: initial render shows Dashboard as root screen`).
- `NAV-KEY-*`: Keyboard interaction tests.
- `NAV-INT-*`: Integration tests.
- `NAV-EDGE-*`: Edge case tests.

Our screen registry tests (`REG-SNAP-*`, `REG-KEY-*`, `REG-INT-*`, `REG-EDGE-*`) will naturally fit into this file, likely appended at the end of the `describe` block or as a new `describe` block for screen registry within the same file.

## 3. OpenTUI Patterns for `PlaceholderScreen`

The placeholder screen is expected to use OpenTUI components:
- `<box>`: For layout. The spec requires `flexDirection="column"`, `justifyContent="center"`, `alignItems="center"`, `flexGrow={1}`, `width="100%"`, `height="100%"`.
- `<text>`: For rendering the screen name and params, using props like `bold` and `dimColor`.

Since OpenTUI exposes these via `@opentui/react`, the implementation will start with:
```tsx
import React from "react";
// `<box>` and `<text>` are intrinsic elements provided by the OpenTUI React reconciler.
```

## 4. Next Steps for Implementation

Based on the codebase state:
1. **Create `apps/tui/src/router/screens.ts`**: Implement the `SCREEN_IDS` constant, `ScreenDefinition` interface, `screenRegistry`, and the lookup functions.
2. **Create `apps/tui/src/screens/PlaceholderScreen.tsx`**: Build the component using OpenTUI's intrinsic layout and text elements.
3. **Update `apps/tui/src/router/index.ts`**: Append the exports from `screens.ts`.
4. **Update `e2e/tui/app-shell.test.ts`**: Append the `REG-*` test cases outlined in the spec.

The codebase perfectly aligns with the engineering spec, with all prerequisites (`tui-navigation-provider` structures) fully in place.
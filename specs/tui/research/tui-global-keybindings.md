# TUI Global Keybindings Research Findings

## 1. Existing Infrastructure (Already Ported)
Many of the files specified in the engineering plan have already been partially or fully ported into `apps/tui/src/`. This provides a strong foundation but leaves specific gaps that need to be addressed.

### Fully Implemented Core Modules
- **`apps/tui/src/providers/normalize-key.ts`**: Implements `normalizeKeyEvent` and `normalizeKeyDescriptor` exactly as defined in the spec.
- **`apps/tui/src/providers/keybinding-types.ts`**: Contains types and priority constants (`PRIORITY.GLOBAL`, `PRIORITY.SCREEN`, etc.).
- **`apps/tui/src/providers/KeybindingProvider.tsx`**: Provides the single `useKeyboard()` funnel, priority/LIFO scope sorting, event matching logic, and `StatusBarHintsContext` implementation.
- **`apps/tui/src/hooks/useGlobalKeybindings.ts`**: Properly registers the global priority scope (`PRIORITY.GLOBAL`).
- **`apps/tui/src/hooks/useScreenKeybindings.ts`**: Present and correctly manages screen-level scopes and auto-cleanup.
- **`apps/tui/src/hooks/useStatusBarHints.ts`**: Correctly wraps context consumption for status bar hints.
- **`apps/tui/src/index.tsx`**: The provider stack is already structured correctly (`KeybindingProvider` wraps `NavigationProvider` which wraps `GlobalKeybindings`).

## 2. Gaps & Missing Implementations

### `apps/tui/src/components/GlobalKeybindings.tsx`
Currently, this file contains stub implementations for key actions rather than the functional logic required for Go-To mode. 
```typescript
  const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);
```
**Required Updates:**
- Implement `goToMode` state, `goToTimeout` ref, and `goToScopeId` ref.
- Wire `onGoTo` to register a temporary `PRIORITY.GOTO` scope parsing bindings from `goToBindings.ts`.
- Implement status bar override (`statusBarCtx?.overrideHints(...)`) during go-to mode.

### `apps/tui/src/navigation/goToBindings.ts`
The file exists and correctly defines the `goToBindings` array and `executeGoTo` handler, but it is currently not consumed by `GlobalKeybindings.tsx`.

### `e2e/tui/app-shell.test.ts`
The file is heavily populated with tests for `TUI_APP_SHELL`, layout (`HOOK-LAY-*`), and theming (`THEME_*`). However, the extensive keybinding E2E tests (`KEY-SNAP-*`, `KEY-KEY-*`, `KEY-RSP-*`, `KEY-INT-*`, `KEY-EDGE-*`) detailed in the spec are **completely missing** from this file. They need to be appended.

### `e2e/tui/keybinding-normalize.test.ts`
The normalization unit test file exists, but it might lack tests verifying the caller's responsibility to filter release events (e.g., a test clarifying `eventType: "release"` handling vs `eventType: "press"`), which the spec indicated. 

## 3. OpenTUI Context Findings
Searches within `context/opentui/` verify the API contracts expected by the implementation:
- **`useKeyboard` Hook**: Available at `@opentui/react` and expects a signature like `(handler: (key: KeyEvent) => void, options?)`. 
- **`KeyEvent` Interface**: Verified to contain `name`, `shift`, `ctrl`, `meta`/`option`, and crucially, `eventType` (`"press" | "repeat" | "release"`). The provider correctly handles this by checking `if (event.eventType === "release") return;`.

## 4. Consumer Components Context
- **`apps/tui/src/components/StatusBar.tsx`**: Already consumes `useStatusBarHints()` and has logic to render `hints.keys` and `hints.label`. At minimum width, it intelligently slices hints `hints.slice(0, 4)`. This confirms that the status bar is perfectly staged to receive the `overrideHints` triggers from the `GlobalKeybindings` go-to mode.
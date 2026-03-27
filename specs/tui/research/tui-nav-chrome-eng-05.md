# Research Findings: `tui-nav-chrome-eng-05` — GoToMode Hook and State Machine

Based on a comprehensive review of the codebase within `apps/tui/`, `context/opentui/`, and test specifications, here is the context relevant to implementing the `useGoToMode` hook.

## 1. Existing Navigation System (`apps/tui/src/navigation/goToBindings.ts`)

The application already has a defined set of Go-To bindings and an execution logic scaffolded:
- **`goToBindings`**: A static `readonly GoToBinding[]` array containing 11 entries mapping characters (e.g., `"d"`, `"i"`, `"r"`) to their target `ScreenName`, whether they require a repo (`requiresRepo: boolean`), and a description.
- **`executeGoTo`**: A synchronous pure function that takes `nav` (a NavigationContext), `binding` (a GoToBinding), and `repoContext` (owner/repo). It handles checking context logic (`return { error: "No repository in context" }`) and executing stack resets (`nav.reset(...)`) and pushes (`nav.push(...)`).

This exact API perfectly matches the `resolveGoTo` requirements laid out in the spec.

## 2. Keybinding Provider System (`apps/tui/src/providers/`)

The OpenTUI `useKeyboard` hook is fully abstracted through a robust context system (`KeybindingProvider.tsx`), allowing scoped keybinding registration based on priority.

### Types & Enums (`keybinding-types.ts`)
- **`PRIORITY` object**: Specifically declares `PRIORITY.GOTO = 3`, `PRIORITY.SCREEN = 4`, and `PRIORITY.GLOBAL = 5`. Go-to mode needs to use `PRIORITY.GOTO` to intercept keystrokes before they reach screen handlers.
- **`KeyHandler`**: An interface requiring `key`, `description`, `group`, and a `handler: () => void` function.
- **`StatusBarHint`**: Requires `keys`, `label`, and optional `order`.

### Providers (`KeybindingProvider.tsx`)
- **`KeybindingContext`**: Exposes `registerScope(scope) => string` and `removeScope(id: string)`. It also provides `hasActiveModal()` which returns `true` if a `PRIORITY.MODAL` scope is currently active—essential for guarding `activate()` as outlined in the spec.
- **`StatusBarHintsContext`**: Exposes `overrideHints(hints: StatusBarHint[]) => () => void`. Invoking this function returns the cleanup callback that must be executed to restore previous hints. This satisfies the hint lifecycle requirements.

### Key Normalization (`normalize-key.ts`)
- **`normalizeKeyDescriptor(descriptor: string)`**: Normalizes keys to standard lowercase variants, preserving single capital letters, and parsing `escape` properly. It will be used directly to normalize letter matching.

## 3. Global Keybindings Wiring (`apps/tui/src/components/GlobalKeybindings.tsx`)

The `GlobalKeybindings.tsx` file initializes global fallbacks, importing `useGlobalKeybindings.ts`.
- `useGlobalKeybindings` already registers `g` at `PRIORITY.GLOBAL` mapped to the `onGoTo` handler.
- Currently, in `GlobalKeybindings.tsx`, the `onGoTo` handler is scaffolded as `/* TODO: wired in go-to keybindings ticket */`.
- The `onEscape` callback pops the navigation stack but has no concept of `goTo.active`. The spec's requirement to check `goTo.active` in `onEscape` requires wrapping the existing escape logic within `GlobalKeybindings.tsx`.

## 4. Test Infrastructure (`e2e/tui/app-shell.test.ts`)

The `e2e/tui/app-shell.test.ts` file contains extensive verification for navigation routing (`NAV-001` through `NAV-009`) and has placeholders for the Go-To validation:
- `NAV-GOTO-001`, `NAV-GOTO-002`, `NAV-GOTO-003` are present but likely stubbed or testing partial behavior.
- `KEY-KEY-006` tests that `g` activates go-to mode and alters the status bar.
- `KEY-KEY-012` verifies priority routing.
- `KEY-KEY-031` asserts that hints are overridden and subsequently cleaned up.
- The requested additional test blocks (`NAV-GOTO-004` to `NAV-GOTO-009`) fit perfectly into the `describe("TUI_SCREEN_ROUTER — go-to context validation")` section, validating status bar line output strings to ensure timeout and key interception mechanics work.

## 5. Exports and Component Architecture
- The `hooks/index.ts` file acts as a barrel export file. `useGoToMode` needs to be exported here alongside `GoToHint` and `GoToModeState` type signatures.
- All components use `React 19` mechanisms (`useRef`, `useCallback`, `useState`, `useEffect`, `useMemo`), meaning the specified timer lifecycle logic inside `useGoToMode` aligns natively with the environment.

## Missing Assets Evaluated
- `packages/ui-core/` searches yielded no files matching the required context; however, no dependencies strictly rely on `ui-core` for the state machine execution as `NavigationContext` natively lives in `apps/tui/src/providers/NavigationProvider.tsx`.

### Summary
The codebase architecture explicitly anticipates this implementation. `goToBindings` defines the static target map, `KeybindingProvider` affords exactly the scope mounting/unmounting structure, and `StatusBarHintsContext` handles transient messaging. The hook only needs to act as the intermediary State Machine, tracking lifetimes via `useRef(setTimeout)` limits, registering the dynamic `PRIORITY.GOTO` scope with catch-all handlers, and mapping output actions onto `executeGoTo`.
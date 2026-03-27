# TUI Go-To Keybindings: Research & Context

## 1. Overview

This research documents the existing infrastructure in the Codeplane TUI (`apps/tui`) required to implement the `tui-goto-keybindings` feature as described in the specification.

The feature requires adding a transient `g` mode where pressing a second key navigates to a specific screen (e.g., `g d` for Dashboard). It relies heavily on the `KeybindingProvider` and `StatusBarHintsContext` for registering key scopes and updating the UI.

## 2. Existing Infrastructure

### `apps/tui/src/navigation/goToBindings.ts`

The mapping for go-to mode destinations is fully implemented here:
- `goToBindings`: A readonly array of 11 `GoToBinding` objects containing `key` (e.g., "d", "r", "i"), `screen` (`ScreenName`), `requiresRepo` (boolean), and `description`.
- `executeGoTo(nav, binding, repoContext)`: A utility function that executes the navigation. It returns `{ error: string }` if a binding requires a repo context but none is available.

### `apps/tui/src/components/GlobalKeybindings.tsx` & `hooks/useGlobalKeybindings.ts`

- `useGlobalKeybindings.ts` maps `actions.onGoTo` to the normalized `g` key under `PRIORITY.GLOBAL`.
- `GlobalKeybindings.tsx` provides the `onGoTo` handler, which currently contains a stub: `/* TODO: wired in go-to keybindings ticket */`.
- Once `useGoToMode` is implemented, it will be initialized here and its `activate()` method will replace the stub.

### `apps/tui/src/providers/KeybindingProvider.tsx` & `keybinding-types.ts`

The `KeybindingProvider` exposes two contexts: `KeybindingContext` and `StatusBarHintsContext`.

**`KeybindingContext`:**
- `registerScope({ priority, bindings, active })`: Used to mount a temporary keybinding scope. We will register the go-to scope at `PRIORITY.GOTO` (level 3).
- `removeScope(id)`: Removes the scope when navigation completes, errors out, cancels, or times out.
- `hasActiveModal()`: Used to prevent go-to activation when a modal overlay is open.
- `PRIORITY.GOTO` is already defined in `keybinding-types.ts`.

**`StatusBarHintsContext`:**
- `overrideHints(hints)`: Overrides the current screen hints with temporary ones. This will be used to show the go-to destination options (`g+d:dashboard`, etc.) and the "No repository in context" error.

### `apps/tui/src/providers/normalize-key.ts`

Provides `normalizeKeyDescriptor(descriptor)` to ensure consistent key lookup (e.g., mapping `escape` and handling single characters vs modifiers). Go-to binding keys must be normalized before being mapped to handlers in the `PRIORITY.GOTO` scope.

### `apps/tui/src/components/StatusBar.tsx`

Currently, the status bar displays hints from `useStatusBarHints()`. The logic for truncation is simplistic:
```tsx
const showFullHints = breakpoint !== "minimum";
const displayedHints = showFullHints ? hints : hints.slice(0, 4);
```
It renders hints strictly expecting a primary key and muted label. 

**Required Changes per Spec:**
1. Modify `StatusBarHint` type in `keybinding-types.ts` to accept an optional `color?: "error" | "warning" | "success" | "primary" | "muted"`.
2. Update `StatusBar.tsx` to handle dynamic width-based truncation with an ellipsis (`…`) rather than fixed indices.
3. Update the rendering block in `StatusBar.tsx` to apply `hint.color` if it is present (essential for rendering the red "No repository in context" error message).

## 3. Findings & Implementation Considerations

1. **State Management (`useGoToMode.ts`):**
   The transient state hook will manage the 1500ms timeout for go-to mode expiration and the 2000ms timeout for error display. It must rigorously clean up intervals and scopes on unmount using `useRef` handles.

2. **Catch-All Handler:**
   Since the `KeybindingProvider` acts as a first-match-wins engine, we must populate the `PRIORITY.GOTO` scope not only with valid keys (the 11 destinations, plus `q`, `escape`, and `ctrl+c`) but also with catch-all keys (e.g., all lowercase alphabets and digits) to act as standard "cancel" triggers for unrecognized key presses. This prevents fallthrough to global handlers while go-to is active.

3. **Help Overlay (`useGoToHelpBindings.ts`):**
   Bindings must be registered purely for the help overlay (without handling logic) via a `PRIORITY.GLOBAL` scope where `when: () => false`. This ensures the bindings render in the Help overlay's "Go To" group without intercepting keys unexpectedly.

4. **Telemetry & Logging:**
   The `logger` is available in `apps/tui/src/lib/logger.js`. The specification requires structured JSON logs. The latency calculation (`Date.now() - activationTimestamp`) should be logged when navigating or cancelling.

5. **Dependencies & Module Paths:**
   The existing codebase strictly uses `.js` extensions for local module resolution in TypeScript (e.g., `import { useLayout } from "../hooks/useLayout.js"`), so new imports must follow this pattern.

## 4. Conclusion

The foundational dependencies for this feature (TUI AppShell, NavigationProvider, KeybindingProvider, and Screen boundaries) are present and correctly wired. The remaining work exclusively involves creating the state machine (`useGoToMode`), enhancing the `StatusBar` hint rendering, and injecting these into `GlobalKeybindings`.
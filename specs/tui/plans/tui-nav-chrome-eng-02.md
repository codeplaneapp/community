# Implementation Plan: `tui-nav-chrome-eng-02` (KeybindingProvider)

This implementation plan details the steps required to deliver the `KeybindingProvider` and its associated priority-layered dispatch infrastructure. It strictly adheres to the provided engineering specification and the React 19 + OpenTUI environment.

## Step 1: Define the Keybinding Type System
**File:** `apps/tui/src/providers/keybinding-types.ts`

Create the core types that define key handlers, prioritization constants (`PRIORITY`), scope structures, and context interfaces for both bindings and status bar hints.
- Export `PRIORITY` with 5 levels: TEXT_INPUT (1), MODAL (2), GOTO (3), SCREEN (4), GLOBAL (5).
- Export interfaces: `KeyHandler`, `KeybindingScope`, `KeybindingContextType`, `StatusBarHint`, `StatusBarHintsContextType`.

## Step 2: Key Event Normalization Utilities
**File:** `apps/tui/src/providers/normalize-key.ts`
**Test File:** `e2e/tui/keybinding-normalize.test.ts`

Implement pure functions to map OpenTUI's `KeyEvent` objects into standardized descriptor strings (e.g., `"ctrl+c"`, `"G"`, `"escape"`).
- `normalizeKeyEvent(event: KeyEvent): string`: Maps raw event payloads.
- `normalizeKeyDescriptor(descriptor: string): string`: Normalizes input strings for map lookups.
- *Testing*: Write the pure unit tests detailed in the spec to verify standard characters, modifiers, shifted caps, and special aliases.

## Step 3: Implement the KeybindingProvider
**File:** `apps/tui/src/providers/KeybindingProvider.tsx`

Develop the core provider to centralize OpenTUI's `useKeyboard` call and dispatch events top-down.
- Utilize a `useRef` + version counter pattern for scope management to maintain stable dispatch avoiding unnecessary re-renders.
- Implement `getActiveScopesSorted()` to evaluate the scope stack by PRIORITY (ascending) and LIFO order within the same priority layer.
- Ensure the single `useKeyboard()` handler intercepts events, iterates scopes, checks the `when()` predicate, executes the handler, and invokes `event.preventDefault()` / `event.stopPropagation()` on a match.
- Provide `KeybindingContext` and `StatusBarHintsContext`.

## Step 4: Implement Developer Hooks
**Files:**
- `apps/tui/src/hooks/useScreenKeybindings.ts`
- `apps/tui/src/hooks/useGlobalKeybindings.ts`
- `apps/tui/src/hooks/useStatusBarHints.ts`

Implement the custom hooks screens will use to push and pop their scopes.
- `useScreenKeybindings`: Mounts a `PRIORITY.SCREEN` scope. Auto-registers its bindings as status bar hints.
- `useGlobalKeybindings`: Mounts a `PRIORITY.GLOBAL` scope as a fallback.
- `useStatusBarHints`: Consumes the context to retrieve the currently active top-level hints for rendering.

## Step 5: Refactor App Shell & Existing Integrations
**Files to modify:**
- `apps/tui/src/index.tsx`: Inject `<KeybindingProvider>` into the provider stack above `<AppShell>` and `<GlobalKeybindings>`.
- `apps/tui/src/components/GlobalKeybindings.tsx`: Remove the direct `@opentui/react` `useKeyboard()` call. Refactor to use the new `useGlobalKeybindings` hook and pass through the `nav.pop()`, `process.exit(0)`, and stubbed out modal toggle actions.
- `apps/tui/src/components/StatusBar.tsx`: Remove hardcoded string hints (`"j/k:navigate Enter:select..."`). Use `useStatusBarHints()` to map the `hints` array into OpenTUI `<text>` elements.

## Step 6: E2E and Snapshot Testing
**File:** `e2e/tui/app-shell.test.ts`

Add all E2E test scenarios as defined in the engineering spec to validate priority dispatch, responsive hint rendering, scope lifecycles, and edge cases.
- Use `@microsoft/tui-test` and snapshot matching.
- Run tests via `bun test e2e/tui/`.
- Ensure tests failing due to pending backend mock behavior are left untouched.
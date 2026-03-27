# Implementation Plan: tui-goto-keybindings

## 1. Overview
This plan details the implementation of the `g` prefix go-to navigation mode in the Codeplane TUI. The feature introduces a transient state (1500ms timeout) where pressing a second key navigates to a specific top-level screen. It also enhances the status bar to show dynamic, width-aware hints and transient error messages.

## 2. Step-by-Step Implementation

### Step 1: Update `keybinding-types.ts`
**File:** `apps/tui/src/providers/keybinding-types.ts`
- Add an optional `color` property to the `StatusBarHint` interface to support error message rendering.
```typescript
export interface StatusBarHint {
  keys: string;
  label: string;
  order?: number;
  /** Optional semantic color override for the entire hint. */
  color?: "error" | "warning" | "success" | "primary" | "muted";
}
```

### Step 2: Enhance `StatusBar.tsx`
**File:** `apps/tui/src/components/StatusBar.tsx`
- Create a `calculateVisibleHints(hints, availableWidth)` helper function that computes how many hints fit the current terminal width before truncating with an ellipsis (`…`).
- Update the rendering loop to check for `hint.color`. If present, render the entire hint using that semantic color (e.g., `theme[hint.color]`). If absent, maintain the default primary/muted split.

### Step 3: Create `useGoToMode.ts` Hook
**File:** `apps/tui/src/hooks/useGoToMode.ts`
- Implement the `useGoToMode` hook returning `{ active, errorVisible, activate, cancel }`.
- Import `goToBindings` and `executeGoTo` from `../navigation/goToBindings.js`.
- In `activate()`:
  - Guard against active overlays via `keybindingCtx.hasActiveModal()` and terminal bounds via `useLayout()`.
  - Override status bar hints using `statusBarCtx.overrideHints()` to show destination options.
  - Register a new keybinding scope at `PRIORITY.GOTO`.
  - Map valid keys (from `goToBindings`) to their corresponding navigation logic, clearing timeouts and scopes upon execution. Handle missing repo contexts by showing an error in the status bar for 2000ms.
  - Add special handlers for `escape` (cancel), `q` (cancel and pop), and `ctrl+c` (exit).
  - Add a catch-all loop for remaining `a-z`, digits, and common punctuation to cancel the mode instantly upon an invalid key press.
  - Set a 1500ms timeout to auto-cancel the mode if no key is pressed.
- Include appropriate logging using `logger.info`, `logger.warn`, and `logger.debug` for activation, navigation, context failures, and cancellations.

### Step 4: Create `useGoToHelpBindings.ts` Hook
**File:** `apps/tui/src/hooks/useGoToHelpBindings.ts`
- Create a hook that registers go-to bindings explicitly for the Help Overlay.
- Map over `goToBindings` and register them under the `"Go To"` group at `PRIORITY.GLOBAL`.
- Set `when: () => false` on all these bindings so they act as display-only items and never intercept actual keystrokes.

### Step 5: Export Hooks
**File:** `apps/tui/src/hooks/index.ts`
- Export the newly created hooks to make them available to other components.
```typescript
export { useGoToMode, type GoToModeState } from "./useGoToMode.js";
export { useGoToHelpBindings } from "./useGoToHelpBindings.js";
```

### Step 6: Update `GlobalKeybindings.tsx`
**File:** `apps/tui/src/components/GlobalKeybindings.tsx`
- Import `useGoToMode` and `useGoToHelpBindings`.
- Initialize `const goTo = useGoToMode();` and unconditionally call `useGoToHelpBindings();` within the component.
- Replace the `onGoTo` stub with a callback that invokes `goTo.activate()`.
- Pass `onGoTo` into the existing `useGlobalKeybindings` hook call.

### Step 7: Create E2E Tests
**File:** `e2e/tui/goto-keybindings.test.ts`
- Create a dedicated E2E test file using `@microsoft/tui-test`.
- Implement snapshot tests to verify the status bar hints display at standard, minimum (80x24), and large (200x60) terminal sizes.
- Implement keyboard interaction tests to assert that sequences like `g d` (Dashboard) and `g r` (Repos) navigate correctly.
- Assert that `g i` (Issues) fails visually with the "No repository in context" status bar error when executed without a repo context.
- Assert cancellation behaviors: pressing `escape`, waiting 1500ms, or pressing an invalid key properly cleans up the mode and restores original hints.
- Ensure tests properly instantiate the TUI via the `launchTUI()` helper and terminate it in the `afterEach` block.
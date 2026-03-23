# Implementation Plan: `tui-nav-chrome-eng-05` — GoToMode Hook and State Machine

## 1. Overview

Implement the go-to mode state machine via a reusable `useGoToMode()` hook. Go-to mode uses a two-key chord system (e.g., `g` followed by `i` for Issues). The implementation will manage a 1500ms timeout window, handle high-priority keystroke interception, override status bar hints, and validate repository context. 

## 2. Step-by-Step Implementation

### Step 1: Define Types and Static Data
**File:** `apps/tui/src/hooks/useGoToMode.ts`
- Create the file and define the public API types `GoToHint` and `GoToModeState`.
- Pre-compute static constants from `goToBindings` (`apps/tui/src/navigation/goToBindings.ts`) to avoid recalculation per render:
  - `DESTINATION_HINTS`: Mapped `GoToHint[]` for the hook return.
  - `GOTO_BINDING_MAP`: `Map<string, GoToBinding>` for rapid lookup of normalized keys.
  - `GOTO_STATUS_HINTS`: `StatusBarHint[]` for the status bar override during go-to mode.

### Step 2: Implement the State Machine Hook
**File:** `apps/tui/src/hooks/useGoToMode.ts`
- Setup state variables `active` and `error`.
- Utilize `useRef` to maintain references to timeouts (`timeoutRef`, `errorTimeoutRef`), the keybinding scope ID (`scopeIdRef`), and the hint cleanup callback (`hintCleanupRef`).
- Implement `deactivate()`: Shared cleanup logic to clear timeouts, remove the keybinding scope, and invoke the hint cleanup callback.
- Implement `showError(message)`: Overrides the status bar with an error hint (`⚠`) and auto-clears after 2000ms using `errorTimeoutRef`.
- Implement `resolveGoTo(binding)`: Deactivates the mode and invokes `executeGoTo()`. If an error occurs (e.g., missing repo context), it calls `showError()`.
- Add a `useEffect` cleanup hook on unmount to prevent memory leaks and stale timers.

### Step 3: Keybinding Scope Registration
**File:** `apps/tui/src/hooks/useGoToMode.ts`
- Implement `activate()`:
  1. Check `keybindingCtx.hasActiveModal()`. If a modal is open, return early.
  2. If already active (`scopeIdRef.current !== null`), return early (idempotency).
  3. Set `active = true`.
  4. Register a `PRIORITY.GOTO` scope capturing all letters `a-z` and `escape`. Known keys trigger `resolveGoTo()`, and unknown letters/escape trigger `cancel()`.
  5. Call `statusBarCtx.overrideHints(GOTO_STATUS_HINTS)` and store the cleanup reference.
  6. Start a 1500ms timeout that triggers `cancel()` upon expiration.

### Step 4: Wire into GlobalKeybindings
**File:** `apps/tui/src/components/GlobalKeybindings.tsx`
- Import and initialize `useGoToMode()`.
- Replace the `/* TODO: wired in go-to keybindings ticket */` stub for `onGoTo` with `goTo.activate`.
- Update `onEscape`: Guard with `if (goTo.active) { goTo.cancel(); return; }` to ensure go-to mode cancellation intercepts a standard navigation pop.

### Step 5: Export from Hooks Index
**File:** `apps/tui/src/hooks/index.ts`
- Add exports for `useGoToMode`, `GoToHint`, and `GoToModeState` so the rest of the application can consume the hook natively.

### Step 6: E2E Tests
**File:** `e2e/tui/app-shell.test.ts`
- Insert tests inside the `describe("TUI_SCREEN_ROUTER — go-to context validation")` block to validate behaviors utilizing `@microsoft/tui-test` keyboard interactions:
  - `NAV-GOTO-004`: Verify that entering an unrecognized letter key cancels go-to mode and restores standard hints.
  - `NAV-GOTO-005`: Validate that triggering a repo-specific binding without context displays the error in the status bar and auto-clears after 2 seconds.
  - `NAV-GOTO-006`: Ensure `Escape` safely aborts go-to mode.
  - `NAV-GOTO-007`: Double `g` keypress correctly resets or handles state idempotently.
  - `NAV-GOTO-008`: Check non-repo bindings (Dashboard, Settings, Workspaces) navigate properly regardless of repo context.
  - `NAV-GOTO-009`: Validate all repo-requiring destinations appropriately fail when executed from global (e.g., Dashboard) screens.

## 3. Productionization Checklist
- [x] **Timer Cleanup:** All `setTimeout` limits are systematically cleared within `deactivate()` and unmount `useEffect`.
- [x] **Scope Leak Prevention:** Ensure `keybindingCtx.removeScope` executes correctly before reassigning the ref to null.
- [x] **Hint Override Lifecycles:** Cleanup function strictly restored post-timeout, resolve, or component tear-down.
- [x] **Catch-All Letter Handling:** Register a-z to completely encapsulate keystrokes and prevent unexpected fall-through actions firing on screen priority.
- [x] **Modal Verification:** `hasActiveModal` logic accurately suspends chord inputs if a command palette or warning dialogue is actively displayed.
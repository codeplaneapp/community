# Implementation Plan for TUI_GOTO_KEYBINDINGS (`tui-nav-chrome-feat-08`)

## Overview

This implementation plan introduces the full go-to keybinding system for the Codeplane TUI. Pressing `g` enters a transient "go-to mode", waiting for a follow-up key within 1500ms to navigate to one of 11 top-level destinations via stack replacement. The implementation involves creating a robust state machine hook, establishing a dedicated keybinding scope, managing context errors, updating the status bar, and providing thorough E2E testing.

## Step-by-Step Implementation

### Step 1: Enhance `goToBindings.ts` with Status Bar Hint Metadata

**File:** `apps/tui/src/navigation/goToBindings.ts`

1.  **Add Metadata Fields:** Enhance the `GoToBinding` interface with `statusBarLabel` (short label for status bar hints) and `order` (display order for the hints).
2.  **Populate Bindings:** Update the exported `goToBindings` array to include these properties for all 11 destinations (`d`, `i`, `l`, `r`, `w`, `n`, `s`, `a`, `o`, `f`, `k`).
3.  **Fix Stack Semantics:** Modify `executeGoTo()` to ensure strictly correct stack replacement logic. It must reset to `ScreenName.Dashboard`, then optionally push the context repository if `requiresRepo` is true, and then push the destination screen. Dashboard navigation resolves to `[Dashboard]`, context-free navigation to `[Dashboard, Destination]`, and repo-required navigation to `[Dashboard, Repo, Destination]`.

### Step 2: Create Core State Machine `useGoToMode.ts`

**File:** `apps/tui/src/hooks/useGoToMode.ts`

1.  **State Management:** Create a hook returning `GoToModeState` (`active`, `error`, `activate`, `cancel`, `setError`).
2.  **Activation:** In `activate()`, use `overrideHints()` from `useStatusBarHints()` to inject the go-to hints based on terminal width. Set a 1500ms timeout (`GOTO_TIMEOUT_MS`) to automatically cancel the mode if no further key is pressed.
3.  **Error Handling:** In `setError()`, cancel the go-to mode and set an error string visible for 2000ms (`GOTO_ERROR_DURATION_MS`). 
4.  **Cleanup:** Ensure `useEffect` cleanup properly clears the timeouts and restores the status bar hints via the `overrideHints()` cleanup function.

### Step 3: Create Priority Keybinding Hook `useGoToKeybindings.ts`

**File:** `apps/tui/src/hooks/useGoToKeybindings.ts`

1.  **Scope Registration:** When `goToMode.active` is true, register a new keybinding scope at `PRIORITY.GOTO` (Priority 3).
2.  **Valid Destinations:** For all 11 keys in `goToBindings`, assign a handler that calls `executeGoTo()`. If it returns an error (missing repo context), invoke `goToMode.setError()`. If successful, invoke `goToMode.cancel()`.
3.  **Cancellation Keys:** Register `Escape` to cancel silently, `q` to cancel and execute `onPop()`, `Ctrl+C` to cancel and execute `onQuit()`, and importantly, register `g` to cancel the mode (handling the rapid `g g` toggle edge-case).
4.  **Logging:** Record activation latency and log successful navigations or context failures using debug logs to `process.stderr`.

### Step 4: Enhance Keybinding Provider with Unhandled Key Callback

**Files:** 
- `apps/tui/src/providers/keybinding-types.ts`
- `apps/tui/src/providers/KeybindingProvider.tsx`

1.  **Context Type:** Add `setUnhandledKeyCallback(cb: ((key: string) => void) | null): void` to `KeybindingContextType`.
2.  **Implementation:** In `KeybindingProvider`, use a `useRef` to hold the callback. In the `useKeyboard` event listener, if the event doesn't match any registered bindings in any active scope, execute `unhandledKeyCallbackRef.current?.(descriptor)`.

### Step 5: Create `GoToModeProvider.tsx`

**File:** `apps/tui/src/providers/GoToModeProvider.tsx`

1.  **Provider Wrapper:** Create a simple context provider that calls `useGoToMode()` and makes its return state available across the app via a `useGoToModeContext()` hook.

### Step 6: Wire Go-To Mode in `GlobalKeybindings.tsx`

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

1.  **Wire Activation:** Replace the `TODO` in `onGoTo` callback to invoke `goToMode.activate()`. 
2.  **Suppression Logic:** Ensure `onGoTo` returns early if `breakpoint` is null (terminal too small) or if `ctx.hasActiveModal()` is true.
3.  **Toggle Check:** Within `onGoTo`, if `goToMode.active` is already true, call `cancel()` instead (additional fallback for the toggle case).
4.  **Wire Hooks:** Execute `useGoToKeybindings({ goToMode, onPop, onQuit })`.
5.  **Set Unhandled Callback:** Utilize a `useEffect` on `goToMode.active` to set the unhandled key callback on the `KeybindingContext` to cancel go-to mode if an unrecognized key is pressed.

### Step 7: Update `StatusBar.tsx` for Error Display and Truncation

**File:** `apps/tui/src/components/StatusBar.tsx`

1.  **Consume State:** Consume `useGoToModeContext()`.
2.  **Error Display:** In the left section of the status bar, prioritize rendering `goToMode.error` (styled with `theme.error`) over the generic `statusBarError` or standard hints.
3.  **Responsive Truncation:** Update the hint truncation logic. If `goToMode.active` is true, display all 11 hints at large width, 6 at standard width, or 4 at narrow width, adding an ellipsis `…` component if hints are truncated.

### Step 8: Add "Go To" Group to Help Overlay

**File:** `apps/tui/src/components/OverlayLayer.tsx`

1.  **Enhance Help Modal:** Within the placeholder rendering for `activeOverlay === "help"`, add a "Go To" section iterating over `goToBindings`.
2.  **Formatting:** Display the keybinding (`g <key>`), the description, and a `(requires repo)` tag if applicable.

### Step 9: Inject Provider in Application Entry

**File:** `apps/tui/src/index.tsx`

1.  **Update Provider Stack:** Wrap `GoToModeProvider` precisely under `NavigationProvider` and above `LoadingProvider` to ensure it has access to the navigation stack and provides context to `GlobalKeybindings` and `StatusBar`.

### Step 10: Extensive E2E Testing

**File:** `e2e/tui/app-shell.test.ts`

1.  **Test Inclusion:** Append all 52 specified integration and snapshot tests to the file.
2.  **Test Categories:**
    - **Snapshots (1–10):** Validating visual hints, truncations, contexts errors, and overlay sections via `toMatchSnapshot()`.
    - **Keyboard Interactions (11–40):** Tests covering successful routing, invalid contexts, cancellations (`Esc`, `q`, `Ctrl+C`, unrecognized keys), timeouts, and text input suppression.
    - **Responsive Scenarios (41–47):** Checking behaviour under resized conditions (e.g. 120x40 to 80x24) and verifying minimum capabilities.
    - **Integration Checks (48–52):** Verifying deep link continuity, repo context preservation, persistent badges, equivalent command-palette structures, and nested stack popping.
3.  **Standardization:** Use existing `@microsoft/tui-test` helpers like `launchTUI()`, `waitForText()`, `sendKeys()`, and `getLine()` strictly without mock layers.
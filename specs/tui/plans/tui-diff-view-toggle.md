# Implementation Plan: TUI_DIFF_VIEW_TOGGLE

This plan details the implementation for the `t` keybinding on the diff screen that toggles between unified and split (side-by-side) diff view modes in the Codeplane TUI.

## Step 1: Create View Toggle State Hook
**File:** `apps/tui/src/hooks/useDiffViewToggle.ts`

Create a custom hook to manage view mode, preferred mode, debounce logic, auto-revert on terminal resize, and flash messaging.

*   **State:** 
    *   `viewMode`: `'unified' | 'split'`
    *   `preferredMode`: Tracks user's explicit preference.
    *   `flashMessage`: Active flash string or `null`.
*   **Logic:**
    *   Implement `toggle()` function with a 100ms debounce.
    *   Validate terminal width (`width >= 120`). If `< 120`, reject split toggle and set a flash message.
    *   `useEffect` to auto-revert to `unified` if terminal shrinks below 120 cols while in `split` mode.
    *   Implement flash message auto-clearing (3000ms duration) with proper cleanup on unmount.

## Step 2: Create Scroll Preservation Hook
**File:** `apps/tui/src/hooks/useDiffScrollPreservation.ts`

Create a hook to capture and restore logical scroll position across `<diff>` view mode transitions, as the component reconstructs its internals.

*   **Implementation:**
    *   Use a React `useRef` pointing to the `<diff>` node.
    *   Implement `capturePosition()` to read `leftCodeRenderable.scrollY`.
    *   Implement `restorePosition()` to apply the saved `scrollY` back to the renderables after `requestAnimationFrame`.

## Step 3: Implement Diff View Indicator Context
**File:** `apps/tui/src/hooks/useDiffViewIndicator.ts`

Create a lightweight React context to communicate the active view mode to the `StatusBar` component.

*   **Context:** Exposes `mode: DiffViewMode | null` and `setMode: (mode) => void`.
*   **Provider:** `DiffViewIndicatorProvider` to wrap the screen area.

## Step 4: Update Diff Screen Scaffold
**File:** `apps/tui/src/screens/DiffScreen.tsx`

Integrate the toggle, scroll preservation, and indicator context into the main diff screen.

*   Consume `useDiffViewToggle`, `useDiffScrollPreservation`, and `useDiffViewIndicator`.
*   Call `indicator.setMode` on mount/unmount and mode changes.
*   Wrap `viewToggle.toggle()` with `capturePosition` and `restorePosition`.
*   Pass `view={viewMode}` and `syncScroll={viewMode === 'split'}` to the OpenTUI `<diff>` component.
*   Hook up flash messages utilizing `useStatusBarHints().overrideHints` to display full-width warning text when `flashMessage` is active.

## Step 5: Define Diff Keybindings
**File:** `apps/tui/src/screens/diff-keybindings.ts`

Register the `t` keybinding for the view toggle.

*   Add the `t` key to the returned keybindings array.
*   **Handler:** The wrapped toggle handler from `DiffScreen`.
*   **Guard:** Enable only when diff data is loaded and not empty.
*   **Hint:** Add `{ keys: "t", label: "view", order: 20 }` to the `buildDiffStatusBarHints` output.

## Step 6: Update Status Bar & App Shell
**File:** `apps/tui/src/components/StatusBar.tsx`

*   Consume `useDiffViewIndicator`.
*   Render `[unified]` or `[split]` in the center section of the status bar when the mode is non-null.
*   Adjust hint rendering to detect flash messages (hints with empty `keys` string) and render them full-width with a warning color.

**File:** `apps/tui/src/components/AppShell.tsx`

*   Wrap the application content area (and `StatusBar`) with `DiffViewIndicatorProvider` so the status bar can access the context.

## Step 7: End-to-End Testing
**File:** `e2e/tui/diff.test.ts`

Implement the comprehensive E2E test suite utilizing `@microsoft/tui-test`.

*   **Snapshot Tests:** Verify `[unified]`/`[split]` status bar text, column layout changes, flash messages, and scroll sync states.
*   **Keyboard Interaction Tests:** Test unified->split cycle, debounce behavior, modal/overlay blocking, and preservation across file navigation.
*   **Responsive Tests:** Test 120-col boundary, `< 120` col rejection, auto-revert on resize, and 3-second flash message clears.
*   **Edge Case Tests:** Test single-file diffs, binary diffs, concurrent resize/keypress racing, and unmount timer cleanups.
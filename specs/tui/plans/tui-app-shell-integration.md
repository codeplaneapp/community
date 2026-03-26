# Implementation Plan for tui-app-shell-integration

This implementation plan outlines the steps to complete the AppShell integration by wiring up the `GlobalKeybindings` to the `OverlayManager` and extending the end-to-end test suite to validate the entire AppShell component composition and global navigation states.

## Step 1: Wire up Global Keybindings to OverlayManager

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

We need to connect the `?` and `:` global keystrokes to their respective overlay types using the `useOverlay` hook. Since `OverlayManager` handles the toggle semantics (opening an already open overlay closes it), we simply need to call `openOverlay` with the target string.

**Actions:**
1. Import the `useOverlay` hook from `../hooks/useOverlay.js`.
2. Replace the empty `TODO` stubs for `onHelp` and `onCommandPalette`.
3. Add a placeholder comment to `onGoTo` explaining its operation context (handled by `PRIORITY.GOTO` scope).

```tsx
import React, { useCallback } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useOverlay } from "../hooks/useOverlay.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const { openOverlay } = useOverlay();

  const onQuit = useCallback(() => {
    if (nav.canGoBack) {
      nav.pop();
    } else {
      process.exit(0);
    }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canGoBack) {
      nav.pop();
    }
  }, [nav]);

  const onForceQuit = useCallback(() => {
    process.exit(0);
  }, []);

  const onHelp = useCallback(() => {
    openOverlay("help");
  }, [openOverlay]);

  const onCommandPalette = useCallback(() => {
    openOverlay("command-palette");
  }, [openOverlay]);

  const onGoTo = useCallback(() => {
    // Go-to mode activation is handled by a dedicated PRIORITY.GOTO
    // keybinding scope registered by the go-to keybindings system.
    // This global fallback exists for the help overlay to list `g`
    // as a registered binding. The actual go-to dispatch is in
    // the tui-goto-keybindings ticket.
  }, []);

  useGlobalKeybindings({
    onQuit,
    onEscape,
    onForceQuit,
    onHelp,
    onCommandPalette,
    onGoTo,
  });

  return <>{children}</>;
}
```

## Step 2: Implement E2E Integration Test Suites

**File:** `e2e/tui/app-shell.test.ts`

Append the two comprehensive test suites specified in the engineering document to the end of the existing test file. These tests validate the full component hierarchy, deep-link stack logic, and live PTY-based TUI interactions for breakpoints, routing, and modal overlays.

**Actions:**
1. At the bottom of `e2e/tui/app-shell.test.ts`, append the `TUI_APP_SHELL — AppShell layout integration` test suite. This suite will execute static string evaluations against source files and unit evaluate specific non-UI functions (like deep link resolution).
2. Append the `TUI_APP_SHELL — Live TUI integration (PTY-based)` test suite immediately following the previous one. This suite interacts with the `TUITestInstance` directly to spawn instances at dynamic terminal bounds and emulate key events asserting the correct state updates (e.g. keybindings capturing, fallback mechanisms, correct text rendering, and graceful process exits).

*Note on tests:* We are using `@microsoft/tui-test` and ensuring any failing tests that depend on an un-started backend are kept failing, per convention.

## Step 3: Local Validation

**Actions:**
1. Run `tsc --noEmit` from the root to ensure all types bind correctly inside `GlobalKeybindings.tsx`.
2. Run the newly appended test suites via `bun test e2e/tui/app-shell.test.ts`. 
3. Verify snapshots have generated accurately where `expect(tui.snapshot()).toMatchSnapshot()` was called.
4. Resolve any linting issues or imports.
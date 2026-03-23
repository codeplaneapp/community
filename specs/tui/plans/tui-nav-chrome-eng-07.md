# Implementation Plan: tui-nav-chrome-eng-07 (AppShell Component)

## 1. Overview

The codebase currently contains the correct and complete product implementation for the `AppShell` component, `TerminalTooSmallScreen`, and their integration into the provider stack in `index.tsx`. The remaining work for this ticket consists entirely of implementing the test specification in the E2E test suite.

## 2. Product Code Verification

No changes are required in the `apps/tui/src/` directory. The following files are already fully compliant with the specification:
- `apps/tui/src/components/AppShell.tsx`: Correctly implements the three-zone layout and minimum terminal size guard.
- `apps/tui/src/components/TerminalTooSmallScreen.tsx`: Correctly isolates keyboard events (`q`, `Ctrl+C`) and renders the fallback warning without relying on external providers.
- `apps/tui/src/index.tsx`: Correctly positions `<AppShell>` within `<GlobalKeybindings>` and passes `<ScreenRouter />` as children.
- `apps/tui/src/components/index.ts`: Correctly exports `AppShell` and `TerminalTooSmallScreen`.

## 3. Test Implementation Steps

**File:** `e2e/tui/app-shell.test.ts`

Append the three specified test groups to the end of the existing `app-shell.test.ts` file.

### Step 3.1: Add "TUI_APP_SHELL — AppShell three-zone layout" tests

Append a new `describe` block verifying file structure, imports, layout props, terminal guard, and integration position:
- `SHELL-FILE-*`
- `SHELL-IMPORT-*`
- `SHELL-LAYOUT-*`
- `SHELL-GUARD-*`
- `SHELL-INTEGRATION-*`

*Implementation Details:*
- Use `Bun.file().text()` to statically analyze the component source code.
- Ensure the tests check for `flexDirection="column"`, `flexGrow={1}`, and layout component imports.
- Verify `index.tsx` contains the correct wrapper hierarchy.

### Step 3.2: Add "TUI_APP_SHELL — AppShell E2E rendering" tests

Append a new `describe` block utilizing the `launchTUI` helper to test live terminal rendering behavior across various sizes:
- Standard sizes (`120x40`) - `SHELL-E2E-001`, `SHELL-E2E-002`, `SHELL-E2E-003`
- Minimum sizes (`80x24`) - `SHELL-E2E-004`
- Large sizes (`200x60`) - `SHELL-E2E-005`
- Too-small guard (`79x24`, `80x23`, `60x15`) - `SHELL-E2E-006`, `SHELL-E2E-007`, `SHELL-E2E-008`
- Resize transitions - `SHELL-E2E-009`, `SHELL-E2E-010`
- Snapshot matching - `SHELL-E2E-011` to `SHELL-E2E-014`
- Keyboard interactions (`Ctrl+C` exit) - `SHELL-E2E-015`

*Implementation Details:*
- Manage `tui` instance lifecycle properly with an `afterEach` hook to ensure clean teardown using `tui.terminate()`.
- Use `tui.waitForText()` and `tui.getLine()` for specific content assertions.
- Use `tui.snapshot()` for snapshot matching (`toMatchSnapshot()`).

### Step 3.3: Add "TUI_APP_SHELL — AppShell compilation" tests

Append a new `describe` block to verify the components compile cleanly under TypeScript:
- Run `bun run check` (which typically invokes `tsc --noEmit`).
- Verify `exitCode === 0` for `SHELL-TSC-001` and `SHELL-TSC-002`.

*Implementation Details:*
- Set a higher timeout (e.g., `30_000` ms) for these tests, as compilation can take time.
- Log `stderr` and `stdout` if the compilation fails to aid in debugging.

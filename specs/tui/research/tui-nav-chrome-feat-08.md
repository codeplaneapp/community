# Research Findings for TUI_GOTO_KEYBINDINGS

## 1. Existing State in `apps/tui/src/navigation/goToBindings.ts`
- `goToBindings` defines 11 top-level bindings (`d`, `r`, `i`, `l`, `w`, `n`, `s`, `o`, `f`, `k`, `a`).
- Currently, it lacks `statusBarLabel` and `order` properties which are required by the spec to show in the status bar hints.
- `executeGoTo` is partially implemented but does not correctly replace the stack; it does `nav.reset(ScreenName.Dashboard)` but then it handles `repoContext` and screen pushes via conditionals that do not match the spec's `[Dashboard, Repo, Destination]` requirement exactly, specifically, it doesn't correctly guard against double-pushing non-repo screens or handling dashboard directly. The spec says to replace the `executeGoTo` function to strictly control the `[Dashboard]`, `[Dashboard, Destination]`, and `[Dashboard, Repo, Destination]` stacks.

## 2. Existing State in `apps/tui/src/components/GlobalKeybindings.tsx`
- The `GlobalKeybindings` component uses `useGlobalKeybindings` and binds standard global keys.
- `onGoTo` is currently defined as `useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);`.
- Need to import and use the new `useGoToMode` and `useGoToKeybindings` hooks here, suppress `g` key if terminal is too small (`!breakpoint`) or an overlay is active (`ctx?.hasActiveModal()`).

## 3. Existing State in `apps/tui/src/components/StatusBar.tsx`
- The `StatusBar` component already uses `useStatusBarHints()` which provides `hints`.
- It currently shows `statusBarError` from `useLoading()`.
- Requires logic to integrate `useGoToModeContext()` to show `goToMode.error` (e.g. "No repository in context") over the regular error and `displayedHints`.
- Needs the truncation logic updated specifically to display the 11 go-to hints at wide width, truncated to fewer items (`…`) at narrow widths.

## 4. Existing State in `apps/tui/src/components/OverlayLayer.tsx`
- `OverlayLayer` renders placeholders for help, command-palette, and confirm dialogs.
- The help overlay currently just renders `[Help overlay content — pending TUI_HELP_OVERLAY implementation]`.
- Requires adding the "Go To" group loop listing all `goToBindings` elements (their key, description, and repo-requirement indicator).

## 5. Existing State in `apps/tui/src/providers/KeybindingProvider.tsx` & Types
- `PRIORITY` in `keybinding-types.ts` is fully implemented and defines `GOTO: 3`.
- `KeybindingProvider.tsx` registers and dispatches scopes correctly through a `useKeyboard` call looping through active scopes.
- We need to add an `unhandledKeyCallbackRef` and `setUnhandledKeyCallback` to `KeybindingContextType` and `KeybindingProvider`. It should be invoked at the bottom of the `useKeyboard` dispatch loop if no binding matched in any scope. This is essential for silencing unrecognized keys during go-to mode.

## 6. Layout & Status Bar Hints (`useLayout.ts` and `useStatusBarHints.ts`)
- `useLayout.ts` provides `width`, `height`, and `breakpoint` (which is `"minimum" | "standard" | "large" | null`). `null` means terminal too small.
- `useStatusBarHints.ts` exports `StatusBarHintsContextType` and `StatusBarHint`. The context type includes `overrideHints(hints)` which returns a cleanup function, making it ideal for temporarily swapping hints during go-to mode activation.

## 7. Entry Point (`apps/tui/src/index.tsx`)
- Currently wraps `AppShell` with `KeybindingProvider`, `OverlayManager`, `NavigationProvider`, `LoadingProvider`, `GlobalKeybindings`, etc.
- The new `GoToModeProvider` needs to be inserted right under `NavigationProvider` and above `LoadingProvider` to give access to go-to context for both `GlobalKeybindings` and `StatusBar`.

## 8. E2E Tests (`e2e/tui/app-shell.test.ts`)
- The `e2e/tui/app-shell.test.ts` is fully scaffolded and exports testing primitives using `@microsoft/tui-test` inside `helpers.ts` (`launchTUI()`, `TERMINAL_SIZES`, etc.).
- Test assertions like `tui.getLine()`, `tui.snapshot()`, `tui.sendKeys()`, and `tui.waitForText()` are available to simulate all 52 specified go-to tests.
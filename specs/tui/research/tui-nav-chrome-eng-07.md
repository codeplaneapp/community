# Research Findings: tui-nav-chrome-eng-07 (AppShell Component)

## 1. Current State of `AppShell.tsx`
**File:** `apps/tui/src/components/AppShell.tsx`

The current implementation is perfectly aligned with the specification. It correctly:
- Imports `useLayout`, `HeaderBar`, `StatusBar`, `OverlayLayer`, and `TerminalTooSmallScreen`.
- Checks `layout.breakpoint` and returns `TerminalTooSmallScreen` if null (terminal too small).
- Returns a three-zone layout using OpenTUI's `<box>` with `flexDirection="column"`, `width="100%"`, and `height="100%"`.
- Renders `<HeaderBar />`, a content box (`flexGrow={1}`) wrapping `{children}`, `<StatusBar />`, and `<OverlayLayer />`.

No changes are needed to `AppShell.tsx` itself.

## 2. Current State of `TerminalTooSmallScreen.tsx`
**File:** `apps/tui/src/components/TerminalTooSmallScreen.tsx`

The implementation successfully conforms to the spec:
- Imports `useKeyboard` from `@opentui/react` and `detectColorCapability` / `createTheme` to generate a `fallbackTheme`.
- Sets up an isolated `useKeyboard` hook that captures `q` and `Ctrl+C` directly, bypassing global keybindings, and calls `process.exit(0)`.
- Renders the fallback warning message centered in the `<box>`.

No changes are needed to `TerminalTooSmallScreen.tsx`.

## 3. Position in Provider Stack (`index.tsx`)
**File:** `apps/tui/src/index.tsx`

- The provider tree matches the exact specification.
- `<AppShell>` is wrapped by `<GlobalKeybindings>` (which ensures global keybindings are always active regardless of state unless trapped/bubbled) and `<LoadingProvider>`/`<NavigationProvider>`.
- It acts as the direct parent wrapper for `<ScreenRouter />`, passing it down as the `children` prop to `AppShell`.

## 4. Current Test Suite (`app-shell.test.ts`)
**File:** `e2e/tui/app-shell.test.ts`

The current test file contains a comprehensive suite covering several foundational infrastructure categories:
- `Package scaffold`
- `TypeScript compilation`
- `Dependency resolution`
- `E2E test infrastructure`
- `Color capability detection`
- `Theme token definitions`
- `ThemeProvider and useTheme hook`
- `useSpinner hook scaffold`
- `Breakpoint detection`
- `useLayout computed values`
- `Layout module resolution`
- `Responsive layout E2E`
- `Color Detection`
- `Theme Token Application`
- `NO_COLOR and TERM=dumb`
- `Keyboard Interaction`

**Missing Test Groups:**
The specific tests outlined in the engineering specification for `AppShell` itself are not yet present in the test file. The required test blocks are:
1. `TUI_APP_SHELL — AppShell three-zone layout` (testing file structure, layout configuration, terminal-too-small guard, integration).
2. `TUI_APP_SHELL — AppShell E2E rendering` (using `launchTUI` to test three-zone standard rendering, minimum sizes, too-small edge cases, and snapshot verification).
3. `TUI_APP_SHELL — AppShell compilation` (verifying `AppShell.tsx` and `TerminalTooSmallScreen.tsx` clean compilation).

## 5. Exports and Layout Hooks
- **Barrel Export:** `AppShell` and `TerminalTooSmallScreen` are correctly exported from `apps/tui/src/components/index.ts`.
- **Layout Hook:** `apps/tui/src/hooks/useLayout.ts` defines `LayoutContext` cleanly and returns correct `contentHeight` and `breakpoint` calculations derived from `useTerminalDimensions()`.

## Conclusion
The existing codebase has the final, correct implementations for the product code. The entire remaining work for this task is to append the three new describe blocks mapping to the `SHELL-` prefixed test cases to `e2e/tui/app-shell.test.ts`.
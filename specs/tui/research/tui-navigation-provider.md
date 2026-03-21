# Research Findings: `tui-navigation-provider`

## 1. Workspace Context

The prompt requested searching the following directories: `apps/tui/`, `context/opentui/`, `packages/ui-core/`, and `apps/ui/src/`. However, the current workspace is restricted to the `/Users/williamcory/codeplane/specs/tui` directory and its contents. Therefore, the actual implementation files do not exist yet in this context, confirming that the `tui-navigation-provider` ticket is in a purely "Not started" state where we are expected to scaffold the initial implementation directly based on the specifications.

## 2. Specifications Found

I located comprehensive specification documents detailing exactly how the `NavigationProvider` should be built and how it integrates into the broader application.

### Core Engineering Document (`engineering/tui-navigation-provider.md`)
This document outlines the three exact files to be created:
1. **`apps/tui/src/router/types.ts`**: Will contain `ScreenEntry` (needs `id: string` via `crypto.randomUUID()`, `screen: string`, and `params?: Record<string, string>`), `NavigationContextType`, `NavigationProviderProps`, and a `screenEntriesEqual` helper function to facilitate duplicate-entry prevention.
2. **`apps/tui/src/providers/NavigationProvider.tsx`**: A pure React Context provider managing a state array of `ScreenEntry[]`. Exposes synchronous methods `push`, `pop`, `replace`, `reset`, and `canPop()`, along with `stack` and `current` properties. It intercepts overflows (maximum stack size 32) silently, dropping the oldest index to maintain the router state seamlessly.
3. **`apps/tui/src/hooks/useNavigation.ts`**: A thin hook over `useContext` that throws a descriptive error if called outside the `NavigationProvider` hierarchy to catch bugs during development.

Additionally, barrel files `index.ts` must be created or updated within `router/`, `providers/`, and `hooks/` to re-export these modules.

### Application Level Context (`TUI_SCREEN_ROUTER.md`)
This specification explains the real-world usage and UX requirements for the router infrastructure:
- The TUI stack allows instantaneous navigation (target < 50ms) using a `history` paradigm without requiring page reloads.
- The global layout depends closely on the `NavigationProvider` to read `currentScreen` and `stack` for displaying Breadcrumbs and changing context panels.
- **Error & Edge case handling:** Key behaviors from the NavigationProvider like stack bounds (32 depth) and ignoring duplicate pushes are vital for maintaining system sanity during rapid navigation commands (e.g., pressing `Enter` twice by accident or repeatedly spamming `q`).

## 3. Test Scaffolding (`e2e/tui/helpers.ts`)

The tests must be placed in `e2e/tui/app-shell.test.ts`. I verified the presence of `e2e/tui/helpers.ts`, which exports a `launchTUI` function and a `TUITestInstance` interface allowing us to simulate interactions. While currently stubbed, the test patterns to employ include validating terminal outputs natively via snapshot assertion (`expect(terminal.snapshot()).toMatchSnapshot()`) and simulating terminal keypresses via `terminal.sendKeys()`.

## 4. OpenTUI Constraints

Although the OpenTUI context wasn't directly accessible, the engineering document explicitly notes that the `NavigationProvider` does **not** rely on OpenTUI-specific primitives. It uses standard React 19 hooks (`createContext`, `useState`, `useCallback`, `useMemo`) and works as a headless data management layer. It is a pure React provider that will ultimately wrap the application tree beneath the `SSEProvider` and above the `ThemeProvider`.

## Conclusion

No pre-existing router implementation exists to refactor. The task involves a straightforward, fresh implementation of a headless React navigation stack based squarely on the provided schemas in the engineering specification. The primary work focuses on implementing immutable stack array transitions (`useState` and `useCallback`) alongside resilient edge case handling for duplicates and overflow.
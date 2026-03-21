# TUI Auth Token Loading — Research Findings

Based on an analysis of the repository's existing codebase, here are the key findings to support the implementation of `TUI_AUTH_TOKEN_LOADING`.

## 1. Auth Provider and State Machine (`apps/tui/src/providers/AuthProvider.tsx`)
- **Current State**: The `AuthProvider` currently implements a basic version of the state machine. It defines `AuthState` with values `"loading" | "authenticated" | "expired" | "offline" | "unauthenticated"`.
- **Deficiencies vs. Spec**: 
  - It only attempts to resolve `process.env.CODEPLANE_TOKEN` and lacks integration with the CLI's `resolveAuthToken` and `resolveAuthTarget`.
  - It validates against `/api/v1/user` instead of `/api/user` as defined in the spec.
  - It does not expose `user`, `host`, `apiUrl`, or `retry` in its `AuthContextValue`.
  - It does not render error or loading screens internally to gate the children.

## 2. Auth Hooks (`apps/tui/src/hooks/useAuth.ts`)
- **Current State**: The `useAuth` hook is correctly stubbed out and throws an error if used outside `AuthProvider`. It will simply need its return type updated to the new `AuthContextValue`.

## 3. Entry Point Integration (`apps/tui/src/index.tsx`)
- **Current State**: The current provider stack order is:
  ```tsx
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
        <SSEProvider>
          <NavigationProvider>
  ```
- **Deficiencies vs. Spec**: The `APIClientProvider` is missing from the tree and needs to be inserted immediately inside `AuthProvider`. Additionally, `ThemeProvider` is correctly placed *above* `AuthProvider`, fulfilling the spec requirement that the Auth loading/error screens have access to the theme.

## 4. Status Bar (`apps/tui/src/components/StatusBar.tsx`)
- **Current State**: Uses `useLayout` and `useTheme`. Displays keybinding hints on the left, `syncStatus` in the center, and a help hint on the right.
- **Deficiencies vs. Spec**: Needs the implementation of the 3-second `✓ username via source` confirmation and the persistent `⚠ offline — token not verified` warning replacing the center text.

## 5. Text Utilities (`apps/tui/src/util/text.ts`)
- **Current State**: The repository uses `apps/tui/src/util/text.ts` (instead of `lib/text.ts` as the spec suggested). It currently exports `truncateRight`, `truncateBreadcrumb`, and `fitWidth`.
- **Actionable Insight**: We should place the new `truncateText` and `wrapText` functions in `util/text.ts` to match existing conventions.

## 6. Process Signals (`apps/tui/src/lib/signals.ts`)
- **Current State**: Exports `registerSignalHandlers` which gracefully stops the `CliRenderer` and calls `process.exit(0)` on `SIGINT`, `SIGTERM`, and `SIGHUP`.
- **Deficiencies vs. Spec**: Does not export `setGlobalAbort` or manage an `AbortController`. This will need to be added to cleanly abort the fetch request during the auth loading state when the user presses `Ctrl+C`.

## 7. E2E Test Infrastructure (`e2e/tui/helpers.ts` and `e2e/tui/app-shell.test.ts`)
- **Infrastructure Available**: `e2e/tui/helpers.ts` already fully implements the test fixtures demanded by the spec, including `createTestCredentialStore` and `createMockAPIEnv`.
- **Test Placement**: `e2e/tui/app-shell.test.ts` contains all application shell and responsive layout tests. The new auth tests should naturally be appended as new `describe()` blocks within this file.

## 8. Missing Files to Create
- `apps/tui/src/components/AuthLoadingScreen.tsx`
- `apps/tui/src/components/AuthErrorScreen.tsx`

## Summary for Implementation
The codebase is well-prepared for this feature. The provider stack is almost exactly as requested, and the test infrastructure already has the requisite mock environments (`createMockAPIEnv` and `createTestCredentialStore`). The primary effort will involve rewriting `AuthProvider.tsx` to handle the full `AuthStatus` lifecycle, implementing the two gating screens, and appending the new E2E tests to `app-shell.test.ts`.
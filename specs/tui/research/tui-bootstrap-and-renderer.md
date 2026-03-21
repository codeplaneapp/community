# TUI_BOOTSTRAP_AND_RENDERER Research Document

## 1. Entry Point (`apps/tui/src/index.tsx`)
- **Current State**: The entry point is currently a stub that only verifies core dependencies at the type level (`CliRenderer`, `Root`). It does not actually perform the bootstrap sequence yet.
- **Bootstrap Sequence Comments**: The file contains a clear roadmap in its comments outlining the sequence: terminal setup -> auth token resolution -> renderer init -> provider stack mount -> token validation -> SSE connection -> initial screen render -> first meaningful paint.

## 2. Provider Stack (`apps/tui/src/providers/`)
- **Existing Providers**:
  - `ThemeProvider.tsx` and `ThemeContext`: Available and fully tested.
  - `NavigationProvider.tsx` and `NavigationContext`: Available and manages the push/pop screen stack.
  - `SSEProvider.tsx`: Stubbed/available provider for SSE events.
- **Missing Providers**: `AuthProvider`, `APIClientProvider` (needs to wrap the one from `@codeplane/ui-core`), `ErrorBoundary`, and `KeybindingProvider` / `GlobalKeybindings`.

## 3. UI Core Packages (`packages/ui-core/src/client/`)
- **`context.ts`**: Exports `APIClientProvider` and `useAPIClient`. The TUI should import `APIClientProvider` from here rather than re-implementing it. It requires an `APIClient` instance to be passed as the `value`.
- **`createAPIClient.ts`**: Expected to export the `createAPIClient` function which we will use inside the `APIClientProvider` wrapper in the TUI.

## 4. Layout & Breakpoints
- **`apps/tui/src/hooks/useLayout.ts`**: Exposes a `useLayout` hook returning `LayoutContext`. It includes `width`, `height`, `breakpoint`, `contentHeight` (height - 2), `sidebarVisible`, `sidebarWidth`, `modalWidth`, and `modalHeight`. Fully tested and operational.
- **`apps/tui/src/types/breakpoint.ts`**: Defines `getBreakpoint(cols, rows)`. Returns `'unsupported'` (< 80x24), `'minimum'`, `'standard'`, or `'large'`.

## 5. Navigation & Deep Links (`apps/tui/src/navigation/deepLinks.ts`)
- Contains `parseCliArgs(argv)` which extracts `--screen`, `--repo`, `--session-id`, `--org` from arguments.
- Contains `buildInitialStack(args)` which maps these arguments into an initial stack of screens (e.g., `ScreenName.Dashboard`, `ScreenName.RepoOverview`, etc.) suitable for the `NavigationProvider`.

## 6. End-to-End Tests (`e2e/tui/app-shell.test.ts`)
- This test file is heavily populated and covers:
  - **Navigation Provider**: Snapshots, key interactions (Enter, q, g-prefix), edge cases.
  - **Screen Registry**: Checks if the Go-To mode resolves correctly and if missing screens fallback to Dashboard.
  - **Color Capability Detection**: Extensively tests NO_COLOR, TERM=dumb, COLORTERM, etc.
  - **Responsive Layout**: Validates the different breakpoint rendering and edge case sizes.
  - **Theme Tokens**: Verifies immutability, properties, and values for the different color tiers.
- Notably, the tests already mock or expect a fully functioning AppShell. The prompt mentions tests might fail due to missing backends but they exist as strict requirements.

## Summary for Implementation
The foundation is solid. The primary goal for implementation will be to flesh out the main application shell, implement the error boundary and auth provider, inject the `@codeplane/ui-core` API client, and hook everything up inside `index.tsx` to handle the actual lifecycle/event handling.
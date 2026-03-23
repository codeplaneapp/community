# Codebase Research for TUI Settings Screen

## 1. Routing & Navigation Structure
- **Screen Registry**: `apps/tui/src/router/registry.ts`
  The `Settings` screen is already registered as a top-level screen mapping to `PlaceholderScreen`.
- **Deep Links**: `apps/tui/src/navigation/deepLinks.ts`
  The `--screen settings` deep link is also pre-configured, pointing to `ScreenName.Settings`.
- **Navigation Provider**: The `ScreenEntry` and navigation context definitions exist in `apps/tui/src/router/types.ts` and will provide the `push`, `pop`, and `replace` API.
  
## 2. Layout & Responsiveness
- **Terminal Dimensions & Breakpoints**: 
  We should use the `useBreakpoint()` hook from `apps/tui/src/hooks/useBreakpoint.ts`. It reads from OpenTUI's `useTerminalDimensions` and returns breakpoints.

## 3. UI Primitives & Keybindings
- Primitives like `<box>` and `<text>` are available directly from `@opentui/react` (or intrinsic elements depending on the renderer setup).
- Keybinding providers and normalize helpers exist in `apps/tui/src/providers/KeybindingProvider.tsx` and `apps/tui/src/providers/normalize-key.ts`.

## 4. UI Core & Data Hooks
The engineering spec requires `@codeplane/ui-core` hooks like `useUser()`, `useUserEmails()`, `useUserSSHKeys()`, `useUserTokens()`, `useNotificationPreferences()`, and `useUserConnectedAccounts()`. Note that these packages are standard workspace libraries expected to be imported as `@codeplane/ui-core`. We will rely on their defined contracts to render the dashboard summary cards.

## 5. Testing Context
- All e2e tests for TUI reside in `e2e/tui/`.
- The target test file is `e2e/tui/settings.test.ts`, which currently does not exist. It will be implemented using `@microsoft/tui-test` to match snapshot assertions, keyboard interactions, and mocked API responses.
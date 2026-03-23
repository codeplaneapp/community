# TUI Settings SSH Keys Context Research

This document provides the context required to implement the `tui-settings-ssh-keys` ticket based on current codebase state.

## 1. Data Hooks & Types (`@codeplane/ui-core`)

- **Target Location**: `specs/tui/packages/ui-core/src/hooks/useSSHKeys.ts` (Note: the `ui-core` package currently lives inside the `specs/tui/` directory in the monorepo instead of the root `packages/` directory).
- **Backend Readiness**: The SDK already implements SSH Key methods: `listSSHKeys`, `createSSHKey`, and `deleteSSHKey` in `packages/sdk/src/services/user.ts` mapping to database queries in `packages/sdk/src/db/ssh_keys_sql.ts`.
- **Implementation Needs**: You will need to create standard data fetching hooks `useSSHKeys()`, `useCreateSSHKey()`, and `useDeleteSSHKey()`. Since they deal with fetching, you should use `useEffect/useState` or the internal `useMutation` and `usePaginatedQuery` tools available in `specs/tui/packages/ui-core/src/hooks/internal/`.

## 2. Settings Screen & Routing

- **Target Location**: `apps/tui/src/screens/settings/SettingsScreen.tsx`
- **Current Routing State**: `apps/tui/src/router/registry.ts` currently maps `ScreenName.Settings` to a `PlaceholderScreen`. You will need to:
  1. Create the `SettingsScreen` and `SSHKeysTab`.
  2. Update `apps/tui/src/router/registry.ts` to replace `PlaceholderScreen` with your new `SettingsScreen`.

## 3. UI Components & Layout

- **`ScrollableList` Component**: The engineering spec mentions using `<ScrollableList>`. Codebase research (`specs/tui/research/tui-managed-list-with-actions.md`) reveals that a standalone `ScrollableList` might not exist yet as a shared primitive in `apps/tui/src/components/`. If it is unavailable, you should construct the list using standard OpenTUI primitives: `<scrollbox>` wrapping a `<box flexDirection="column">` and implementing `j/k` keyboard navigation manually via `useScreenKeybindings` (mapping focused index over the data array).
- **Add SSH Key Modal (`ModalSystem` / `OverlayLayer`)**: Modals in the Codeplane TUI are managed by the `OverlayLayer` (`apps/tui/src/components/OverlayLayer.tsx`). The standard approach for ad-hoc modals is to either register them in the `OverlayManager` or render an absolute positioned `<box position="absolute" top="center" left="center" zIndex={100}>` to trap focus, using responsive sizing from `useLayout()`. OpenTUI `<input>` and `<textarea>` components should be used for the modal form.
- **Responsive Values**: Use the `useBreakpoint` or `useResponsiveValue` hooks (`apps/tui/src/hooks/useBreakpoint.ts`) to adapt the column visibility for the `minimum` (80x24), `standard` (120x40), and `large` (200x60+) breakpoints specified in the requirements.

## 4. E2E Testing

- **Target Location**: `e2e/tui/settings.test.ts`
- **Current State**: The `settings.test.ts` file does not exist yet. You will need to create it from scratch using `@microsoft/tui-test`. Refer to `e2e/tui/repository.test.ts` or `e2e/tui/app-shell.test.ts` for examples of terminal snapshot matching and keyboard interaction simulation.
- **Test Patterns**: All backend features must be mocked or setup using the CLI test utilities prior to running the UI assertions. Tests will need to validate terminal output using `.snapshot()` and `.waitForText()`.
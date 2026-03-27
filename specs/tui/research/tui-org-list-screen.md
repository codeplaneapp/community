# TUI Organization List Screen Research

## 1. Routing and Navigation
The screen registry and global navigation are already scaffolded for `Organizations`, but they currently point to a placeholder. You will need to update these existing files:
- **`apps/tui/src/router/registry.ts`**: The `ScreenName.Organizations` route is defined (Lines 35-40). You will need to import `OrgListScreen` and replace the existing `PlaceholderScreen` component reference.
- **`apps/tui/src/navigation/goToBindings.ts`**: The global go-to keybinding (`g o`) is already mapped to `ScreenName.Organizations` (Line 14). No changes are required here unless you intend to modify the core binding mechanism.
- **`apps/tui/src/router/types.ts`**: `ScreenName.Organizations` is already defined in the enum.

## 2. Command Palette
- **`apps/tui/src/commands/commandRegistry.ts`**: This file and directory do not currently exist in the `apps/tui/src/` path. The implementation plan suggests adding a command palette entry (`:orgs`). You will likely need to scaffold the `commands` directory and registry logic to fulfill this requirement or defer if the command palette epic is not yet started.

## 3. Data Hooks (`@codeplane/ui-core`)
- The specification relies on a `useOrgs` hook from `@codeplane/ui-core`.
- **Dependency Missing**: `apps/tui/package.json` currently depends on `@codeplane/sdk: "workspace:*"` but does not list `@codeplane/ui-core`. You must add `"@codeplane/ui-core": "workspace:*"` to `apps/tui/package.json`.
- **Hook Missing**: A codebase search confirms `useOrgs` does not exist. As indicated by the engineering spec (or related tickets), if `@codeplane/ui-core` doesn't export it yet, you'll need to create a TUI-side adapter hook at `apps/tui/src/hooks/useOrgData.ts` to mock or implement `{ items, totalCount, isLoading, error, loadMore, hasMore, retry }`.

## 4. Components, State, and Layout Hooks
- **Target Screen Component**: Create `apps/tui/src/screens/organizations/OrgListScreen.tsx`.
- **Relevant Available Hooks**:
  - `useTheme()` (from `apps/tui/src/hooks/useTheme.ts`): Provides referentially stable semantic colors (`theme.primary`, `theme.muted`, `theme.surface`, `theme.success`, `theme.warning`, `theme.error`).
  - `useLayout()` (from `apps/tui/src/hooks/useLayout.ts`): Provides the current layout `breakpoint` (`null` for unsupported, `minimum`, `standard`, `large`) which determines responsive visibility of list columns.
  - `useNavigation()` (from `apps/tui/src/providers/NavigationProvider.tsx`): Provides stack management (`push`, `pop`, `replace`, etc.).
  - `useScreenKeybindings()` (from `apps/tui/src/hooks/useScreenKeybindings.ts`): Use this hook to register local shortcuts like `j`, `k`, `Enter`, `/`, `Space`, `o`, `v`, `c` and `Esc`.
- **OpenTUI UI Primitives**: `<box>`, `<text>`, `<scrollbox>`, `<input>` should be directly imported and utilized natively from `@opentui/react`.

## 5. Testing
- All new integration tests must reside in `e2e/tui/organizations.test.ts`.
- The testing utility framework, `@microsoft/tui-test`, is available in the dev dependencies of `apps/tui/package.json`.
- You will need to implement snapshot assertions of states (initial, error, empty, loading), keyboard input assertions, responsive resizing behaviors using the test harness's resize simulations (`terminal.resize()`), and sorting/filtering verifications.
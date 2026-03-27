# Research Context: TUI Organization Team Detail (`TUI_ORG_TEAM_DETAIL`)

## 1. Routing & Screen Shell
- **Screen Registry Location**: The spec mentions `apps/tui/src/navigation/screenRegistry.ts`, but the actual application router lives at `apps/tui/src/router/registry.ts` and `apps/tui/src/router/types.ts`.
  - `ScreenName.OrgTeamDetail` is already defined in the `ScreenName` enum and registered in `registry.ts` pointing to `PlaceholderScreen`.
  - The registry entry specifies `requiresOrg: true` and defines the dynamic breadcrumb label: `breadcrumbLabel: (p) => p.team || "Team"`.
- **Deep Links**: `apps/tui/src/navigation/deepLinks.ts` currently handles CLI command resolving but lacks a specific string-to-enum mapping for `"org-team-detail"`. You will need to add an entry mapping the CLI string argument to `ScreenName.OrgTeamDetail`.

## 2. Layout & UI Components
- **AppShell Foundation**: Located at `apps/tui/src/components/AppShell.tsx`. This sh...[truncated]...
 **Screen Bindings**: Import `useScreenKeybindings` (`apps/tui/src/hooks/useScreenKeybindings.ts`) to register component-local shortcut handlers (`Tab`, `Shift+Tab`, `1`, `2` to swap tabs).
- **Owner-Specific Actions**: Since the spec requires dynamic owner-keys (`e`, `D`, `a`, `x`), you can conditionally supply these bindings to `useScreenKeybindings` based on the viewer's permission role once `useOrgRole` is mocked/resolvable.
- **List Execution Flow**: Use the `push` function provided by `useNavigation` (`apps/tui/src/providers/NavigationProvider.tsx`) for dispatching users out of lists (`Enter` pushing `user-profile` or `repo-overview`).

## 5. End-to-End Tests
- **Test Environment**: The target file `e2e/tui/organizations.test.ts` does not currently exist. You will need to create it and utilize `@microsoft/tui-test` API bindings to test terminal snapshots, trigger keypress interactions across your tabs, and emulate resize events to assert responsive structural changes.
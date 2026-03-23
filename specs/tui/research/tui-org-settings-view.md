# Codebase Research: TUI Organization Settings View

## 1. Routing & Navigation
*   **Screen Enumeration:** The `ScreenName.OrgSettings` (as well as `OrgOverview` and `OrgTeamDetail`) is already defined in `apps/tui/src/router/types.ts` (line 42).
*   **Registry Mapping:** In `apps/tui/src/router/registry.ts`, `ScreenName.OrgSettings` is currently defined and mapped to `PlaceholderScreen` (lines 191-196) and requires the org parameter (`requiresOrg: true`). The route mapping will need to be updated to point to the new `OrgSettingsScreen` once it is created.

## 2. Screens & Entry Points
*   **Directory Structure:** The directory `apps/tui/src/screens/organizations/` does not currently exist in the codebase.
*   **Entry Point:** `OrgOverviewScreen.tsx` is not yet implemented (it is also mapped to `PlaceholderScreen` in the router). The plan requires updating `OrgOverviewScreen` to conditionally register the `s` keybinding. This implies either `OrgOverviewScreen` must be implemented in this PR or will be delivered in an adjacent PR prior to this one.
*   **Keybinding Hook:** The `useScreenKeybindings` hook is fully implemented and located at `apps/tui/src/hooks/useScreenKeybindings.ts`. It provides the API for declaring key handlers such as `Tab`, `Shift+Tab`, `j`, `k`, `Ctrl+S`, `Enter`, `a`, `d`, `x`, `c`, and `e` with standard priority rules.

## 3. Data Hooks & API Client
*   **`@codeplane/ui-core` Hooks:** The organization-specific data hooks requested in the specification (`useOrg`, `useUpdateOrg`, `useOrgMembers`, `useAddOrgMember`, `useOrgTeams`, `useCreateTeam`, `useDeleteTeam`, `useDeleteOrg`) do not exist within the `packages/ui-core/src/hooks/` directory. They will need to be scaffolded along with the corresponding API type definitions as part of the data layer requirements.

## 4. UI Layout & Modals
*   **Layout Primitive:** The `useLayout` hook exists in `apps/tui/src/hooks/useLayout.ts` and returns `{ width, height, breakpoint }` which will be used to detect terminal boundaries (e.g. `< 120` columns) for responsive UI adaptations like stacking form labels and hiding optional list columns.
*   **Modal Components:** A shared `<OverlayLayer>` component exists at `apps/tui/src/components/OverlayLayer.tsx`. This should be utilized as the parent container for the new modals requested in Phase 7 (`AddMemberModal`, `RemoveMemberModal`, `CreateTeamModal`, `EditTeamModal`, `DeleteTeamConfirmModal`, `DeleteOrgModal`) to handle correct z-indexing and positioning inside the `apps/tui/src/components/organizations/modals/` directory.

## 5. End-to-End Tests
*   **E2E Location:** The `e2e/tui/organizations.test.ts` file does not currently exist and will need to be created.
*   **Framework:** Testing will rely on the existing `@microsoft/tui-test` framework to implement the snapshot and keyboard interaction matrix defined in Section 3 of the specification. Mocking mechanisms will need to handle the simulated 409 and 429 status codes outlined in the integration test cases.
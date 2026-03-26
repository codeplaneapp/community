# Implementation Plan: TUI Organization Settings View (tui-org-settings-view)

This document outlines the step-by-step implementation for the Organization Settings View in the Codeplane TUI. All paths have been adjusted based on the current repository structure.

## Phase 1: Data Layer Scaffolding (`@codeplane/ui-core`)

Before building the TUI screens, the necessary API hooks must be scaffolded in the shared UI core package.

1.  **Create Organization Hooks:**
    *   Create `packages/ui-core/src/hooks/useOrg.ts` exporting `useOrg` and `useUpdateOrg`.
    *   Create `packages/ui-core/src/hooks/useOrgMembers.ts` exporting `useOrgMembers`, `useAddOrgMember`, and `useRemoveOrgMember`.
    *   Create `packages/ui-core/src/hooks/useOrgTeams.ts` exporting `useOrgTeams`, `useCreateTeam`, `useUpdateTeam`, and `useDeleteTeam`.
    *   Create `packages/ui-core/src/hooks/useDeleteOrg.ts` exporting `useDeleteOrg`.
    *   *Note: Ensure these hooks integrate correctly with the existing API client and type definitions.*

## Phase 2: Route Registration and Access Control

1.  **Screen Registration Update:**
    *   File: `apps/tui/src/router/registry.ts`
    *   Update the `ScreenName.OrgSettings` entry. Replace `PlaceholderScreen` with a lazy load or import of `OrgSettingsScreen`.
    *   Verify that `requiresOrg: true` is set.
2.  **Entry Point (`OrgOverviewScreen.tsx`):**
    *   File: `apps/tui/src/screens/organizations/OrgOverviewScreen.tsx` (Create this file if it does not exist, or update the existing stub).
    *   Integrate `useScreenKeybindings` to register the `s` keybinding.
    *   Fetch the current user's role for the active organization.
    *   Conditionally activate the `s` keybinding only if `currentUser.role === 'owner'`.
    *   Action on `s`: `push(ScreenName.OrgSettings, { org: orgName })`.

## Phase 3: Screen Scaffolding & Section Navigation

1.  **Create `OrgSettingsScreen.tsx`:**
    *   File: `apps/tui/src/screens/organizations/OrgSettingsScreen.tsx`
    *   Import `useLayout` from `apps/tui/src/hooks/useLayout.ts` to retrieve the current terminal `breakpoint`.
    *   Extract the `orgName` parameter from the navigation context.
    *   Call `useOrg(orgName)`. If the user's role is not `'owner'`, render an OpenTUI `<text color="error">` stating "Access denied. Organization owner role required."
2.  **Section State Management:**
    *   Implement `const [activeSection, setActiveSection] = useState<"general" | "members" | "teams" | "danger">("general");`
    *   Use `useScreenKeybindings` to bind `Tab` to cycle forward and `Shift+Tab` to cycle backward through the sections.

## Phase 4: General Settings Section

1.  **Form Component:**
    *   File: `apps/tui/src/screens/organizations/sections/GeneralSettingsSection.tsx`
    *   Extract local state (`name`, `description`, `visibility`, `website`, `location`) from the `useOrg` data.
    *   Calculate `isDirty` by comparing local state to the fetched data.
2.  **UI Implementation:**
    *   Render fields using OpenTUI `<input>` and `<select>` primitives.
    *   Implement a live character counter for the name field.
    *   Use the `breakpoint` from `useLayout()` to toggle between inline labels (`breakpoint >= 120`) and stacked labels (`breakpoint < 120`).
3.  **Mutations:**
    *   Bind `Ctrl+S` (using `useScreenKeybindings` scoped to this section) to trigger `handleSave`.
    *   Call `useUpdateOrg`. On success, reset `isDirty` and trigger a toast notification "✓ Organization updated".
    *   If `visibility` becomes more restrictive, open a `VisibilityConfirmModal` before saving.

## Phase 5: Members Section

1.  **List Component:**
    *   File: `apps/tui/src/screens/organizations/sections/MembersSection.tsx`
    *   Fetch data using `useOrgMembers(orgName)`.
2.  **UI Implementation:**
    *   Use an OpenTUI `<scrollbox>` for the list.
    *   Implement `j`/`k` navigation tracking `focusedMemberIndex`.
    *   Hide the display name column if `breakpoint < 120`.
    *   Implement scroll-to-end detection to trigger pagination (`loadMore`).
3.  **Actions:**
    *   Bind `a` to open `AddMemberModal`.
    *   Bind `d` or `x` to open `RemoveMemberModal`. Add logic to prevent removing the last owner (render an inline error instead of opening the modal).

## Phase 6: Teams Section

1.  **List Component:**
    *   File: `apps/tui/src/screens/organizations/sections/TeamsSection.tsx`
    *   Fetch data using `useOrgTeams(orgName)`.
2.  **UI Implementation:**
    *   Track `focusedTeamIndex` and navigate with `j`/`k`.
    *   Bind `Enter` to navigate: `push(ScreenName.OrgTeamDetail, { org: orgName, team: focusedTeam.name })`.
    *   Hide the team description column on the minimum breakpoint.
3.  **Actions:**
    *   Bind `c` to open `CreateTeamModal`.
    *   Bind `e` to open `EditTeamModal`.
    *   Bind `d` or `x` to open `DeleteTeamConfirmModal`.

## Phase 7: Danger Zone

1.  **UI Implementation:**
    *   File: `apps/tui/src/screens/organizations/sections/DangerZoneSection.tsx`
    *   Render an OpenTUI `<box>` with `borderColor="error"` and `padding={1}`.
2.  **Delete Flow:**
    *   Render a focusable delete button. Pressing `Enter` opens `DeleteOrgModal`.

## Phase 8: Modals System Implementation

1.  **Create Modal Components:**
    *   Directory: `apps/tui/src/components/organizations/modals/`
    *   Wrap all modals in the shared `<OverlayLayer>` component (`apps/tui/src/components/OverlayLayer.tsx`).
    *   Implement width scaling based on terminal size (e.g., 90% for min, 60% for standard).
    *   Trap focus within the modal and bind `Esc` to close.
2.  **Specific Modals:**
    *   `AddMemberModal.tsx`: Inputs for userId and role. Submits via `useAddOrgMember`.
    *   `RemoveMemberModal.tsx`: Confirmation prompt.
    *   `CreateTeamModal.tsx` / `EditTeamModal.tsx`: Form for team details.
    *   `DeleteTeamConfirmModal.tsx`: Requires typing the exact team name to enable the submit button.
    *   `DeleteOrgModal.tsx`: Requires typing the exact organization name. Submits via `useDeleteOrg`. On success, calls `reset(ScreenName.Dashboard)` and shows a toast.

## Phase 9: End-to-End Tests

1.  **Create Test File:**
    *   File: `e2e/tui/organizations.test.ts`
    *   Use `@microsoft/tui-test` to configure the virtual terminal buffer.
2.  **Snapshot Tests:**
    *   `org-settings-initial-load`: Verify sections render and breadcrumbs match.
    *   `org-settings-general-form-populated`: Validate data population and character counter.
    *   `org-settings-members-list`: Check column alignment and color tokens (`primary` for owners, `muted` for members).
    *   `org-settings-danger-zone-styling`: Assert `error` border color.
    *   `org-settings-modals`: Snapshot `AddMemberModal`, `DeleteTeamModal`, and `DeleteOrgModal`.
    *   `org-settings-access-denied`: Assert error state for non-owners.
3.  **Keyboard Interaction Tests:**
    *   `org-settings-tab-cycles-sections`: Test `Tab` cycling.
    *   `org-settings-j-k-list-navigation`: Test list scrolling and selection.
    *   `org-settings-ctrl-s-saves-general`: Test save workflow and success toast.
    *   `org-settings-delete-org-flow`: Test the exact-match name validation in the delete modal.
    *   `org-settings-remove-last-owner-blocked`: Verify the block logic for the last owner.
4.  **Responsive Tests:**
    *   `org-settings-80x24-layout`: Verify stacked labels and hidden columns.
    *   `org-settings-120x40-layout`: Verify inline labels and visible columns.
    *   `org-settings-resize-preserves-form-state`: Ensure local state (`isDirty` inputs) survives a resize event.
5.  **Integration/Error Handling Tests:**
    *   Mock API responses to test `409 Conflict` (name already exists).
    *   Mock `429 Too Many Requests` (rate limiting on member add).
    *   Mock a network timeout on team fetch to verify the "Press R to retry" UI state.
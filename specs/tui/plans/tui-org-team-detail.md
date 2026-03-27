# Implementation Plan: Organization Team Detail Screen (`TUI_ORG_TEAM_DETAIL`)

This plan details the step-by-step implementation for the Organization Team Detail screen in the Codeplane TUI, incorporating the provided engineering specification and research context corrections.

## Step 1: Update Routing and Deep Links

**1.1. Update Route Types**
- **File:** `apps/tui/src/router/types.ts`
- **Action:** Ensure `ScreenName.OrgTeamDetail` exists and the param types `{ org: string, team: string }` are properly defined for this screen.

**1.2. Add Deep Link Support**
- **File:** `apps/tui/src/navigation/deepLinks.ts`
- **Action:** Add an entry mapping the CLI string argument `"org-team-detail"` to `ScreenName.OrgTeamDetail` to enable deep-link launching from the terminal (e.g., `codeplane tui --screen org-team-detail --org <org> --team <team>`).

## Step 2: Implement UI Sub-components and Modals

**2.1. Create Team Modals**
- **File:** `apps/tui/src/screens/organizations/components/TeamModals.tsx`
- **Action:** Implement the mutation overlays needed by owners:
  - `DeleteTeamModal`: A `<ConfirmDialog>` displaying the team name. Uses `useDeleteTeam`. Pops the screen on success.
  - `RemoveItemModal`: A `<ConfirmDialog>` to remove a focused member or repo based on the active tab.
  - `AddOverlay`: A `<Modal>` containing an `<input>` for fuzzy-search queries and a `<ScrollableList>` for suggestions (powered by `useOrgMembers` or `useOrgRepos`). Uses `useAddTeamMember` or `useAddTeamRepo` on submit.

## Step 3: Implement Tab Components

**3.1. Create Team Members Tab**
- **File:** `apps/tui/src/screens/organizations/components/TeamMembersTab.tsx`
- **Action:** 
  - Implement the `Members` tab using `ScrollableList`.
  - Fetch data via `useTeamMembers(org, team)` with cursor pagination.
  - Use `useTerminalDimensions` to conditionally render columns (`username`, `display_name`). Drop `display_name` if width is `<= 80`.
  - Bind the `Enter` key to `push("user-profile", { username })`.

**3.2. Create Team Repositories Tab**
- **File:** `apps/tui/src/screens/organizations/components/TeamReposTab.tsx`
- **Action:**
  - Implement the `Repositories` tab using `ScrollableList`.
  - Fetch data via `useTeamRepos(org, team)` with cursor pagination.
  - Map columns: `name`, visibility badge, and `description`. Drop `description` if width is `<= 80`.
  - Bind the `Enter` key to `push("repo-overview", { owner: org, repo: repo.name })`.

## Step 4: Implement the Main Screen Component

**4.1. Create `OrgTeamDetailScreen`**
- **File:** `apps/tui/src/screens/organizations/OrgTeamDetailScreen.tsx`
- **Action:**
  - Scaffold the root view using `<AppShell>`.
  - Extract `org` and `team` from routing params.
  - Fetch core data: `useTeam(org, team)` and `useOrgRole(org)`.
  - Handle loading and error states (braille spinner, 403/404/500 overlays).
  - **Header:** Render the team name (`<text bold>`), permission badge (`useTheme` semantic colors based on role), and description (truncated based on terminal dimensions).
  - **Tabs:** Render a fixed tab bar (`Members (N) │ Repositories (N)`) and switch between `TeamMembersTab` and `TeamReposTab` based on the `activeTab` state.
  - **Keybindings:** Use `useScreenKeybindings` to register `Tab`/`Shift+Tab` for switching tabs. Conditionally register owner keys (`e`, `D`, `a`, `x`) based on `useOrgRole` to trigger the modals created in Step 2.

## Step 5: Update Router Registry

**5.1. Replace Placeholder in Registry**
- **File:** `apps/tui/src/router/registry.ts`
- **Action:** Replace the `PlaceholderScreen` mapped to `ScreenName.OrgTeamDetail` with the newly implemented `OrgTeamDetailScreen` component.

## Step 6: Create E2E Tests

**6.1. Scaffold Test File**
- **File:** `e2e/tui/organizations.test.ts`
- **Action:** Create this file if it does not exist. Set up `@microsoft/tui-test` bindings.

**6.2. Implement Test Cases**
- **Snapshots:**
  - `org-team-detail-initial-load`: Validates the header, permission badge, description, and members list.
  - `org-team-detail-header-permission-{read|write|admin}`: Validates semantic color formatting.
  - Loading/Error states: `org-team-detail-loading-state`, `org-team-detail-404-state`, etc.
  - `org-team-detail-delete-confirmation-modal`: Snapshots structural formatting of the deletion modal.
- **Keyboard Interactions:**
  - Tab switching: `org-team-detail-tab-switches-to-repos`, `org-team-detail-shift-tab-switches-to-members`.
  - List navigation (`j`, `k`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`) and enter execution (`org-team-detail-enter-opens-member`, `org-team-detail-enter-opens-repo`).
  - Owner action bindings: Verify `e`, `D`, `a`, `x` trigger modals for owners and are no-ops for regular members.
- **Responsive Validation:**
  - Synthetic resize tests to ensure layout degrades gracefully at `80x24` (dropping extra columns) and expands at `120x40`/`200x60`.
- **Edge Cases:**
  - `org-team-detail-remove-member-revert-on-error`: Validates optimistic UI revert.
  - `org-team-detail-add-member-already-on-team`: Validates inline conflict error.
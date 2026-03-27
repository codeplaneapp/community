# Engineering Specification: TUI Organization Settings View (tui-org-settings-view)

## 1. Overview

The Organization Settings View is a terminal-native administration screen for Codeplane organizations, exclusively accessible to organization owners. The view is partitioned into four functional sections: General Settings, Members, Teams, and Danger Zone. It leverages Codeplane's `NavigationProvider` for stack-based navigation, `KeybindingProvider` for layered keyboard inputs (`Tab`/`Shift+Tab` for section cycling, `j`/`k` for list navigation), and `@codeplane/ui-core` hooks for API interaction.

## 2. Implementation Plan

All implementation targets the `apps/tui/src/` directory. 

### Phase 1: Route Registration and Access Control
1. **Screen Registration:**
   - Add `OrgSettings` to the `ScreenName` enum in `apps/tui/src/navigation/types.ts`.
   - Register `OrgSettingsScreen` in `apps/tui/src/navigation/registry.ts` with `{ requiresRepo: false }` (but requires org context via params).
2. **Entry Point (`OrgOverviewScreen.tsx`):**
   - Update the existing `OrgOverviewScreen` to conditionally register the `s` keybinding using `useScreenKeybindings`.
   - Ensure the keybinding is only active if `currentUser.role === 'owner'` for the active organization.
   - Action: `push("OrgSettings", { org: orgName })`.

### Phase 2: Screen Scaffolding & Section Navigation
1. **Create `OrgSettingsScreen.tsx`:**
   - Path: `apps/tui/src/screens/organizations/OrgSettingsScreen.tsx`.
   - Setup `useLayout()` to retrieve `breakpoint` for responsive adaptations.
   - Retrieve the `orgName` from navigation params. 
   - Call `useOrg(orgName)` to fetch initial data. If `role !== 'owner'`, render an inline "Access denied. Organization owner role required." error.
2. **Section State Management:**
   - Track `activeSection` using a `useState<"general" | "members" | "teams" | "danger">("general")`.
   - Use `useScreenKeybindings` to bind `Tab` (cycle forward) and `Shift+Tab` (cycle backward) to update `activeSection`.

### Phase 3: General Settings Section
1. **Form State:**
   - Extract properties from `useOrg(orgName)` into local React state: `name`, `description`, `visibility`, `website`, `location`.
   - Derive `isDirty` by comparing local state to the fetched `org` object.
2. **UI Implementation:**
   - Render fields using `<input>` and `<select>` OpenTUI primitives.
   - Add live character counter for `name` field (`name.length/255`).
   - Use `useLayout()` to toggle between inline labels (standard/large) and stacked labels (minimum).
3. **Mutations & Keyboard Logic:**
   - Bind `Ctrl+S` globally in the screen to trigger `handleSave`.
   - Integrate `useUpdateOrg(orgName)`. On success, reset local dirty state and dispatch a success toast ("✓ Organization updated").
   - Changing `visibility` to a more restrictive option triggers `VisibilityConfirmModal`.

### Phase 4: Members Section
1. **Data Fetching:**
   - Integrate `useOrgMembers(orgName)`.
2. **List UI (`<scrollbox>`):**
   - Implement a list view with `j`/`k` navigation tracking `focusedMemberIndex`.
   - Adapt column visibility based on `breakpoint` (hide display name at `< 120` cols).
   - Implement scroll-to-end detection to call `loadMore()`.
3. **Modals & Actions:**
   - **Add Member (`a`):** Opens `AddMemberModal` (inputs: userId, role). Submits via `useAddOrgMember`.
   - **Remove Member (`d` / `x`):** Opens `RemoveMemberModal`. Checks if the member is the last owner; if so, blocks action and shows an inline error.

### Phase 5: Teams Section
1. **Data Fetching:**
   - Integrate `useOrgTeams(orgName)`.
2. **List UI:**
   - Track `focusedTeamIndex`. `j`/`k` to navigate.
   - Bind `Enter` to `push("TeamDetail", { org: orgName, team: focusedTeam.name })`.
   - Hide team description column on minimum breakpoint.
3. **Modals & Actions:**
   - **Create Team (`c`):** Opens `CreateTeamModal`. Submits via `useCreateTeam`.
   - **Edit Team (`e`):** Opens `EditTeamModal` pre-populated with team data.
   - **Delete Team (`d` / `x`):** Opens `DeleteTeamConfirmModal`. Requires exact string match on `team.name` to enable the submission button. Submits via `useDeleteTeam`.

### Phase 6: Danger Zone
1. **UI Implementation:**
   - Render a `<box>` with `borderColor="error"` and `padding={1}`.
2. **Delete Flow:**
   - Pressing `Enter` on the focusable delete button opens `DeleteOrgModal`.
   - Requires exact string match for `orgName` in an `<input>`. 
   - Submits via `useDeleteOrg(orgName)`. On success, calls `reset("Dashboard")` and dispatches a toast "Organization deleted".

### Phase 7: Modals System Implementation
1. Create modal components inside `apps/tui/src/components/organizations/modals/`:
   - Use the shared `<OverlayLayer>` or `<box position="absolute" zIndex={10}>`.
   - Enable focus trapping. Bind `Esc` to close the modal.
   - Width scaling based on terminal size: 90% (minimum) / 60% (standard) / 50% (large).

## 3. Unit & Integration Tests

All tests target the `e2e/tui/organizations.test.ts` file using the `@microsoft/tui-test` framework and a mocked local HTTP server or local daemon instance.

### 3.1 Terminal Snapshot Tests
Render the TUI to a virtual buffer and assert against goldens.
- `org-settings-initial-load`: Ensure all 4 sections render correctly, and breadcrumb shows "Dashboard > org-name > Settings".
- `org-settings-general-form-populated`: Validate inputs are correctly populated with fetched org data, character counter reads accurately.
- `org-settings-members-list`: Check column alignment, `primary` highlighting on owners, and `muted` on members.
- `org-settings-danger-zone-styling`: Assert the presence of ANSI red (`error` color token) borders around the Danger Zone.
- `org-settings-modals`: Snapshot the rendering of `AddMemberModal`, `DeleteTeamModal`, and `DeleteOrgModal` overlays.
- `org-settings-access-denied`: Assert the error screen layout when loaded with a member-role token.

### 3.2 Keyboard Interaction Tests
Execute programmatic key sequences and verify state mutations.
- `org-settings-tab-cycles-sections`: Send `Tab` four times; verify focus highlights shift sequentially from General -> Members -> Teams -> Danger Zone -> General.
- `org-settings-j-k-list-navigation`: Focus Teams section. Send `j` twice, `k` once. Validate the 2nd row has reverse-video focus.
- `org-settings-ctrl-s-saves-general`: Edit description field, send `Ctrl+S`. Intercept API `PATCH` call. Verify success toast renders.
- `org-settings-delete-org-flow`: Focus Danger Zone, send `Enter`. Assert modal opens. Send incorrect name string; verify Submit button lacks `focused` or `active` state. Send exact name; verify button activates. Send `Enter`; verify redirect to Dashboard.
- `org-settings-remove-last-owner-blocked`: Focus last owner in Members list. Send `d`. Verify modal does NOT open, and inline text "Cannot remove the last organization owner" appears.

### 3.3 Responsive Tests
Resize the virtual terminal buffer and verify OpenTUI recalculations.
- `org-settings-80x24-layout`: Init TUI at 80x24. Verify `General` form labels are stacked. Verify Members display only Username/Role (no display name).
- `org-settings-120x40-layout`: Init TUI at 120x40. Verify `General` form uses inline labels. Verify Members list displays the extra Display Name column.
- `org-settings-resize-preserves-form-state`: Type "new-desc" in Description. Resize terminal from 120x40 to 80x24. Verify the input value "new-desc" remains in the field.

### 3.4 Integration & Error Handling Tests
Simulate API behaviors.
- `org-settings-name-conflict-409`: Mock a `409 Conflict` on `PATCH /api/orgs/:org`. Trigger save. Assert inline error "An organization with that name already exists" renders beneath the Name field.
- `org-settings-rate-limit-429`: Mock a `429` with `Retry-After: 30`. Trigger member add. Assert modal error states "Rate limited. Retry in 30s."
- `org-settings-network-error-teams`: Mock timeout on `GET /api/orgs/:org/teams`. Verify Teams section renders "Press R to retry" in red, while General and Members sections successfully render their data.

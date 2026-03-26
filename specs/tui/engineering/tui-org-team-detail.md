# TUI_ORG_TEAM_DETAIL Engineering Specification

## Overview
This specification details the implementation for the Organization Team Detail screen (`TUI_ORG_TEAM_DETAIL`) within the Codeplane TUI. This screen provides a read-only (for regular members) and administrative (for organization owners) interface to view a specific team's metadata, manage team members, and oversee assigned repositories. It utilizes a stack-based navigation architecture, two main tabbed list views (Members and Repositories), robust responsive column layouts driven by terminal dimensions, and optimistic mutations for ownership workflows.

## Architecture & Component Design

- **Screen Component**: `OrgTeamDetailScreen` will act as the root orchestrator, consuming routing parameters (`org`, `team`).
- **Data Hooks**: Consumes `@codeplane/ui-core` hooks: `useTeam`, `useTeamMembers`, `useTeamRepos`, `useOrgRole`.
- **Layout**: Employs an `AppShell` structured flexbox layout:
  - Fixed Header (metadata: team name, badge, description, timestamps).
  - Fixed Tab Bar ("Members (N) │ Repositories (N)").
  - Flexible `<scrollbox>` content area rendering `ScrollableList` for the active tab.
- **State Management**: Maintains `activeTab` ("members" | "repos"), modal visibilities, and currently focused item in the active list to contextually fuel mutation overlays.
- **Role-based Keybindings**: Registers standard keybindings globally for the screen (`j/k/Enter/Tab/q/?`), but dynamically filters and binds owner-specific keys (`e`, `D`, `a`, `x`) based on `useOrgRole`.

## Implementation Plan

### 1. Routing and Shell Integration
- **File:** `apps/tui/src/navigation/screenRegistry.ts`
  - Register `OrgTeamDetail` under the `ScreenName.OrgTeamDetail` enum.
  - Map necessary context expectations to require `{ org: string, team: string }` params.
- **File:** `apps/tui/src/screens/organizations/OrgTeamDetailScreen.tsx`
  - Scaffold the root view. Extract params. 
  - Implement core data fetch: `useTeam(org, team)`.
  - Map loading states (centered braille spinner) and HTTP error states (403, 404, 500) into dedicated OpenTUI `<box>` overlays.

### 2. Header and Responsive Breakpoints
- **File:** `apps/tui/src/screens/organizations/OrgTeamDetailScreen.tsx`
  - Inject `useLayout` / `useTerminalDimensions` to retrieve active breakpoints (`minimum`, `standard`, `large`).
  - Build the `TeamHeader` inner component:
    - Render Team Name using `<text bold>`.
    - Map permissions (`read`, `write`, `admin`) to `useTheme()` tokens (`success`, `warning`, `error`).
    - Render description with word wrapping. Truncate dynamically based on breakpoint (2 lines max at `minimum`, 4 at `standard`, 6 at `large`). Render "No description provided." if null.
    - Add muted timestamps.

### 3. Tabbed Content Layers
- **File:** `apps/tui/src/screens/organizations/components/TeamMembersTab.tsx`
  - Implement the `Members` tab using `ScrollableList`.
  - Fetch data via `useTeamMembers(org, team)` with 30-item page cursor pagination logic.
  - Handle list mapping: conditionally render columns (`username`, `display_name`) tied to layout breakpoints. At `80x24`, drop `display_name`.
  - Link `Enter` keybinding to `push("user-profile", { username })`.
- **File:** `apps/tui/src/screens/organizations/components/TeamReposTab.tsx`
  - Implement the `Repositories` tab using `ScrollableList`.
  - Fetch data via `useTeamRepos(org, team)`.
  - Map columns: `name`, `visibility` badge, `description`. Drop `description` at `80x24`.
  - Link `Enter` keybinding to `push("repo-overview", { owner: org, repo: repo.name })`.

### 4. Keybinding and Tab Switch Orchestration
- **File:** `apps/tui/src/screens/organizations/OrgTeamDetailScreen.tsx`
  - Leverage `useScreenKeybindings` to register cross-screen mappings.
  - Tie `Tab` and `Shift+Tab` or `1`/`2` to toggle `activeTab` state.
  - Use `useOrgRole(org)` to conditionally bind owner keys:
    - `e`: trigger `push("org-team-edit", { org, team })`.
    - `D`: toggle `isDeleteModalOpen` state.
    - `a`: toggle `isAddOverlayOpen` (determines member vs repo based on `activeTab`).
    - `x`: toggle `isRemoveConfirmOpen` (determines member vs repo based on active focused row).

### 5. Modals and Mutation Overlays
- **File:** `apps/tui/src/screens/organizations/components/TeamModals.tsx`
  - `DeleteTeamModal`: Implement `ConfirmDialog` displaying team name. Trigger `useDeleteTeam` on submit, pop screen on success.
  - `RemoveItemModal`: Implement `ConfirmDialog` to remove the focused member or repo.
  - `AddOverlay`: Implement a `<Modal>` with `<input>` for fuzzy-search queries and a `<ScrollableList>` for suggestions (powered by `useOrgMembers` or `useOrgRepos`). Trigger `useAddTeamMember` or `useAddTeamRepo`.

## Unit & Integration Tests

All tests target the test framework outlined in the TUI design strategy and locate in `e2e/tui/organizations.test.ts`.

### Terminal Snapshot Tests
- `org-team-detail-initial-load`: Ensure header, permission badge, description, and Members tab lists correctly render.
- `org-team-detail-header-permission-{read|write|admin}`: Verify correct semantic color formatting for team permission badges.
- `org-team-detail-loading-state` / `org-team-detail-error-state` / `org-team-detail-403-state` / `org-team-detail-404-state`: Render fallbacks map identically to OpenTUI snapshot structures.
- `org-team-detail-delete-confirmation-modal`: Snapshots structural formatting of `error`-colored deletion modal overlays.

### Keyboard Interaction Tests
- `org-team-detail-tab-switches-to-repos` / `org-team-detail-shift-tab-switches-to-members`: Validates toggling between lists and highlighting correct underlying active tabs.
- List operations (`j`, `k`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`): Focus moves appropriately without wrapping top/bottom bounds; pagination loads when viewport depth is reached.
- Enter execution (`org-team-detail-enter-opens-member`, `org-team-detail-enter-opens-repo`): Validates path push behaviors.
- Filter mechanisms (`/` and `Esc`): Narrows list matching and resets search.
- Owner Action bindings (`e`, `D`, `a`, `x`): Active for owners, triggers modals. Tests specifically ensure these are silent/no-op on members.

### Responsive Validation
- Snapshot verification of width constraints: `80x24` (single col), `120x40` (multi-col split), `200x60` (extended multi-col + timestamps).
- Resize survival: Trigger synthetic resize events; ensure tab persistence, focus memory, and center-alignment of open modals.

### Integration Edge Cases
- Pagination caps: Validate max 500 load restriction (`org-team-detail-500-members-cap`).
- Optimistic error reverts: Removing a member with mocked API failure (`org-team-detail-remove-member-revert-on-error`) reinserts member into UI.
- Conflict handling: Adding an already existing member/repo raises appropriate inline errors (`org-team-detail-add-member-already-on-team`).
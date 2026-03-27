# Implementation Plan: Organization Overview Screen (tui-org-overview)

## 1. Overview
This plan details the implementation of the `OrgOverview` screen for the Codeplane TUI. This screen provides a profile view of an organization, displaying its metadata (name, description, location, website) and a tabbed interface for navigating the organization's Repositories, Members, Teams, and Settings. It will degrade gracefully on smaller terminal sizes and utilize standard OpenTUI primitives and `@codeplane/ui-core` data hooks.

## 2. File Changes

### New Files
- `apps/tui/src/screens/organizations/OrgOverviewScreen.tsx`: Main screen component orchestrating the layout and tabs.
- `apps/tui/src/screens/organizations/components/OrgHeader.tsx`: Component for rendering the organization metadata profile.
- `apps/tui/src/screens/organizations/components/OrgReposTab.tsx`: Tab content for the repository list.
- `apps/tui/src/screens/organizations/components/OrgMembersTab.tsx`: Tab content for the members list.
- `apps/tui/src/screens/organizations/components/OrgTeamsTab.tsx`: Tab content for the teams list.

### Modified Files
- `apps/tui/src/router/registry.ts`: Update to map `ScreenName.OrgOverview` to the new `OrgOverviewScreen` instead of `PlaceholderScreen`.
- `e2e/tui/organizations.test.ts`: Add end-to-end tests for the new screen's layout, interactions, and responsive behaviors.

## 3. Step-by-Step Implementation

### Step 1: Implement the Organization Header (`OrgHeader.tsx`)
- **Purpose:** Display the organization's core metadata.
- **Data:** Accepts the `org` object (from `useOrg`).
- **Layout:** Use `<box flexDirection="column">`.
- **Responsiveness:** 
  - Use `useTerminalDimensions()`.
  - At `< 120` width (e.g., 80x24), show only the name and truncate the description to one line. Hide website, location, and timestamps.
  - At `>= 120` width, show full metadata using muted colors for secondary information.

### Step 2: Implement Tab Content Components
Each tab component will follow a similar pattern: fetch data, handle loading/error/empty states, render a list, and handle list interactions.

#### A. `OrgReposTab.tsx`
- **Data:** Use `useOrgRepos(orgName)`.
- **Interactions:** 
  - `j`/`k` to navigate.
  - `Enter` to call router `push(ScreenName.RepoOverview, { repo: selected.fullName })`.
  - `/` to focus an inline `<input>` for client-side filtering by name/description.
- **Responsiveness:** Hide secondary columns (e.g., last updated, description) on small terminals.

#### B. `OrgMembersTab.tsx`
- **Data:** Use `useOrgMembers(orgName)`.
- **Display:** Show username, display name, and role badge (`owner`/`member`).
- **Interactions:** Similar list navigation and filtering.

#### C. `OrgTeamsTab.tsx`
- **Data:** Use `useOrgTeams(orgName)`.
- **Display:** Show team name, description, and permission level (`read`/`write`/`admin`).
- **Interactions:** 
  - `Enter` to call router `push(ScreenName.OrgTeamDetail, { teamId: selected.id })`.

### Step 3: Implement the Main Screen (`OrgOverviewScreen.tsx`)
- **Data Loading:**
  - Call `useOrg(route.params.orgName)`.
  - Call `useUser()` to get the current authenticated user.
  - Handle 404/Error states (show error message + "Press R to retry").
  - Handle loading state (show spinner).
- **Layout Configuration:**
  - Render `OrgHeader` at the top.
  - Use the shared `TabbedDetailView` component below the header.
- **Tab Logic:**
  - Define tabs: `Repositories`, `Members`, `Teams`.
  - Determine if the current user has the `owner` role in the fetched `org`.
  - If `owner`, append a `Settings` tab. Note: Selecting the Settings tab should NOT render inline content, but instead trigger `push(ScreenName.OrgSettings, { orgName })`.
  - Pass `Tab`/`Shift+Tab` and `1-4` keyboard events to manage active tab state.

### Step 4: Update Router Registry
- Open `apps/tui/src/router/registry.ts`.
- Import `OrgOverviewScreen`.
- Replace the existing `PlaceholderScreen` mapping for `ScreenName.OrgOverview` with `OrgOverviewScreen`.

### Step 5: Write End-to-End Tests (`e2e/tui/organizations.test.ts`)
Add the following test cases using `@microsoft/tui-test`:
1.  **Initial Render & Data Loading:** Verify loading spinner transitions to the full UI with the correct org header.
2.  **Responsive Layout (120x40 vs 80x24):** Assert that metadata is hidden/truncated at 80x24 and fully visible at 120x40 using snapshots.
3.  **Tab Navigation:** Simulate `Tab`, `Shift+Tab`, and number keys (`1`, `2`, `3`) to ensure the view switches between Repositories, Members, and Teams without crashing. Verify lazy loading of tab data.
4.  **List Interaction & Filtering:** In the Repositories tab, simulate `/`, type a query, assert the list filters, and simulate `Enter` to ensure the correct router push action is dispatched.
5.  **Settings Tab Visibility:** 
    - Mock `useUser` to return a standard member. Assert the Settings tab is absent.
    - Mock `useUser` to return an owner. Assert the Settings tab is present and pressing `4` dispatches the navigation event.
6.  **Error Handling:** Mock a 404 response for `useOrg` and verify the access denied/not found message is rendered gracefully.
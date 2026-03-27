# Research: Organization Overview Screen (tui-org-overview)

## Overview
The `tui-org-overview` ticket requires implementing the `OrgOverview` screen for the Codeplane TUI using React 19 and OpenTUI. The screen provides a detailed profile view of an organization, displaying metadata and a tabbed interface for Repositories, Members, Teams, and Settings. It replaces the current `PlaceholderScreen` mapped to `ScreenName.OrgOverview` in the router.

## Navigation & Routing Context
- **Router Mapping:** `ScreenName.OrgOverview` is currently defined in `apps/tui/src/router/types.ts` and mapped to `PlaceholderScreen` in `apps/tui/src/router/registry.ts`.
- **Breadcrumb:** Reads "Organizations > {org-name}" (defined in the router).
- **Navigation:**
  - Pushed via `Enter` on an organization from the Dashboard or Org List.
  - Returns to the previous screen using `q` or `Esc` (when filter is inactive).
  - Pushes `ScreenName.RepoOverview` when selecting a repository.
  - Pushes `ScreenName.OrgTeamDetail` when selecting a team.
  - Pushes `ScreenName.OrgSettings` when selecting the Settings tab.

## Component Architecture
- The screen relies heavily on the `TabbedDetailView` component (`apps/tui/src/components/TabbedDetailView.tsx`) to manage the layout, tab switching, and per-tab scroll state.
- **OpenTUI Primitives:** 
  - `<box>` for flexbox layout (vertical and horizontal arrangements).
  - `<text>` for text rendering with `wrap="word"`, `bold`, and semantic `color`.
  - `<scrollbox>` for paginated list content in tabs.
  - `<input>` for the per-tab filter with placeholder and maxLength constraint.

## Data Hooks (`@codeplane/ui-core`)
Data is fetched using shared UI hooks. Each tab lazily loads its data to avoid unnecessary requests:
- `useOrg(orgName)`: Fetches organization profile metadata (name, description, visibility, location, website, timestamps).
- `useOrgRepos(orgName)`: Paginated repository list.
- `useOrgMembers(orgName)`: Paginated members roster.
- `useOrgTeams(orgName)`: Paginated teams list.
- `useUser()`: Used to determine if the authenticated user has the `owner` role to conditionally display the "Settings" tab.

## Tab Details & Keyboard Interactions
The screen features 4 tabs. Switching tabs swaps inline content via `Tab`/`Shift+Tab` or number keys `1-4`.
1. **Repositories (`1`) - Default:** Shows a paginated list of repos.
2. **Members (`2`):** Shows user roles (`owner`/`member`).
3. **Teams (`3`):** Shows teams with permission badges (`read`/`write`/`admin`).
4. **Settings (`4`):** Only visible to org owners. Selecting this pushes the Settings screen onto the stack.

**List Navigation:**
- `j` / `Down` and `k` / `Up`: Navigate rows.
- `Enter`: Open focused item.
- `/`: Activate client-side filter (substring match for names/descriptions).
- `Esc`: Clear filter.

## Layout & Responsive Constraints
The terminal UI must gracefully degrade based on terminal size (`useTerminalDimensions`, `useOnResize`):
- **80x24 (Minimum):** Collapses metadata (hides website/location/timestamps), truncates description to a single line, and limits tab content to primary columns (e.g., name + badge only). Tab labels are abbreviated (e.g., "Memb.", "Sett.").
- **120x40 (Standard):** Full metadata visibility. Tab content shows additional columns (e.g., descriptions, last updated).
- **200x60 (Large):** Wider column widths for descriptions and metadata.

## Edge Cases & Error Handling
- **Non-existent/Private Orgs:** A 404 is rendered for non-existent orgs or private orgs where the user is not a member (preventing information leakage).
- **Empty States:** Missing optional metadata (website, location) is omitted entirely without blank lines. Zero items in a tab show a muted centered message.
- **Retry Logic:** Network or API errors are handled inline per tab, prompting the user with `Press R to retry`.

## Testing Strategy
- Tests target `e2e/tui/organizations.test.ts` using `@microsoft/tui-test`.
- Covers terminal snapshots at different breakpoints (80x24, 120x40).
- Verifies keyboard interactions (navigation, tab switching, filtering).
- Ensures proper error, empty state, and lazy-loading validation.
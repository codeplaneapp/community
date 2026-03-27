# Engineering Specification: TUI Organization Teams View

## Implementation Plan

### 1. Types & Data Hooks (`@codeplane/ui-core` & `@codeplane/sdk`)
*   **Domain Types**: Verify or add the `Team` interface in `@codeplane/sdk/src/types/organization.ts`:
    ```typescript
    export interface Team {
      id: number;
      name: string;
      description: string;
      permission: "read" | "write" | "admin";
      createdAt: string;
      memberCount?: number;
    }
    ```
*   **`useOrgTeams` Hook**: Create `packages/ui-core/src/hooks/useOrgTeams.ts`:
    *   Calls `GET /api/orgs/:org/teams`.
    *   Implements cursor or page-based pagination to fetch up to a 500-item cap.
    *   Returns `{ teams: Team[], total: number, isLoading: boolean, error: Error | null, fetchMore: () => void, refetch: () => void }`.
*   **`useOrgRole` Hook**: Create `packages/ui-core/src/hooks/useOrgRole.ts` (if missing):
    *   Calls `GET /api/orgs/:org/members/me` to determine the user's role.
    *   Returns `{ role: "owner" | "member" | null, isLoading: boolean }`.

### 2. Screen Component (`apps/tui/src/screens/organizations/OrgTeamsScreen.tsx`)
*   **State Management**:
    *   `focusedId`: Tracks the `id` of the currently focused team.
    *   `filterText` (string) and `filterActive` (boolean): Manages the inline filter state.
*   **Data Fetching**:
    *   Invoke `useOrgTeams(params.org)` and `useOrgRole(params.org)`.
*   **Responsive Layout (`useLayout`)**:
    *   Map `getBreakpoint(width, height)` to column visibility and widths:
        *   **Minimum (80×24)**: `name` (max 50ch) | `badge` (5ch)
        *   **Standard (120×40)**: `name` (30ch) | `badge` | `description` (40ch) | `createdAt` relative (15ch)
        *   **Large (200×60+)**: `name` (40ch) | `badge` | `description` (60ch) | `memberCount` (10ch) | `createdAt` (20ch)
    *   Use `truncate(string, length)` utility to correctly cap long team names and descriptions.
*   **UI Rendering**:
    *   **Header**: Renders `Teams ({total})` and a right-aligned `/ filter` hint.
    *   **Filter Input**: Render an OpenTUI `<input>` box immediately below the header if `filterActive`.
    *   **List**: Iterate over filtered teams. Render focused rows with a `primary` background. Map permission strings to theme colors (`read` → `theme.success`, `write` → `theme.warning`, `admin` → `theme.error`).
    *   **Empty State**: Render role-aware text using `theme.muted`. (e.g. "No teams yet. Press `c` to create..." for owners).
    *   **Loading State**: Braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` + "Loading teams…".
    *   **Pagination Indicator**: "Loading more…" appended to the list when fetching the next page.
*   **Keybindings (`useScreenKeybindings`)**:
    *   `j`/`Down`, `k`/`Up`: Move `focusedId` through the filtered items.
    *   `Enter`: Push `TUI_ORG_TEAM_DETAIL` with `{ org: params.org, team: focusedTeam.name }`.
    *   `/`: Set `filterActive = true`, focus input.
    *   `Esc`: If `filterActive`, set `filterActive = false` and clear `filterText`. If false, `pop()` to overview.
    *   `c`: If `role === "owner"`, push `TUI_ORG_TEAM_CREATE` with `{ org: params.org }`. Else, no-op.
    *   `R`: `refetch()` when `error` is present.
    *   `q`: `pop()`.
    *   `g g`, `G`, `Ctrl+D`, `Ctrl+U`: Dispatch scrolling controls to the scrollbox/list component.
*   **Status Bar Hints**: Provide dynamic key hints array to `<StatusBar>` based on the user's role (include `c:create` only for owners) and error states.

### 3. Navigation & Routing (`apps/tui/src/navigation/`)
*   **Registry**: Add `OrgTeams` (and stubs for `OrgTeamDetail`, `OrgTeamCreate` if needed) to `screenRegistry.ts` along with required parameters (`org`).
*   **Entry Point**: Update `apps/tui/src/screens/organizations/OrgOverviewScreen.tsx` to handle pressing `t` or selecting the Teams tab by pushing the `OrgTeams` screen.

## Unit & Integration Tests

All tests will be added to `e2e/tui/organizations.test.ts` utilizing `@microsoft/tui-test`.

### Terminal Snapshot Tests (14 Tests)
*   **`org-teams-initial-load`**: Validates the "Teams (N)" header, column layouts, focused highlight, and permission badges.
*   **`org-teams-empty-state-owner` / `member`**: Verifies text content ("Press c to create" vs "Ask an owner") centered in muted color.
*   **`org-teams-loading-state` / `error-state`**: Validates the braille spinner and inline error component text/colors.
*   **`org-teams-filter-active` / `results` / `no-results`**: Validates layout changes when the `/` filter is active and populating results.
*   **`org-teams-status-bar-owner` / `member`**: Validates status bar hints string dynamically reflecting the user's role capabilities.

### Keyboard Interaction Tests (27 Tests)
*   **List Navigation**: Verify `j`, `k`, `Down`, `Up`, `g g`, `G`, `Ctrl+D`, `Ctrl+U` correctly move focus state and do not wrap around bounds.
*   **Action Navigation**: Verify `Enter` dynamically pushes `org-name > Teams > team-name` to the breadcrumb.
*   **Filtering**: Verify `/` intercepts input, case-insensitivity, matches on description, and `Esc` clearing.
*   **Role-Gated Actions**: Verify `c` opens the team creation screen as an owner, and performs no action as a member.
*   **Error & Lifecycle**: Verify `R` retries fetches on error, `q` correctly pops the screen, and `Enter` does nothing during loading phases.
*   **Pagination**: Verify scrolling past 80% triggers the next page load.

### Responsive Tests (12 Tests)
*   **Breakpoint Layouts**: Test explicit dimensions (`80x24`, `120x40`, `200x60`) verifying column counts and text truncation constraints.
*   **Resize Events**: Simulate terminal resize (`resize(120, 40) -> resize(80, 24)`); verify layout recalculation does not lose focus, and correctly restores filter input and list position.

### Integration Tests (15 Tests)
*   **API Edge Cases**: Mock responses for `401` (auth bounds), `403` (forbidden), `404` (org missing), `429` (rate-limited), and `500` server errors to verify inline/app-shell error states.
*   **Pagination Limitations**: Test 600 total teams resolving correctly to a 500-item cap ("Showing first 500 of 600").
*   **State Persistence**: Verify `Enter` -> `q` (and `c` -> `q`) preserves the list scroll position and focus.
*   **Data Resiliency**: Validate behavior handling teams with empty descriptions and multi-byte/unicode characters regarding text truncation boundaries.
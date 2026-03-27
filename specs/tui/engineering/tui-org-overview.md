# TUI_ORG_OVERVIEW: Engineering Specification

## Implementation Plan

The implementation targets `apps/tui/src/` and introduces the `OrgOverviewScreen` along with its sub-components for metadata rendering and tabbed list views.

### Step 1: Types & Navigation Registration
1. **Screen Registry (`apps/tui/src/navigation/screenRegistry.ts`)**:
   - Add `OrgOverview` to `ScreenName` enum.
   - Register `{ component: OrgOverviewScreen, requiresRepo: false }`.
2. **Screen Props**:
   - Define `OrgOverviewParams { orgName: string }` which is passed via the navigation stack.

### Step 2: Data Hooks and Permissions Configuration
1. **Core Data Access (`@codeplane/ui-core`)**:
   - Verify/import the following hooks: `useOrg(orgName)`, `useOrgRepos(orgName)`, `useOrgMembers(orgName)`, `useOrgTeams(orgName)`, and `useUser()`.
2. **Security & Validation**:
   - Ensure the component handles 404/403 responses gracefully. If `useOrg` returns a 403 or 404, the screen renders a generic "Organization not found." full-screen error using the `ErrorScreen` abstraction with a prompt to press `q` to go back.
   - Extract the current user's role from the org response or `useUser` to determine if the "Settings" tab should be rendered.

### Step 3: Screen Component and State Management
Create `apps/tui/src/screens/organizations/OrgOverviewScreen.tsx`.

1. **State Hooks**:
   - `activeTab`: tracks the currently selected tab (`"repos" | "members" | "teams" | "settings"`). Defaults to `"repos"`.
   - `visitedTabs`: a `Set<string>` tracking which tabs have been rendered to support lazy-loading of tab data.
   - `filterQuery`: a string storing the current client-side filter input.
   - `isFiltering`: a boolean tracking if the filter input is currently focused.

2. **Lazy Loading Logic**:
   - When `activeTab` changes, add the new tab to `visitedTabs`.
   - Only mount a tab's data component (e.g., `OrgReposTab`) if it exists in `visitedTabs`. If it's not the `activeTab`, render it with `display="none"` (or keep it mounted in a hidden box) to preserve scroll state and avoid re-fetching, letting `@codeplane/ui-core` handle cache retention.

### Step 4: UI Components
Create the sub-components within `apps/tui/src/screens/organizations/`:

1. **`OrgMetadata` Component**:
   - Uses `useLayout()` to get `breakpoint`.
   - Renders `org.name` in `theme.primary` and `bold`.
   - Maps `org.visibility` to the appropriate token (`public` -> `success`, `limited` -> `warning`, `private` -> `error`).
   - Uses `wrap="word"` for description.
   - **Responsive rules**:
     - *Minimum (80x24)*: single line name+badge, single line truncated description. Hides website, location, timestamps.
     - *Standard/Large*: Full rendering of all fields. Omits entirely any field that is empty.

2. **`OrgTabBar` Component**:
   - Renders a horizontal `<box>` containing tab labels.
   - Uses `theme.muted` for inactive tabs and `theme.primary` + underline for `activeTab`.
   - Includes number shortcuts (e.g., `1:Repos`, `2:Members`). Uses abbreviated text at minimum breakpoint.
   - Conditionally renders `4:Settings` if the user is an owner.

3. **Tab Components (`OrgReposTab`, `OrgMembersTab`, `OrgTeamsTab`)**:
   - Wraps the `ScrollableList` component.
   - **Data Fetching**: Calls its respective hook (e.g., `useOrgRepos`).
   - **Filtering**: Implements client-side `.filter()` against the fetched items before passing to `ScrollableList`. Filters by string inclusion (case-insensitive) on name/description (repos, teams) or username/display name (members).
   - **Column Layouts**: Checks `breakpoint` to determine column widths and whether to show optional columns (like descriptions). Uses `String.prototype.padEnd`/`substring` with grapheme awareness for clean table-like rendering.
   - **Empty States**: Renders muted "This organization has no X yet" messages.

### Step 5: Keybindings & Interactions
Leverage `useScreenKeybindings` inside `OrgOverviewScreen`.

1. **Global/Screen Actions**:
   - `q`: Pop navigation stack. If `isFiltering` is true, this key goes to input.
   - `Tab` / `Shift+Tab`: Cycle `activeTab`.
   - `1`, `2`, `3`, `4`: Jump to specific tabs. (Key 4 triggers `push('OrgSettings')` rather than changing local state, if owner).
   - `?`: Toggle help.
   - `R`: Calls `.refetch()` on the currently active data hook if an error state is active.
2. **Filtering Context**:
   - `/`: Sets `isFiltering` to `true`, focusing the `<input>` element at the bottom/top of the list.
   - `Esc`: If `isFiltering` is true, clears `filterQuery` and un-focuses input. If `isFiltering` is false, acts as `q`.
3. **List Navigation**:
   - Handled primarily by `<ScrollableList>` (`j`, `k`, `Enter`, `Ctrl+D`, `Ctrl+U`, `G`, `g g`).
   - Intercept `onSelect` from `<ScrollableList>`:
     - Repos: pushes `RepoOverview` screen with `{ owner: orgName, repo: repo.name }`.
     - Teams: pushes `TeamDetail` screen.
     - Members: pushes user profile screen or no-op.

---

## Unit & Integration Tests

Create `e2e/tui/organizations.test.ts` utilizing `@microsoft/tui-test`. These tests will assert standard, minimum, and large constraints using snapshot matches, as well as test keyboard navigation pathways.

### 1. Terminal Snapshot Tests
- **`org-overview-initial-load`**: Launch TUI at 120x40, navigate to org, verify full metadata, tab bar, and repo list snapshot.
- **`org-overview-minimal-org`**: Provide an org fixture with no description/website. Verify compact rendering.
- **`org-overview-visibility-badges`**: Iterate through `public`, `limited`, `private` fixtures and match snapshots for token colors.
- **`org-overview-tab-bar-owner-vs-member`**: Snapshot tab bar with and without `Settings` tab presence.
- **`org-overview-tab-content`**: Take snapshots of the Repos, Members, and Teams tabs populated with fixture data. Includes edge cases like `org-overview-teams-tab-empty`.
- **`org-overview-loading-and-errors`**:
  - `org-overview-loading-org`: Network delay on org fetch -> full-screen spinner.
  - `org-overview-error-404` & `org-overview-error-403-shows-404`: Unauthorized/missing -> "Organization not found".
  - `org-overview-tab-error`: Mock tab network error -> inline error inside tab bounding box, metadata visible.

### 2. Keyboard Interaction Tests
- **Tab Cycling**: Press `Tab` and `Shift+Tab` to verify focus cycles Repos -> Members -> Teams (-> Settings).
- **Number Shortcuts**: Press `1`, `2`, `3` to verify instant tab switching. Press `4` as non-owner (verify no-op) and owner (verify stack push).
- **List Navigation**:
  - Open Members tab. Send `j` three times. Assert the 4th item is focused (regex match on `\x1b[7m`).
  - Send `g g`, assert focus returns to first item.
  - Send `Enter` on a repo row -> Assert breadcrumb updates to `Organizations > acme-corp > Repo`.
- **Filter Interaction**:
  - Send `/`. Type "api". Assert only repos matching "api" are visible.
  - Assert that `j`, `k`, `1` do *not* trigger keybindings while typing in the filter.
  - Send `Esc`. Assert filter is cleared and list resets.
  - Send `Esc` again. Assert screen pops back to Organization List.
- **Error Retries**: Simulate error state. Press `R`. Verify loading state resumes.

### 3. Responsive Layout Tests
- **`org-overview-80x24-metadata`**: Resize to 80x24. Verify description is a single line, and optional metadata is hidden. Tab labels should be abbreviated. List columns should omit descriptions.
- **`org-overview-120x40-metadata`**: Resize to 120x40. Verify multi-line descriptions and additional list columns (e.g., repo description).
- **`org-overview-resize-preserves-tab`**: While on "Teams" tab, resize terminal from 120x40 to 80x24. Assert "Teams" remains active and focused item is preserved.

### 4. Integration & Pagination Tests
- **`org-overview-lazy-load`**: Inspect network/mock calls. Verify `GET /api/orgs/:org/members` is *only* called after navigating to the Members tab for the first time.
- **`org-overview-tab-cache`**: Navigate Repos -> Members -> Repos. Verify `GET /api/orgs/:org/repos` is not called a second time.
- **`org-overview-pagination`**: Using a fixture of 45 repos, verify scrolling to the bottom (via `G` or rapid `j`) triggers `Loading more...` text and loads page 2.
- **`org-overview-auth-expiry`**: Return a 401 on an API request. Verify the app shell gracefully catches it and displays the auth error screen.
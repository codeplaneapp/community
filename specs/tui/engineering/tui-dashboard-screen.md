# Engineering Specification: TUI Dashboard Screen

## 1. Overview

This specification defines the implementation of the complete Codeplane TUI Dashboard screen. The dashboard acts as the root home screen, orienting the user with a customized four-panel command center (Recent Repos, Organizations, Starred Repos, Activity Feed) and a quick-actions bar. This ticket represents the final orchestration layer, combining the underlying data hooks, layout components, and focus management systems implemented in prerequisite tickets into a cohesive, responsive screen.

## 2. High-Level Approach

The `DashboardScreen` component will serve as the master orchestrator. It will:
1. **Consume Terminal State**: Use `useLayout` from the responsive layout system to dynamically choose between a single-column stacked layout (80x24) and a 2x2 grid layout (120x40+).
2. **Orchestrate Data Loading**: Call all four required data hooks concurrently on mount. Each hook will independently manage its own pagination, loading, and error states.
3. **Manage Global Focus**: Utilize the panel focus manager to track which of the four panels currently has keyboard focus, updating their visual borders and routing list-specific inputs (e.g., `j`, `k`, `Enter`) to the focused child list.
4. **Wire Keyboard Navigation**: Register dashboard-specific keybindings (Tab cycling, `h`/`l` column jumping, `/` filtering, and quick actions `c`, `n`, `s`) using the `useScreen` / `useScreenKeybindings` pattern.
5. **Handle Inline Filtering**: Maintain a local filter state that applies client-side fuzzy matching to the currently focused panel's data before it is rendered by the list component.

## Implementation Plan

### Step 1: Implement the DashboardScreen Orchestrator
**File:** `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
- Create the main `DashboardScreen` React component.
- Import data hooks: `useRepos()`, `useStarredRepos()`, `useOrganizations()`, `useActivity()`, and `useUser()` from `@codeplane/ui-core`.
- Import the layout hook: `useLayout()` to determine `breakpoint` (compact vs standard/large).
- Import the focus hook: `usePanelFocusManager(4)` to handle focus index `0` to `3`.
- Manage local state for the inline filter: `filterActive` (boolean) and `filterQuery` (string).
- Compose the screen using the `<box>` primitive, defining the `flexDirection` based on the layout breakpoint.

### Step 2: Integrate Screen Lifecycle and Keybindings
**File:** `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
- Utilize the `useScreen` hook to register the screen as active and push its keybinding scope.
- Register keybindings:
  - `Tab`: Cycle focus index forward `(focusIndex + 1) % 4`.
  - `Shift+Tab`: Cycle focus index backward.
  - `h`/`l`: If in grid mode, switch focus between left column (indices 0, 2) and right column (indices 1, 3).
  - `/`: Set `filterActive = true` and trap keyboard input for typing the query.
  - `Esc`: If `filterActive`, set `filterActive = false` and clear `filterQuery`.
  - `c`, `n`, `s`: Call `push('CreateRepo')`, `push('Notifications')`, `push('Search')` via the `useNavigation` hook.
  - `R`: Trigger the `refetch()` method of the currently focused panel's data hook.
  - `q`: Trigger application quit confirmation (as Dashboard is the root).
- Ensure hints are broadcast to the status bar using `useStatusBarHints`.

### Step 3: Implement Data Rendering and Layout Switch
**File:** `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
- **Grid Layout (Standard/Large):** Render a top-level `<box flexDirection="row">` with two 50% width columns. Place Recent Repos and Starred Repos in the left column; Organizations and Activity Feed in the right.
- **Stacked Layout (Minimum):** Render a single `<box>` that only renders the panel matching the current `focusIndex`, passing `title={title + " [N/4]"}` to visually indicate pagination.
- **Panel Composition:** Wrap each list in the `DashboardPanel` component. Pass `focused={focusIndex === N}` to drive the ANSI 33 primary border color.

### Step 4: Add Inline Filter Logic
**File:** `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
- When `filterActive` is true on a focused panel, render an `<input>` field at the top of the `DashboardPanel`.
- Derive filtered lists by applying a client-side fuzzy match (using `fuzzySearch` utility from `@codeplane/ui-core`) against the `name`, `title`, or `summary` properties of the items in the focused list.
- Show "N of M" match counts inside the panel header.
- On `Enter`, trigger the navigation action for the first item in the filtered results.

### Step 5: Implement the Quick Actions Bar
**File:** `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
- Add a bottom fixed-height row (`height={1}`) beneath the panels.
- Render text segments for the quick actions using `<text>` components with specific formatting: bold primary keys (`c`, `n`, `s`, `/`) followed by muted labels (`:new repo`, `:notifications`, etc.).

### Step 6: Screen Registration and Global Go-To
**File:** `apps/tui/src/navigation/screenRegistry.ts` & `apps/tui/src/providers/KeybindingProvider.tsx`
- Ensure `Dashboard` is registered in the screen registry with `requiresRepo: false`.
- Register the global `g d` keybinding in the global keybinding provider to call `navigation.reset('Dashboard')`.

## Unit & Integration Tests

All tests will be implemented using `@microsoft/tui-test` and target the `e2e/tui/dashboard.test.ts` file.

### Terminal Snapshot Tests
- **`SNAP-DASH-001`**: Render at 120x40 with populated data, verifying 2x2 grid and full visibility.
- **`SNAP-DASH-002`**: Render at 80x24, verifying single-column stacked layout with `[1/4]` position indicator.
- **`SNAP-DASH-003`**: Render at 200x60, verifying wider panels, extended truncation, and full timestamps.
- **`SNAP-DASH-004`**: Render with empty user data to verify the muted empty-state messages per panel.
- **`SNAP-DASH-005`** through **`SNAP-DASH-008`**: Verify specific data rendering (badges, star counts, event icons, colors) within Recent Repos, Organizations, Starred Repos, and Activity Feed panels individually.
- **`SNAP-DASH-009`**: Verify the primary-colored border (ANSI 33) highlights the focused panel exclusively.
- **`SNAP-DASH-010`**: Verify the exact layout and color formatting of the bottom quick-actions bar.
- **`SNAP-DASH-011`**: Verify panels displaying "Loading…" when API responses are delayed.
- **`SNAP-DASH-012`**: Verify error states with "Press R to retry" rendered in the `error` color token.
- **`SNAP-DASH-013`**: Verify the `/` inline filter input appears correctly at the top of the active panel.
- **`SNAP-DASH-015`**: Verify star count formatting rules (e.g., 1500 -> "1.5k").

### Keyboard Interaction Tests
- **`KEY-DASH-001`** & **`KEY-DASH-002`**: Verify `Tab` and `Shift+Tab` cycle focus correctly (0→1→2→3→0 and reverse).
- **`KEY-DASH-003`**: Verify `j`/`k` move the selection cursor within the strictly focused panel.
- **`KEY-DASH-004`** through **`KEY-DASH-006`**: Verify `Enter` correctly pushes the appropriate detail screen (`RepoOverview`, `OrganizationOverview`, etc.) onto the navigation stack.
- **`KEY-DASH-007`** through **`KEY-DASH-009`**: Verify `G`, `g g`, `Ctrl+D`, and `Ctrl+U` navigation jumps.
- **`KEY-DASH-010`** through **`KEY-DASH-012`**: Verify quick action keys (`c`, `n`, `s`) trigger `push()` for Create Repo, Notifications, and Search screens.
- **`KEY-DASH-013`** through **`KEY-DASH-015`**: Verify `/` activates filtering, updates the match count, and `Esc` or `Enter` handle exiting filter mode correctly.
- **`KEY-DASH-016`**: Verify `R` retriggers the fetch when a panel is focused and in an error state.
- **`KEY-DASH-017`**: Verify `h`/`l` horizontal column hopping in grid mode.
- **`KEY-DASH-018`**: Verify focus (selected row) is preserved within a list when tabbing away and back.
- **`KEY-DASH-019`** & **`KEY-DASH-020`**: Verify `q` triggers quit from root, and global `g d` correctly resets navigation to the Dashboard.

### Responsive Resize Tests
- **`RESIZE-DASH-001`** through **`RESIZE-DASH-003`**: Resize the terminal instance in-flight using `terminal.resize()` and assert the UI transitions cleanly between stacked and grid modes without artifacts.
- **`RESIZE-DASH-005`** & **`RESIZE-DASH-006`**: Verify panel focus and scroll position persist smoothly across layout recalculations.
- **`RESIZE-DASH-007`**: Verify the quick actions bar text correctly adapts/truncates at the 80-column minimum limit.

### Data Loading & Pagination Tests
- **`DATA-DASH-001`**: Verify all 4 panels trigger concurrent requests upon initial component mount.
- **`DATA-DASH-002`** & **`DATA-DASH-003`**: Verify scrolling past 80% fires pagination correctly, and strictly stops when reaching the 200-item memory cap.
- **`DATA-DASH-004`**: Verify data caching behavior; leaving the dashboard and returning via `g d` should not display loading spinners.
- **`DATA-DASH-006`**: Return a simulated `401` response to verify the isolated panel error displays "Session expired".

### Edge Case Tests
- **`EDGE-DASH-001`**: Missing auth token correctly short-circuits rendering and redirects to an auth error screen.
- **`EDGE-DASH-002`**: Extraordinarily long repository names or descriptions are correctly truncated with the `…` character without breaking terminal layout or triggering wrap.
- **`EDGE-DASH-003`**: Emojis and complex Unicode characters render in descriptions without terminal corruption.
- **`EDGE-DASH-005`**: Verify rapid concurrent resizing and tabbing resolves synchronously without crashing.

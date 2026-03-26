# Implementation Plan: Dashboard Screen (`tui-dashboard-screen`)

This implementation plan structures the development of the main Dashboard screen for the Codeplane TUI. It covers assembling the four-panel grid (Recent Repos, Organizations, Starred Repos, Activity Feed) and wiring up data integration, filtering, and responsive layouts.

## Step 1: Define Types and Configuration
**File:** `apps/tui/src/screens/Dashboard/types.ts`
- Define `PANEL` indices (0 to 3) mapping to Recent Repos, Organizations, Starred Repos, and Activity Feed.
- Define `ActivityEventType` types and `ACTIVITY_ICONS` configuration with corresponding ANSI color codes.
- Export layout/data constants (`REPOS_PAGE_SIZE`, `MAX_ITEMS_PER_PANEL`, `DATA_CACHE_TTL_MS`).
- Define the `QUICK_ACTIONS` array to be used in the footer.

## Step 2: Implement Formatting Utilities
**File:** `apps/tui/src/screens/Dashboard/utils/formatStarCount.ts`
- Build `formatStarCount` for compressing large numbers (e.g., 1200 -> 1.2k, 1000000 -> 1M) for narrow TUI panels.

**File:** `apps/tui/src/screens/Dashboard/utils/formatRelativeTime.ts`
- Build `formatRelativeTime` adapting output based on compactness (e.g., "2h" for standard screens vs. "2 hours ago" for large terminals).

**File:** `apps/tui/src/screens/Dashboard/utils/index.ts`
- Export the utility functions.

## Step 3: Implement Missing Scaffolding & Dependencies
*(Research indicates these might not exist in the filesystem yet, implement them to ensure compilation)*
**File:** `apps/tui/src/screens/Dashboard/PanelErrorBoundary.tsx`
- Wrap panel components to isolate crashes. Use `<box>` and `<text fg={theme.error}>` to display localized errors.

**File:** `apps/tui/src/screens/Dashboard/DashboardPanel.tsx`
- Create the generic wrapper component. Apply `theme.primary` border styling when focused, fallback to `theme.border`.
- Include logic to display loading spinners, error messages, empty states, and inline filter inputs (`<input>`).

**File:** `apps/tui/src/screens/Dashboard/useDashboardFocus.ts`
- Create a focus management hook. Support cycling panels (`Tab`/`Shift+Tab`), navigating columns (`h`/`l`), and maintaining cursor/scroll position (`j`/`k`/`G`/`gg`) per panel.

## Step 4: Build Presentation Components
**File:** `apps/tui/src/screens/Dashboard/components/ReposList.tsx`
- Map `RepoSummary` data. Use OpenTUI `attributes="reverse"` for the focused item. Render truncated names, visibility icons (◆/◇), and star counts.

**File:** `apps/tui/src/screens/Dashboard/components/OrgsList.tsx`
- Map `OrgSummary` data. Display org name and truncated description.

**File:** `apps/tui/src/screens/Dashboard/components/ActivityFeed.tsx`
- Map `ActivitySummary` data. Display event-specific icons from `ACTIVITY_ICONS` and formatted relative timestamps.

**File:** `apps/tui/src/screens/Dashboard/components/QuickActionsBar.tsx`
- Render a single-row flex box listing keys and labels (e.g., `c:new repo`). Adapt labels dynamically based on `useLayout().breakpoint`.

**File:** `apps/tui/src/screens/Dashboard/components/index.ts`
- Barrel export the sub-components.

## Step 5: Implement Data Orchestration Hooks
**File:** `apps/tui/src/screens/Dashboard/hooks/useDashboardData.ts`
- Call `@codeplane/ui-core` hooks concurrently: `useUser`, `useRepos`, `useStarredRepos`, `useOrgs`, `useActivity`.
- Aggregate `isLoading` states to calculate an `allLoaded` flag. 
- Manage retry behavior via `refetch()` for each panel.
- Wire up structured telemetry (`tui.dashboard.data_load_time`) and logging (`logger.debug`).

**File:** `apps/tui/src/screens/Dashboard/hooks/useDashboardFilter.ts`
- Manage per-panel filter state (query strings, active boolean).
- Export a `filterItems` function that executes case-insensitive fuzzy matches across arrays and tracks match counts.

**File:** `apps/tui/src/screens/Dashboard/hooks/index.ts`
- Barrel export the hooks.

## Step 6: Assemble the Main Orchestrator Screen
**File:** `apps/tui/src/screens/Dashboard/index.tsx`
- Inject `useLayout()`, `useTheme()`, and `useNavigation()`.
- Initialize custom hooks (`useDashboardData`, `useDashboardFocus`, `useDashboardFilter`).
- Calculate grid layouts dynamically based on `isCompact` (stacked column) vs `isLarge`/`standard` (2x2 grid).
- Configure `useScreenKeybindings` to map navigation actions to the focus manager, route `Enter` selections to the respective overview screens (`ScreenName.RepoOverview`, `ScreenName.OrgOverview`), and handle quick action keybinds.
- Render the 4 `DashboardPanel` elements passing the filtered items and localized state.

## Step 7: Update Router Connectivity
**File:** `apps/tui/src/router/registry.ts`
- Ensure `ScreenName.Dashboard` imports the newly created `DashboardScreen` and configures `requiresRepo: false`.

## Step 8: Comprehensive E2E Testing
**File:** `e2e/tui/dashboard.test.ts`
- Scaffold terminal snapshot tests (`SNAP-DASH-*`) validating standard 120x40 layouts, minimum 80x24 collapses, empty states, and inline filter appearance using `@microsoft/tui-test`.
- Implement keyboard interaction tests (`KEY-DASH-*`) executing keystrokes (`Tab`, `j`, `k`, `/`, `Enter`) and observing the screen side effects.
- Implement layout and data tests verifying responsive resizes (`terminal.resize()`), caching, concurrent loading, and error UI.
- *Note: Leave tests failing (do not skip) where backends are unimplemented (e.g., Activity API returning 501).* 
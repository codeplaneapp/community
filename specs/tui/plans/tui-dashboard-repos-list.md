# Implementation Plan: tui-dashboard-repos-list

This document outlines the step-by-step implementation plan for the Recent Repositories panel on the Dashboard (`tui-dashboard-repos-list`), following the provided engineering and design specifications.

## Phase 1: Directory Setup & Dependency Stubs

Since this is one of the first features in the Dashboard, we must ensure the directory structure exists and stub out dependencies that may not yet be implemented by parallel tickets.

1. **Create Dashboard Directory:**
   - Run `mkdir -p apps/tui/src/screens/Dashboard`

2. **Create Types Stub:**
   - **File:** `apps/tui/src/types/dashboard.ts`
   - **Action:** Create the `RepoSummary` type to ensure type safety across the dashboard components.

3. **Stub Missing Dependencies:**
   - **File:** `apps/tui/src/screens/Dashboard/DashboardPanel.tsx`
     - Create a simple pass-through component `<box flexDirection="column" width="100%" height="100%">{children}</box>`.
   - **File:** `apps/tui/src/screens/Dashboard/useDashboardFocus.ts`
     - Create a stub hook returning static focus state (`isFocused: () => true`).
   - **File:** `apps/tui/src/hooks/useRepos.ts`
     - Create a wrapper hook that ideally imports from `@codeplane/ui-core`, but defaults to returning empty data and `isLoading: true` if the core hooks aren't ready yet.

## Phase 2: Panel Constants & Formatting Utilities

1. **Define Types & Constants:**
   - **File:** `apps/tui/src/screens/Dashboard/repos-list-types.ts`
   - **Action:** Define `ReposColumnLayout`, `ReposListState`, and layout/pagination constants (`REPOS_PANEL_INDEX`, `MAX_REPOS_IN_MEMORY`, `MAX_FILTER_LENGTH`, `SCROLL_PAGINATION_THRESHOLD`, `REPOS_PER_PAGE`).

2. **Implement Formatting Functions:**
   - **File:** `apps/tui/src/screens/Dashboard/repos-list-format.ts`
   - **Action:** Implement pure functions for formatting panel data:
     - `formatStars(count: number): string` (e.g. "★ 1.2k")
     - `relativeTime(dateInput: string | Date): string` (e.g. "3h", "2d")
     - `visibilityBadge(isPublic: boolean): { text: string; colorToken: "success" | "muted" }`

## Phase 3: Layout & Presentational Components

1. **Responsive Column Layout Hook:**
   - **File:** `apps/tui/src/screens/Dashboard/useReposColumns.ts`
   - **Action:** Create a hook utilizing `useLayout()` from `apps/tui/src/hooks/useLayout.ts` to compute column widths dynamically based on the current breakpoint (`minimum`, `standard`, `large`) and the panel's available width.

2. **Implement `RepoRow` Component:**
   - **File:** `apps/tui/src/screens/Dashboard/RepoRow.tsx`
   - **Action:** Build the presentational list row using `<box>` and `<text>` components. Use `useTheme()` for styling (e.g., highlighting focused rows with `theme.primary` background). Apply `truncateText` to ensure strings fit precisely within the computed column widths.

## Phase 4: State, Interaction, & Main Panel Integration

1. **Build `ReposListPanel`:**
   - **File:** `apps/tui/src/screens/Dashboard/ReposListPanel.tsx`
   - **Action:** 
     - Orchestrate data fetching (`useRepos`).
     - Manage local state (`focusedIndex`, `filterText`, `filterActive`).
     - Integrate `useScreenLoading` for unified skeleton loaders and error states.
     - Integrate `usePaginationLoading` with `<scrollbox>` `onScroll` events to load more items when reaching `SCROLL_PAGINATION_THRESHOLD`.
     - Setup keyboard navigation using `useScreenKeybindings` (`j`, `k`, `G`, `gg`, `/` for filtering, `Enter` to open).
     - Emit telemetry events (`tui.dashboard.repos.view`, `tui.dashboard.repos.open`, etc.).

2. **Compose the Dashboard Screen:**
   - **File:** `apps/tui/src/screens/Dashboard/index.tsx`
   - **Action:** Build the root Dashboard layout. Use `DashboardPanel` and pass `ReposListPanel` as a child, calculating its 50% width grid constraint (at standard/large sizes).

3. **Register the Dashboard Route:**
   - **File:** `apps/tui/src/router/registry.ts`
   - **Action:** Replace the `PlaceholderScreen` mapped to `ScreenName.Dashboard` with the newly created `DashboardScreen` component.

## Phase 5: Testing

1. **Unit Tests for Formatting Utilities:**
   - **File:** `e2e/tui/util-format.test.ts`
   - **Action:** Add exhaustive boundary tests for `formatStars`, `relativeTime`, and `visibilityBadge`.

2. **Generate Test Fixtures:**
   - **File:** `e2e/tui/fixtures/dashboard-fixtures.ts`
   - **Action:** Ensure stable mock `RepoSummary` data exists to provide deterministic UI rendering for snapshots.

3. **E2E Terminal Interaction Tests:**
   - **File:** `e2e/tui/dashboard.test.ts`
   - **Action:** Write end-to-end scenarios using `@microsoft/tui-test`:
     - **Snapshots:** Initial load, loading states, empty states, and layout responsiveness at 80x24, 120x40, and 200x60.
     - **Interactions:** Simulate keyboard input for `j/k` navigation, activating filter mode via `/`, text input into the filter, and `Enter` to simulate opening a repository.
     - **Error Handling:** Simulate failed network requests and rate-limiting, ensuring the `R` keybinding correctly invokes the retry logic.

*Note: Any tests involving data fetching will naturally fail until the underlying `useRepos()` hook is fully wired up to the actual backend API. These must be committed as failing rather than skipped.*
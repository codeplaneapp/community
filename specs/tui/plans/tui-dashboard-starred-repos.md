# Implementation Plan: TUI Dashboard Starred Repositories

## Overview
This plan outlines the step-by-step implementation for the `tui-dashboard-starred-repos` feature. It introduces the `useStarredRepos` data hook, the `formatStarCount` utility, the shared `<DashboardPanel />` component, and the `<StarredReposPanel />` screen, complete with E2E and unit testing. All TUI-specific code targets `apps/tui/src/`, shared data access logic targets `packages/ui-core/`, and tests target `e2e/tui/`.

---

## Step 1: Implement `formatStarCount` Utility
**Target**: `apps/tui/src/util/format-stars.ts`
**Export**: `apps/tui/src/util/index.ts`

1. Create a pure function `formatStarCount(count: number): string`.
2. Rules to implement:
   - `<= 0` -> `""` (empty string)
   - `1 - 999` -> Exact number string (e.g., `"42"`)
   - `1000 - 999999` -> K-abbreviated to 1 decimal place if non-zero (e.g., `"1.5k"`, `"10k"`)
   - `>= 1000000` -> M-abbreviated to 1 decimal place if non-zero (e.g., `"1.5M"`, `"25M"`)
   - Output length must not exceed 5 characters.

## Step 2: Implement `useStarredRepos` Data Hook
**Target**: `packages/ui-core/src/hooks/starred/useStarredRepos.ts`
**Export**: `packages/ui-core/src/hooks/starred/index.ts`

1. Import `usePaginatedQuery` from `../internal/usePaginatedQuery.js` and `useAPIClient`.
2. Implement and export `useStarredRepos(options?: UseStarredReposOptions)`:
   - Set `maxItems: 200` to cap memory usage to 10 pages.
   - Set `perPage: 20` to match the API contract (`GET /api/user/starred`).
   - Set `cacheKey: JSON.stringify({ starred: true, perPage })` to isolate the query cache.
   - Ensure `parseResponse` extracts the `X-Total-Count` header to populate `totalCount`.

## Step 3: Scaffold Shared `DashboardPanel` Component
**Target**: `apps/tui/src/components/DashboardPanel.tsx`

1. Create a functional component wrapping OpenTUI's `<box>`.
2. Props: `title`, `focused`, `index`, `total`, `isCompact`, `visible`, `children`.
3. Logic:
   - If `!visible`, return `null`.
   - Define `headerText`: If `isCompact` is true, format as `"{title} [{index+1}/{total}]"`; otherwise `"{title}"`.
   - Use `useTheme()` for colors. If `focused`, use `theme.primary` for the `borderColor`; otherwise `theme.border`.
   - Render a `<box borderStyle="single">` encompassing a `<box>` for the header and a `<box flexGrow={1}>` for `children`.

## Step 4: Implement `<StarredReposPanel />` Component
**Target**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx`

1. **Data Binding**: Invoke `useStarredRepos()`. Derive `filteredRepos` using `useMemo` to apply a client-side text filter on `repos.filter(...)` based on a local `filterQuery` state.
2. **State Management**:
   - `focusedIndex`: Track the active row. Clamp to `[0, filteredRepos.length - 1]`.
   - `filterActive`: Boolean to toggle the filter input (`<input>`).
   - `filterQuery`: String bound to the input.
3. **Layout & Responsiveness**:
   - Use `useLayout()` to get `breakpoint`. Map breakpoints:
     - `minimum` (80x24): single column (name truncated to 60, no description).
     - `standard` (120x40): show descriptions (truncated to 30).
     - `large` (200x60): wider columns, show bookmark badges.
   - Render items inside `<scrollbox onScrollEnd={() => fetchMore()}>` to enable auto-pagination when `focusedIndex` goes deep, or when manual scrolling reaches the threshold.
4. **Rendering Rows**:
   - Build individual `<box flexDirection="row">` items.
   - Use `truncateText` from `apps/tui/src/util/truncate.ts` for clean cutoffs.
   - Use `theme.success` for "◆" (public) and `theme.muted` for "◇" (private).
   - Apply `{ reverse: true }` property or primary background to the currently focused row.
5. **Keyboard Navigation**:
   - Inject `useScreenKeybindings(panelKeybindings)` gated by `when: () => props.focused`.
   - Standard navigation: `j/k`, `Down/Up`, `ctrl+d/u`, `G`, `gg`.
   - Filter activation: `/` to focus input, `Escape` to clear/blur.
   - Action: `Enter` resolves the focused repo, splits `owner/name`, and triggers `push(ScreenName.RepoOverview, { owner, repo })`.
6. **Error & Empty States**:
   - Map `isLoading` and empty results to UI feedback ("Loading...", "No starred repositories").
   - Implement retry functionality bounding `R` to `refetch()` when `error` is present.

## Step 5: Integrate with `DashboardScreen` Coordinator
**Target**: `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
**Target**: `apps/tui/src/screens/dashboard/index.ts`

1. Import `<StarredReposPanel />` and integrate into the 2x2 OpenTUI layout.
2. Manage `focusedPanel` state (0 to 3).
3. Wire `Tab` and `Shift+Tab` via `useScreenKeybindings` to cycle `focusedPanel`.
4. For layout breakpoints:
   - `< 120` width: Single column flex layout.
   - `>= 120` width: Two `<box flexDirection="row">` containers to create a grid.
5. Map `DashboardScreen` in `apps/tui/src/router/registry.ts` under `ScreenName.Dashboard`.

## Step 6: Testing Implementation

### 6.1 Unit Tests
**Target**: `e2e/tui/util-format-stars.test.ts`
1. Implement unit tests for `formatStarCount`.
2. Ensure cases cover boundary conditions (0, 999, 1000, 1500, 999999, 1000000) validating exact character output lengths (max 5).

### 6.2 End-to-End Tests
**Target**: `e2e/tui/dashboard-starred.test.ts`
1. Import `launchTUI`, `TERMINAL_SIZES`, and `TUITestInstance` from `./helpers.js`.
2. **Snapshots (SNAP-STAR)**: Mock API data/setup or rely on actual fixtures to capture rendering of 120x40 layouts, empty states, loading indicators, focused row reverse-video, visibility badges, and filter states.
3. **Keyboard (KEY-STAR)**: Use `tui.sendKeys()` to simulate `j`, `k`, `G`, `gg`, `/`, and `Enter`. Verify expected viewport changes and routing behavior (`tui.waitForText(...)`).
4. **Responsive (RESP-STAR)**: Utilize `tui.resize()` to trigger breakpoint collapses. Confirm `[3/4]` pagination headers appear at `minimum` width and `DashboardPanel` grid forms at `standard` width.
5. **Integration (INT-STAR)**: Verify boundary caps (like 200 items max), HTTP 429 behaviors, and preserved application state when navigating backward (`q`) from a repo screen.

## Implementation Guidelines
- Utilize the OpenTUI constraints exclusively: avoid raw DOM nodes, `console.log` for debug, or external side effects.
- Fallback gracefully for backend features that don't exist by asserting against the returned UI error strings (e.g., "Press R to retry").
- Emphasize precision on context dimensions and strict ANSI visual rules outlined in the `useTheme()` hook.
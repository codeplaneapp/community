# Implementation Plan: TUI_WORKFLOW_LIST_SCREEN

This plan outlines the steps to implement the Workflow Definition List Screen (`tui-workflow-list-screen`) for the Codeplane TUI, including required data hooks, UI utilities, sub-components, the main screen, and comprehensive E2E tests.

## 1. Define Types and Data Hooks

**File:** `apps/tui/src/hooks/workflow-types.ts`
- Create shared interfaces: `WorkflowDefinition`, `WorkflowRun`, `WorkflowRunStatus`, and `MiniRun`.
- Ensure types match the API responses from `GET /api/repos/:owner/:repo/workflows` and `/runs`.

**File:** `apps/tui/src/hooks/useWorkflowDefinitions.ts`
- Create `useWorkflowDefinitions(repo, options)` hook using `useRepoFetch()`.
- Implement page-based pagination (default 30 per page, capped at 300 items in memory).
- Return `{ definitions, loading, error, loadMore, hasMore }`.
- Include a secondary fetch or combined logic to retrieve the `runsSummary` (last 5 runs) for the mini status bar.

## 2. Implement UI Utilities

**File:** `apps/tui/src/screens/Workflows/utils.ts`
- Implement `getRunStatusIcon(status: WorkflowRunStatus)` returning appropriate icon and color token.
- Implement `getMiniStatusBar(recentRuns: MiniRun[])` to return exactly 5 characters representing recent run outcomes (padded with `·`).
- Implement formatting functions: `formatDuration()`, `formatRelativeTime()`, `formatRunCount()`.

## 3. Implement Sub-components

**File:** `apps/tui/src/screens/Workflows/MiniStatusBar.tsx`
- Create a functional component that accepts `recentRuns`.
- Utilize `getMiniStatusBar()` to render a `<box flexDirection="row">` containing 5 `<span>` elements with appropriate colors.

**File:** `apps/tui/src/screens/Workflows/WorkflowRow.tsx`
- Create the row component accepting a `WorkflowDefinition`, `latestRun`, `recentRuns`, `isFocused`, and `breakpoint`.
- Render columns conditionally based on the breakpoint (`minimum`, `standard`, `large`).
- Use reverse video styling (`bg="primary" fg="surface"`) when `isFocused` is true.
- Handle text truncation for name and path.

**File:** `apps/tui/src/screens/Workflows/DispatchOverlay.tsx`
- Create a modal component for manual dispatch confirmation.
- Use absolute positioning (`top="center" left="center"`) and border styling.
- Manage local loading state for the `POST /api/repos/:owner/:repo/workflows/:id/dispatches` request.
- Map `Enter` to confirm and `Esc` to cancel.

## 4. Implement Main Screen

**File:** `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx`
- Build the screen component, ensuring `useRepoContext()` is satisfied.
- Initialize state for `filterState` ('All' | 'Active' | 'Inactive') and `searchQuery`.
- Integrate `useWorkflowDefinitions` and manage data loading using `<FullScreenLoading>` and `<SkeletonList>`.
- Build the Filter Toolbar with a `<text>` indicator and an `<input>` for text search.
- Implement local filtering logic (applying `filterState` and `searchQuery` to the fetched definitions).
- Map keyboard interactions using `useScreenKeybindings()`:
  - `j`/`k`, `Up`/`Down`: List navigation.
  - `Enter`: `nav.push(ScreenName.WorkflowRunList, ...)`.
  - `/`: Focus search input.
  - `f`: Cycle `filterState`.
  - `d`: Open `DispatchOverlay`.
  - `Esc`: Clear search / pop screen.
  - `q`: Pop screen.
- Wrap the list in a `<scrollbox>` and attach an `onFetchMore` handler for pagination.

## 5. Register Screen and Routing

**File:** `apps/tui/src/screens/Workflows/index.ts`
- Export `WorkflowListScreen` and utilities.

**File:** `apps/tui/src/screens/index.ts`
- Add `export * from './Workflows/index.js';`.

**File:** `apps/tui/src/router/registry.ts`
- Replace the `PlaceholderScreen` mapped to `ScreenName.Workflows` with `WorkflowListScreen`.

## 6. Write E2E Tests

**File:** `e2e/tui/workflows.test.ts`
- Setup TUI test instance with mock credential store and API responses.
- **Snapshot Tests:** Capture standard, minimum, and large breakpoints; empty states; error states; and dispatch overlay.
- **Keyboard Tests:** Verify `j`/`k` navigation, `Enter` pushing to the run list, `/` search focus, `f` filter cycling, and `q`/`Esc` popping behavior.
- **Responsive Tests:** Validate column visibility and truncation rules at `80x24`, `120x40`, and `200x60`.
- **Integration Tests:** Verify rate limiting, 403 (Permission Denied) on dispatch, pagination loading limits, and auth routing.
- **Edge Case Tests:** Test very long workflow names, unicode characters, and definitions with no runs.
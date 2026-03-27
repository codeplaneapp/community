# Implementation Plan: TUI Dashboard Activity Feed

**Ticket:** `tui-dashboard-activity-feed`

This document outlines the step-by-step implementation for the Activity Feed panel on the Codeplane TUI dashboard, adhering to the Codeplane React 19 + OpenTUI architecture.

## Step 1: Create Formatting Utility

**File:** `apps/tui/src/util/relativeTime.ts`

Create a compact relative time formatter strictly capped at 6 characters. This is distinct from standard timestamp utilities since the dashboard activity feed displays timestamps at all breakpoints and requires a highly compact format (`now`, `m`, `h`, `d`, `mo`, `y`).

*   **Action**: Export a `relativeTime(isoString: string): string` function.
*   **Implementation details**: Calculate the time difference from `Date.now()` and return the largest meaningful unit.

## Step 2: Implement Data Hook

**File:** `packages/ui-core/src/hooks/dashboard/useActivity.ts`
**File:** `packages/ui-core/src/hooks/dashboard/index.ts`
**File:** `packages/ui-core/src/index.ts`

Implement the REST data hook for the activity feed, utilizing page-based pagination.

*   **Action**: Create `useActivity` hook.
*   **Implementation details**:
    *   Fetch from `/api/users/:username/activity?page=N&per_page=30`.
    *   Extract `X-Total-Count` header to set `totalCount`.
    *   Implement an internal state array `items` that appends new items on `loadMore()`.
    *   Cap maximum items at 300 to constrain memory growth.
    *   Include a `setFilter(type)` function that incorporates a 200ms debounce before resetting the list and fetching page 1.
    *   Ensure any in-flight requests are aborted using an `AbortController` when filters change or the component unmounts.
*   **Action**: Re-export `useActivity` from `hooks/dashboard/index.ts` and ensure it's exposed at the `ui-core` package root.

## Step 3: Define Constants and Layout Configurations

**File:** `apps/tui/src/screens/Dashboard/activityConstants.ts`

Centralize configuration for the panel, reducing clutter in the component.

*   **Action**: Create and export:
    *   `EVENT_TYPE_MAP`: Maps events (e.g., `repo.create`, `repo.delete`) to their respective string icons (e.g., `◆`, `✕`) and theme color tokens (e.g., `success`, `error`).
    *   `FILTER_CYCLE`: Array defining the cycle order for the `f`/`Shift+F` keys (All -> Created -> Forked -> Archived -> Transferred).
    *   `getActivityColumnLayout(breakpoint, width)`: A function returning layout bounds (whether to show icons, the summary text width limit, target type visibility, and timestamp width) dynamically based on terminal dimensions.
    *   Constants: `ACTIVITY_PAGE_SIZE = 30` and `ACTIVITY_MAX_ITEMS = 300`.

## Step 4: Build the Activity Feed Panel Component

**File:** `apps/tui/src/screens/Dashboard/ActivityFeedPanel.tsx`

Implement the visual component and its interaction state.

*   **Action**: Create `ActivityFeedPanel` component using OpenTUI `<box>`, `<scrollbox>`, and `<text>` primitives.
*   **Props**: Accept `focused`, `cursorIndex`, `onCursorChange`, `scrollOffset`, and `onScrollChange` from the parent dashboard grid orchestrator.
*   **Internal State**: Track `filterIndex`.
*   **Data Integration**: Call `useActivity` and `useUser` (from `ui-core`), and `useLayout`, `useTheme`, `useNavigation` (from TUI context).
*   **Behavior**:
    *   **Render Error/Loading/Empty states**: Check for `501` (Not Implemented - Activity feed not yet available) and `429` (Rate limited) to present customized inline error messages instead of generic crash screens.
    *   **Render List**: Iterate over `items`, using the column layout config to conditionally render icons, truncating text via `truncateText`, and highlighting the row `if (focused && index === cursorIndex)` using `theme.primary` as the background color.
    *   **Expose Handlers**: Expose navigation callbacks (`moveDown`, `moveUp`, `enter`, `filterForward`, `filterBackward`, `jumpToBottom`, `jumpToTop`, `pageDown`, `pageUp`, `retry`) by wrapping them in a standard JS object (or using `useImperativeHandle` with a `ref`) so the parent can delegate global key commands to it.
    *   **Telemetry/Observability**: Hook up `createLogger("dashboard:activity")` to log section load time, filter changes, and API errors.

## Step 5: Integrate Panel into Dashboard Screen

**File:** `apps/tui/src/screens/Dashboard/DashboardScreen.tsx`

Plug the new panel into the 2x2 grid and register the appropriate contextual keybindings.

*   **Action**: Import `ActivityFeedPanel` and place it in the bottom-right quadrant wrapped in the `<DashboardPanel>` component with `index={3}`.
*   **Action**: Route `useDashboardFocus()` state (`panelFocusState[PANEL.ACTIVITY_FEED]`) into the panel's props.
*   **Action**: Extend `useScreenKeybindings` to delegate inputs (`j`, `k`, `Enter`, `f`, `Shift+F`, `G`, `Ctrl+D`, `Ctrl+U`, `R`) to the `ActivityFeedPanel` when `focusedPanel === PANEL.ACTIVITY_FEED`.
*   **Action**: Integrate `g g` go-to mode override to call `jumpToTop()` on the focused panel.

## Step 6: End-to-End Testing

**File:** `e2e/tui/dashboard.test.ts`

Add exhaustive behavioral tests. *Note: Tests failing due to the known `501 Not Implemented` response must be written correctly and left to fail as regression signals.* 

*   **Action**: Append a `describe("TUI_DASHBOARD_ACTIVITY_FEED")` suite.
*   **Snapshot Tests**: Add tests verifying structural rendering: initial load, loading state, empty state, error states (especially the 501 fallback), focused row styling, event icons, active filter header, pagination loader presence, and relative timestamps.
*   **Keyboard Tests**: Verify `j`/`k` (movement), `Enter` (navigation dispatch), `f`/`Shift+F` (filter cycling), `G`/`gg` (scroll jumps), and `Ctrl+D`/`Ctrl+U` (paging). Ensure `j` on the last item correctly triggers pagination logic.
*   **Responsive Tests**: Assert layout changes when resized. (e.g., minimum 80x24 hides icons; large 200x60 shows target type).
*   **Integration Tests**: Assert auth expiry handling (`401` -> shell auth), rate limit handling, and simultaneous grid updates without state collisions.

## Next Steps / PR Generation
Following this plan will result in a fully keyboard-navigable Activity Feed pane that scales cleanly across dimensions and gracefully degrades on the current API stubs (501).
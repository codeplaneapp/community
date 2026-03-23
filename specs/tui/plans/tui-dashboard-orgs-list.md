# Implementation Plan: `tui-dashboard-orgs-list`

This document outlines the step-by-step implementation plan for the Organizations panel on the Codeplane TUI Dashboard. It incorporates all requirements from the engineering specification, addresses missing dependencies with temporary stubs, and ensures production-ready code with comprehensive E2E tests.

## Phase 1: Foundation and Utilities

### Step 1.1: Grapheme-Aware Truncation (Productionization)
**Target File:** `apps/tui/src/util/truncate.ts`
-   **Action:** Update the existing truncation utility to handle CJK characters and emojis correctly.
-   **Details:**
    -   Implement `truncateTextGrapheme(text: string, maxWidth: number)` using `Intl.Segmenter`.
    -   Modify the default `truncateText` function to route to `truncateTextGrapheme` when non-ASCII characters are detected, or use it as the default implementation.

### Step 1.2: Define Responsive Column Configurations
**Target File:** `apps/tui/src/screens/Dashboard/orgs-panel-columns.ts`
-   **Action:** Create this new file to store pure-data column layouts and constants.
-   **Details:**
    -   Define `ORG_COLUMNS` with specific widths and visibility flags for `minimum`, `standard`, and `large` breakpoints.
    -   Implement the `visibilityColorToken(visibility: string)` helper.
    -   Export constants: `ORGS_PAGINATION_CAP = 500`, `ORGS_PER_PAGE = 20`, and `ORGS_FILTER_MAX_LENGTH = 100`.

## Phase 2: Stubs for Missing Dependencies

Since `@codeplane/ui-core` is currently absent and other Dashboard infrastructure might not be merged yet, we must create isolated local stubs to proceed.

### Step 2.1: Stub Data Hook
**Target File:** `apps/tui/src/screens/Dashboard/__stubs__/useOrgs.ts`
-   **Action:** Create a mock `useOrgs` hook that mimics the future `@codeplane/ui-core` API.
-   **Details:** Return simulated data, `totalCount`, `isLoading`, `error`, `hasMore`, `loadMore`, and `retry`. Support pagination logic internally using standard fixtures.

### Step 2.2: Stub Dashboard Shell and Focus Manager
**Target File:** `apps/tui/src/screens/Dashboard/__stubs__/DashboardStubs.tsx`
-   **Action:** Create minimal pass-through components.
-   **Details:**
    -   Create `DashboardPanel` that renders an OpenTUI `<box>` with a border and title.
    -   Create a minimal `useDashboardFocus()` and `useDashboardKeybindings()` mock if necessary to allow isolated testing of the `OrgsPanel`.

## Phase 3: State Management

### Step 3.1: Create Data and State Hook
**Target File:** `apps/tui/src/screens/Dashboard/useOrgsPanel.ts`
-   **Action:** Implement the centralized state hook for the panel.
-   **Details:**
    -   Consume the mock `useOrgs` (or real if available).
    -   Integrate `usePaginationLoading` from `apps/tui/src/hooks/usePaginationLoading.ts`.
    -   Implement client-side filtering logic with memoization.
    -   Implement load-time tracking using `useRef` for the `load_time_ms` telemetry.
    -   Add structured error parsing: propagate `401` errors up (rely on `APIClientProvider`), and extract the `Retry-After` header for `429` errors.
    -   Emit all required telemetry events (`tui.dashboard.orgs.*`) and structured logs using the shared libraries.

## Phase 4: UI Components

### Step 4.1: Implement the Panel Component
**Target File:** `apps/tui/src/screens/Dashboard/OrgsPanel.tsx`
-   **Action:** Build the presentational React component.
-   **Details:**
    -   Use `DashboardPanel` (from stubs or `tui-dashboard-panel-component`).
    -   Implement the `OrgRow` sub-component utilizing `useTheme` and `visibilityColorToken`.
    -   Render rows using `<scrollbox>`.
    -   Implement the `onScroll` handler on the `<scrollbox>` to trigger `panel.loadMore()` when scroll reaches 80% and emit the `paginate` telemetry.
    -   Mount `<PaginationIndicator>` at the bottom of the list.
    -   Display the pagination cap message when `isCapped` is true.

### Step 4.2: Integrate into Dashboard Screen
**Target File:** `apps/tui/src/screens/Dashboard/index.tsx`
-   **Action:** Wire the `OrgsPanel` into the overall Dashboard grid.
-   **Details:**
    -   Mount `<OrgsPanel>` in the top-right quadrant (Panel Index 1).
    -   Update `panelItemCounts` in the focus manager to include `orgsPanel.filteredOrgs.length`.
    -   Wire up keyboard callbacks: route `onSelect` to `openOrg`, `onRetry` to `retry`, `onFilter` to `activateFilter`, etc.

## Phase 5: Testing

### Step 5.1: Write E2E Tests
**Target File:** `e2e/tui/dashboard.test.ts`
-   **Action:** Implement the comprehensive test suite utilizing `@microsoft/tui-test`.
-   **Details:**
    -   Create test fixtures matching the spec.
    -   Implement the `navigateToOrgsPanel(tui)` helper.
    -   **Snapshot Tests (13):** Initial load, empty state, loading, error, visibility badges, filter results, etc.
    -   **Keyboard Interactions (25):** Validate `j`/`k` movement, `Enter`, `/` for filtering, `G`/`gg`, `Ctrl+D`/`Ctrl+U`, and rapid key presses.
    -   **Responsive Tests (11):** Simulate terminal resizing across `80x24`, `120x40`, and `200x60`, asserting column visibility and truncation.
    -   **Integration Tests (14):** Test 401 propagation, 429 rate limit displays, 500-item cap, Unicode rendering, and real API integrations (leave failing if the backend route is missing).

## Phase 6: Review and Cleanup

-   **Action:** Final sweep of the codebase.
-   **Details:**
    -   Ensure all TODOs regarding the replacement of local stubs with real `@codeplane/ui-core` imports are clearly marked.
    -   Verify that no errors are swallowed silently.
    -   Run the E2E test suite locally and verify that snapshot diffs are expected.
# Implementation Plan: TUI Issue List Screen

## Overview
This plan details the step-by-step implementation of the Codeplane TUI Issue List Screen using React 19, OpenTUI, and `@codeplane/ui-core`, strictly adhering to terminal constraints and responsive behavior specs.

## Step 1: Define Types and Column Configuration
**File:** `apps/tui/src/screens/Issues/types.ts`
- Create the shared configuration file exporting the `IssueStateFilter` type (`"open" | "closed" | ""`).
- Define `COLUMN_CONFIGS` explicitly mapping terminal breakpoints (`minimum`, `standard`, `large`) to fixed character widths for `stateIcon`, `number`, `labels`, `assignee`, `comments`, `milestone`, and `timestamp`.
- Set and export `MINIMUM_FIXED_WIDTH`, `PAGE_SIZE` (30), and `MEMORY_CAP` (500).
- Define and export `STATE_FILTER_CYCLE` and `STATE_FILTER_LABELS` constants.

## Step 2: Implement Formatting Utilities
**File:** `apps/tui/src/screens/Issues/format.ts`
- Implement `formatRelativeTime(isoString: string): string` to render compact timestamps (e.g., `now`, `3m`, `2h`, `5d`). Handle `NaN` edge cases safely.
- Implement `formatCount(n: number): string` to generate K-abbreviated counters (`0`, `42`, `1K`, `99K+`).
- Implement `formatTotalCount(n: number): string` to format header totals cleanly.

## Step 3: Implement Telemetry Emitters
**File:** `apps/tui/src/screens/Issues/telemetry.ts`
- Create typed event emitters: `emitIssueListView`, `emitIssueOpen`, `emitStateFilterChange`, `emitCloseReopen`, `emitPaginate`, and `emitError`.
- Expose these functions so they can be triggered from React side-effects and keybinding handlers within the screen component.

## Step 4: Implement the IssueRow Component
**File:** `apps/tui/src/screens/Issues/IssueRow.tsx`
- **Dependencies:** Consumes `useLayout()` to identify breakpoints and `<LabelBadgeList>` (provided by `tui-label-badge-component`).
- **Layout:** Use OpenTUI `<box height={1}>` and `<text>` components.
- **Behavior:** Compute dynamic title width at the `minimum` breakpoint (`terminalWidth - MINIMUM_FIXED_WIDTH`).
- **Styling:** Apply `theme.success`/`theme.error` for state icons, apply `attributes={7}` for focus highlights, and conditionally render columns (Labels, Assignee, Comments) based on the current breakpoint.
- **Safety:** Render optional/null fields gracefully as blank strings to avoid rendering "null".

## Step 5: Implement the FilterToolbar Component
**File:** `apps/tui/src/screens/Issues/FilterToolbar.tsx`
- **Layout:** Build a responsive row detailing current active filters.
- **Behavior:** Conditionally display Labels and Assignee summaries only on `standard` or `large` breakpoints.
- **Search Mode:** When `searchFocused` is toggled true, reveal a secondary row prefixed with `/ ` and an OpenTUI `<input>` to trap keyboard events for substring filtering.

## Step 6: Implement Filter Overlays
**File:** `apps/tui/src/screens/Issues/LabelFilterOverlay.tsx`
- **Layout:** Implement an `<box position="absolute">` component sized dynamically relative to `modalWidth`/`modalHeight` via `useLayout()`.
- **Behavior:** Render a `<scrollbox>` showing labels and tracking checkboxes (`[✓]`). Register an isolated keybinding scope (`PRIORITY.MODAL`) via `useEffect` to manage `j/k` traversal and `Space` toggling. 

**File:** `apps/tui/src/screens/Issues/AssigneeFilterOverlay.tsx`
- **Layout:** Provide a focused modal (40%×50% standard).
- **Behavior:** Render a single-select list allowing navigation over `All`, `Unassigned`, and valid mapped collaborators. Automatically invoke the selection on `Enter` and unmount.

## Step 7: Implement Main IssueListScreen
**File:** `apps/tui/src/screens/Issues/IssueListScreen.tsx`
- **Data Connectivity:** Hook into `@codeplane/ui-core` using `useIssues`, `useRepoLabels`, `useRepoCollaborators`, and `useUpdateIssue`.
- **State Management:** Track client-side states (`stateFilter`, `searchText`, `selectedRows`, `focusIndex`, `overlayActive`).
- **Client Filter Pipeline:** Transform raw data through memory caps -> Label AND matching -> Assignee match -> Case-insensitive search -> Layout.
- **Optimistic UI:** Utilize `useOptimisticMutation` mapping the `x` keystroke to immediately toggle visual issue state mapped via `optimisticStates`, falling back gracefully on `onRevert`.
- **Keybindings:** Implement robust `useScreenKeybindings` (list mode vs searching mode) managing navigation (`j`, `k`, `G`, `/`, `f`), modal invocation (`L`, `a`, `c`), and the special double-tap `g g` tracking fallback.
- **Pagination:** Wire `<scrollbox onScroll>` to evaluate scroll offset against an 80% threshold triggering `usePaginationLoading`'s `loadMore()`.
- **Observability:** Emit standard telemetry hooks mapped in Step 3 and write operational logs to `process.stderr` reflecting status shifts and error boundaries.

## Step 8: Standardize Exports
**File:** `apps/tui/src/screens/Issues/index.ts`
- Barrel export the implementations: `IssueListScreen`, `IssueRow`, `FilterToolbar`, `LabelFilterOverlay`, and `AssigneeFilterOverlay`.

## Step 9: Establish E2E Testing Suite
**File:** `e2e/tui/issues.test.ts`
- Scaffold tests using `@microsoft/tui-test` and local `helpers.js` mock wrappers.
- Author the 131 test scenarios exactly as spec'd: Snapshot validations covering loading/empty/data states across breakpoints; keyboard interaction flows (scrolling, selecting, escaping contexts); resizing robustness handling synchronous window changes; and critical network integration edge cases.
# Engineering Specification: TUI_SEARCH_ISSUES_TAB

## Overview
This document outlines the engineering plan for implementing the **Issues tab** on the Codeplane TUI global search screen (`TUI_SEARCH_ISSUES_TAB`). This feature introduces cross-repository issue discovery via the `GET /api/search/issues` endpoint, responsive terminal layout adaptations, server-side state filtering, cursor-based pagination, and keyboard-first interactions.

---

## Implementation Plan

### Phase 1: Core Components Scaffold
**Target Files:**
- `apps/tui/src/screens/search/components/IssueSearchRow.tsx`
- `apps/tui/src/screens/search/tabs/IssuesTab.tsx`
- `apps/tui/src/screens/search/SearchScreen.tsx` (Update)

**1. Create `IssueSearchRow.tsx`**
Implement the responsive row component using OpenTUI primitives (`<box>`, `<text>`) and the theme system.
- Consume `useTheme()` for ANSI-mapped colors (`primary` for issue number, `success`/`error` for state badge, `muted` for repository context and timestamp).
- Consume `useLayout()` to conditionally render columns based on the `breakpoint` (`minimum`, `standard`, `large`).
- Implement truncation for `repository_owner/repository_name` (max 30 chars) and `title` (remaining width) using a custom string truncation utility aware of terminal character widths.

**2. Create `IssuesTab.tsx`**
Set up the layout wrapper for the tab content.
- Implement the optional state filter bar at the top (rendered conditionally if `breakpoint !== "minimum"`).
- Instantiate `<ScrollableList>` (from the TUI shared components) or a wrapped `<scrollbox>` to manage the rows.

### Phase 2: Data Integration & State Management
**Target Files:**
- `apps/tui/src/screens/search/tabs/IssuesTab.tsx`

**1. Hook Consumption**
- Integrate `const { data, loading, error, loadMore, hasMore } = useSearch().searchIssues(query, { state: stateFilter });` from `@codeplane/ui-core`.
- Manage local state for the filter: `const [stateFilter, setStateFilter] = useState<"all" | "open" | "closed">("all");`.

**2. Keyboard Interactions & Filtering**
- Register keybindings scoped to the active tab using `useScreenKeybindings`:
  - `o`: Cycles `stateFilter` (`all` → `open` → `closed` → `all`).
  - `Enter`: Reads the currently focused item from the list, calls `navigation.push("IssueDetail", { owner, repo, number })`.
  - `/`: Defers focus back to the parent `SearchScreen` input.
  - `R`: Triggers refetch on error state.

**3. Pagination & Focus**
- Pass `onFetchMore={loadMore}` to `<ScrollableList>`. Ensure pagination caps at 300 items by maintaining a derived `capReached` boolean.
- Manage scroll restoration/focus state so that switching tabs (via parent `SearchScreen` tab manager) caches the focused index and restores it when the user returns.

### Phase 3: Parent Integration & Routing
**Target Files:**
- `apps/tui/src/screens/search/SearchScreen.tsx`
- `apps/tui/src/navigation/screenRegistry.ts` (if `IssueDetail` navigation needs routing params checked)

**1. Search Screen Wiring**
- Update the `SearchScreen` tab switcher to render `<IssuesTab query={debouncedQuery} isActive={activeTab === 'issues'} />`.
- Pass the correct total counts to the Search header tab badges (e.g., `Issues (12)` or `Issues (15k+)`).

### Phase 4: Edge Cases & Telemetry
- **Empty / Error States:** Render dedicated error screens inline using `<box>` when `error` is present or `data.items.length === 0`. Handle 429 Rate Limits explicitly via HTTP status checks from the hook's error object.
- **Telemetry:** Add `useEffect` observers to fire `tui.search.issues_tab.viewed`, `tui.search.issues_tab.result_opened`, and `tui.search.issues_tab.filter_changed` using the application's telemetry context.

---

## Unit & Integration Tests

The testing strategy uses `@microsoft/tui-test` framework and Bun's test runner, targeting `e2e/tui/search-issues.test.ts`.

### 1. Terminal Snapshot Tests
*Objective: Verify visual structure and responsive layouts without regressions.*
- **`SNAP-SEARCH-ISSUES-001`**: Render at 120x40 (Standard) - Assert full row format includes repo context, #number, title, state badge, and timestamp.
- **`SNAP-SEARCH-ISSUES-002`**: Render at 80x24 (Minimum) - Assert compact row format drops repo context and timestamp; badge is icon only.
- **`SNAP-SEARCH-ISSUES-003`**: Render at 200x60 (Large) - Assert expanded bounds.
- **`SNAP-SEARCH-ISSUES-004 to 007`**: Snapshots for Empty State, Loading State, Error State (including "Press R to retry"), and Rate Limited state.
- **`SNAP-SEARCH-ISSUES-010 to 013`**: State filter bar visibility and toggle updates (All/Open/Closed text highlighting).
- **`SNAP-SEARCH-ISSUES-015`**: Ensure `…` truncation renders correctly on long titles.

### 2. Keyboard Interaction Tests
*Objective: Ensure vim-bindings and core functional keystrokes apply changes accurately.*
- **`KEY-SEARCH-ISSUES-001 to 003`**: Send `2` to activate tab, send `j`/`k`, `Down`/`Up` to assert cursor (reverse video) moves correctly across rows.
- **`KEY-SEARCH-ISSUES-004`**: Focus row, send `Enter`, assert breadcrumb updates to `Search > owner/repo > Issues > #N`.
- **`KEY-SEARCH-ISSUES-005`**: Send `q` from Issue Detail; assert return to Search screen with Issues tab still active and cursor position maintained.
- **`KEY-SEARCH-ISSUES-010`**: Send `o`, assert state filter cycles from "All" to "Open", and API request is dispatched with `state=open`.
- **`KEY-SEARCH-ISSUES-012`**: Send `/`, assert text cursor is placed back in the top search input box.

### 3. Responsive Layout Tests
*Objective: Ensure dynamic resize signals (`SIGWINCH`) are handled synchronously.*
- **`RESIZE-SEARCH-ISSUES-004`**: Start TUI at 120x40. Call `terminal.resize(80, 24)`. Assert state filter bar unmounts and text layout truncates immediately.
- **`RESIZE-SEARCH-ISSUES-006`**: Scroll down 10 items. Resize terminal. Assert focus remains on item 10 without list wrap/reset.

### 4. Integration Tests
*Objective: Validate end-to-end data flow with mocked or local-daemon API responses.*
- **`INT-SEARCH-ISSUES-001`**: End-to-end flow: dispatch search query `api timeout` → tab to Issues → await loading → scroll → select row → return.
- **`INT-SEARCH-ISSUES-003 & 004`**: Trigger scroll position > 80%. Assert `GET /api/search/issues?page=2` is fired. Repeat until 300 items are cached; assert pagination stops.
- **`INT-SEARCH-ISSUES-008`**: Dispatch query, while loading, press `o` to change filter. Assert first request is aborted/ignored and new filtered request is used.
- **`INT-SEARCH-ISSUES-014`**: Provide a test fixture with unicode emojis in the title and assert grapheme-aware truncation doesn't corrupt layout alignment.

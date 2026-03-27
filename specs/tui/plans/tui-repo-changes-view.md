# Implementation Plan: tui-repo-changes-view

## 1. Overview
This plan implements the "Repository changes tab view with jj change history" for the Codeplane TUI. The feature introduces a new `ChangesTab` within the `RepoOverviewScreen` that displays a paginated, filterable, and sortable list of jj changes.

## 2. Step-by-Step Implementation

### Step 1: Utility Functions
**Files:**
- `apps/tui/src/util/relative-time.ts` (New)
- `apps/tui/src/util/format.ts` (Modify)

**Actions:**
1. Create `relative-time.ts` and implement `formatRelativeTime(timestamp, maxChars)` supporting short (e.g., `3d`) and long (e.g., `3 days ago`) formats based on available width.
2. Open `format.ts` and add `formatCompactCount(count)` to abbreviate large numbers (e.g., `1.2k`, `1.5M`).

### Step 2: Types, Filtering, and Tree Logic
**Files:**
- `apps/tui/src/screens/Repository/tabs/changes-types.ts` (New)
- `apps/tui/src/screens/Repository/tabs/changes-filter.ts` (New)
- `apps/tui/src/screens/Repository/tabs/tree-indicators.ts` (New)

**Actions:**
1. **Types:** Define `ChangesSortOrder`, `SORT_LABELS`, `SORT_CYCLE`, `ChangeWithTree`, `ChangeColumnLayout`, and pagination constants (`CHANGES_PAGE_SIZE=50`, etc.) in `changes-types.ts`.
2. **Filtering:** Implement `filterChanges(changes, query)` and `findMatchRanges(text, query)` in `changes-filter.ts` to support case-insensitive substring matching.
3. **Tree Logic:** Implement `computeTreeIndicators(changes, sortOrder)` in `tree-indicators.ts` to compute parent-child tree glyphs (`├`, `└`, `│`) for the `"newest"` sort order, capping depth at 1.

### Step 3: `useChanges` Hook and UI-Core Export
**Files:**
- `specs/tui/packages/ui-core/src/hooks/changes/useChanges.ts` (New)
- `specs/tui/packages/ui-core/src/index.ts` (Modify)

**Actions:**
1. Create `useChanges.ts`. Use the existing `usePaginatedQuery` hook to fetch data from `/api/repos/${owner}/${repo}/changes?sort=${sort}`.
2. Extract the total count from the `X-Total-Count` header in the `parseResponse` callback.
3. Export `useChanges` and `ChangesOptions` from the barrel file `specs/tui/packages/ui-core/src/index.ts`.

### Step 4: Add Screen Registration and Theme Token
**Files:**
- `apps/tui/src/router/types.ts` (Modify)
- `apps/tui/src/router/registry.ts` (Modify)
- `apps/tui/src/theme/tokens.ts` (Modify)

**Actions:**
1. In `types.ts`, add `ChangeDetail = "ChangeDetail"` to the `ScreenName` enum if not already present.
2. In `registry.ts`, register `[ScreenName.ChangeDetail]` using `PlaceholderScreen`.
3. In `tokens.ts`, ensure `warning_bg` is defined in the theme provider.

### Step 5: Presentational Components
**Files:**
- `apps/tui/src/screens/Repository/tabs/ChangesHeader.tsx` (New)
- `apps/tui/src/screens/Repository/tabs/ChangeRow.tsx` (New)

**Actions:**
1. **Header:** Create `ChangesHeader.tsx` to display the "N changes" count (or "M of N" when filtered) and the current sort label using `formatCompactCount`.
2. **Row:** Create `ChangeRow.tsx` to render individual changes according to the `ChangeColumnLayout`. Apply reverse video for focus, warning background for conflicts, and dim attributes for empty changes. Include tree indicators conditionally.

### Step 6: Entry Component (`ChangesTab`)
**Files:**
- `apps/tui/src/screens/Repository/tabs/ChangesTab.tsx` (New)

**Actions:**
1. Implement the main orchestrator component.
2. Wire up `useRepoContext`, `useChanges`, `useScreenKeybindings`, `useScreenLoading`, and `useLayout`.
3. Manage local states: `sortOrder`, `focusedIndex`, `filterActive`, `filterQuery`, and `selectedSet`.
4. Register the required keybindings (`j/k`, `Enter`, `d`, `/`, `Escape`, `o`, `G`, `g→g`, `ctrl+d/u`, `Space`, `R`).
5. Render `SkeletonList` for loading, error views, empty states, and the `scrollbox` containing `ChangeRow`s and the `PaginationIndicator`. Ensure scroll threshold pagination triggers dynamically.
6. Emit correct telemetry events for viewing, navigating, filtering, and sorting.

### Step 7: Tab Registration
**Files:**
- `apps/tui/src/screens/Repository/tabs/index.ts` (Modify)

**Actions:**
1. Replace `PlaceholderTab` with `ChangesTab` for the index 2 ("Changes") slot in the `REPO_TABS` array.

### Step 8: Unit and E2E Tests
**Files:**
- `e2e/tui/repository.test.ts` (Modify)

**Actions:**
1. **Unit Tests:** Add tests for `formatRelativeTime`, `formatCompactCount`, `filterChanges`, `computeTreeIndicators`, and `findMatchRanges`.
2. **Snapshot Tests:** Write tests capturing initial load, empty repo, conflict highlights, layout structures at 80x24 and 120x40 breakpoints, filter active, and sort labels.
3. **Keyboard Tests:** Simulate `j`, `k`, `Enter`, `d`, `/`, `Escape`, `o`, `G`, `g`, `ctrl+d`, and `Space`.
4. **Responsive & Integration Tests:** Test resizing, tab switching (unmount/remount), and sorting refetch behavior.
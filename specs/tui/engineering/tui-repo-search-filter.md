## Implementation Plan

### 1. Define Filter State and Types
**File**: `apps/tui/src/components/repo/types.ts`
- Define `FilterDimension` enum (`state`, `label`, `assignee`, `sort`).
- Define `RepoSearchConfig` to specify which dimensions are available for a given sub-screen.
- Define `RepoSearchState` interface holding `query` (string), `activeFilters` (Record of dimension to value), `isFocused` (boolean).

### 2. Search & Filter State Hook
**File**: `apps/tui/src/components/repo/useRepoSearch.ts`
- Implement `useRepoSearch(config: RepoSearchConfig)` hook.
- Manages local React state for `query` and `filters`.
- Implements a `debouncedQuery` state (using a 300ms timeout) to be passed to server-side API hooks.
- Provides mutation methods: `setQuery`, `clearQuery`, `cycleFilter(dimension)`, `clearAllFilters`, `setFocus(bool)`.
- Uses a `useEffect` on `navigationContext.currentScreen.id` to reset search/filter state when the user navigates to a different repository tab/sub-screen.

### 3. Search Input Component
**File**: `apps/tui/src/components/repo/RepoSearchInput.tsx`
- Build a component using OpenTUI's `<box>` and `<input>`.
- Renders `🔍` icon followed by the input field.
- Displays `matchedCount` and `totalCount` on the right side.
- Accepts `maxLength={120}`.
- Intercepts key events when focused via `onKeyPress` or an active keybinding scope:
  - `Esc`: Call `clearQuery()` and `setFocus(false)`.
  - `Enter`: Call `setFocus(false)` but retain query.
  - `Ctrl+U`: Call `clearQuery()`.
  - `Backspace`: Standard behavior.

### 4. Filter Toolbar Component
**File**: `apps/tui/src/components/repo/RepoFilterToolbar.tsx`
- Build a responsive toolbar using `useLayout()` to read `breakpoint` (`minimum`, `standard`, `large`).
- **Minimum (80x24)**: Render abbreviated badges for active filters (e.g., `[open] [alice]`). Max 8 chars per badge.
- **Standard (120x40)**: Render full labels using OpenTUI `<text>` with theme colors (e.g., `State: Open │ Assignee: alice │ Sort: Recent`).
- **Large (200x60+)**: Render labels with matching counts.
- **Inactive State**: If no query and no active filters, render a muted hint line indicating available shortcuts (e.g., `/:search f:state a:assignee o:sort`).

### 5. Client-Side Filtering Utility
**File**: `apps/tui/src/utils/repoFilters.ts`
- Implement `applyClientSideFilters<T>(items: T[], query: string, filters: Record<string, string>, type: 'issues' | 'files' | 'bookmarks' | 'changes' | 'wiki')`.
- Case-insensitive substring matching using grapheme-aware logic (if supported by environment, else `Intl.Segmenter` or basic `.toLowerCase()`).
- Branch logic based on `type`:
  - `issues`: check `title`, `body`, and `labels`.
  - `files`: check `path`.
  - `bookmarks`: check `name`.

### 6. Sub-Screen Integration
**Files**: 
- `apps/tui/src/screens/repo/IssueListScreen.tsx`
- `apps/tui/src/screens/repo/LandingListScreen.tsx`
- `apps/tui/src/screens/repo/BookmarkListScreen.tsx`
- `apps/tui/src/screens/repo/CodeExplorerScreen.tsx`
- (And other sub-screens defined in spec)

**Integration Steps for each sub-screen**:
1. Initialize `useRepoSearch({ dimensions: [...] })`.
2. Register list-focused keybindings using `useScreenKeybindings`:
   - `/`: calls `setFocus(true)` on search.
   - `f`, `l`, `a`, `o`: calls `cycleFilter(dim)`. (No-op if search is currently focused).
3. Data Routing:
   - For lists < 200 items (like Bookmarks), use `applyClientSideFilters` on the data returned by `@codeplane/ui-core` hooks.
   - For lists > 200 items (like Issues), pass `debouncedQuery` and mapped filter params to the underlying `useIssues` hook to trigger server-side filtering.
4. Render layout:
   - `<RepoSearchInput>`
   - `<RepoFilterToolbar>`
   - `<ScrollableList>` (the content list)
   - If `matchedCount === 0`, render `<RepoSearchEmptyState>`.

### 7. Empty State Component
**File**: `apps/tui/src/components/repo/RepoSearchEmptyState.tsx`
- A centered `<box>` layout displaying: `"No results match the current filters."`
- Muted subtitle: `"Press Esc to clear search, or adjust filters."`
- Renders in place of the `<ScrollableList>` when results are empty, keeping the toolbar visible.

## Unit & Integration Tests

All tests will be placed in `e2e/tui/repository.test.ts` using `@microsoft/tui-test`.

### 1. Terminal Snapshot Tests
- **`repo-search-filter-inactive-state`**: Navigate to `Issues` tab at 120x40. Verify snapshot captures the hint line in muted text below the tab bar.
- **`repo-search-filter-input-focused`**: Press `/`. Verify snapshot captures the `🔍` icon, blinking cursor, and "0 of N" count.
- **`repo-search-filter-query-typed`**: Press `/`, type `auth`. Verify snapshot shows `🔍 auth█`, matched counts updated, and the list narrowed.
- **`repo-search-filter-zero-results`**: Type a non-existent string. Verify snapshot captures the centered empty state message with the toolbar still visible.
- **`repo-search-filter-toolbar-standard`**: At 120x40, press `f`. Verify snapshot displays `State: Open │ Sort: ...`.
- **`repo-search-filter-toolbar-minimum`**: At 80x24, press `f`. Verify snapshot displays `[open]` badge.
- **`repo-search-filter-toolbar-large`**: At 200x60, press `f`. Verify snapshot displays labels with counts `State: Open (15)`.

### 2. Keyboard Interaction Tests
- **`repo-search-slash-focuses-input`**: Assert that pressing `/` traps focus, preventing `j`/`k` from scrolling the list, and types literals in the input.
- **`repo-search-esc-clears-and-returns`**: Focus input, type `test`, press `Esc`. Assert query clears and list regains focus.
- **`repo-search-cycle-filters`**: With list focused, press `f` multiple times. Assert state filter cycles (e.g., All -> Open -> Closed -> All). Verify `a` (assignee) and `o` (sort) similarly.
- **`repo-search-input-shortcuts`**: Inside the input, test `Ctrl+U` clears text, `Backspace` removes last character, and `Enter` blurs input while preserving query.
- **`repo-search-noop-unavailable-filters`**: On the `Bookmarks` tab (where `f` is unavailable), press `f`. Assert no changes occur.

### 3. Responsive Behavior Tests
- **`repo-search-resize-preserves-state`**: Type a query and apply filters. Resize terminal from 120x40 to 80x24. Assert input remains focused, filters persist, but the toolbar re-renders as abbreviated badges.
- **`repo-search-truncation`**: Type >120 characters into the search input. Assert input stops accepting characters at 120. Verify visually that text is truncated from the left.

### 4. Integration & Debounce Tests
- **`repo-search-server-side-debounce`**: Type `a`, `u`, `t`, `h` rapidly. Assert that the server-side API mock is only called once after the 300ms debounce interval, rather than 4 times.
- **`repo-search-client-side-instant`**: On a client-filtered list (e.g., Bookmarks), type rapidly. Assert results filter synchronously with zero delay.
- **`repo-search-reset-on-navigation`**: Set query `auth` and state `Open` on Issues tab. Switch to `Landings` tab. Assert filters are reset to defaults. Switch back to `Issues`, assert they remain defaults.
- **`repo-search-error-recovery`**: Mock a 500 error on the search API. Verify inline error `"Search failed. Press R to retry."` replaces the list. Press `R` and assert a successful retry re-renders the list.
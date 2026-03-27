# Engineering Specification: TUI_SEARCH_INLINE_FILTER

## 1. Product Specification

**Ticket:** `tui-search-inline-filter-feature`
**Title:** TUI_SEARCH_INLINE_FILTER — Per-tab inline filtering with filter bar and picker modals
**Type:** Feature
**Dependencies:** `tui-search-filter-infrastructure`, `tui-search-screen-feature`, `tui-search-repos-tab-feature`, `tui-search-issues-tab-feature`, `tui-search-code-tab-feature`

### 1.1 Feature Overview
Implement per-tab inline filtering on the global search screen. The filter bar allows users to narrow search results within a specific tab without modifying the global query. 

- **Toggle**: `f` toggles the filter bar visibility.
- **Scope**: Filters are tab-local and session-scoped.
- **Tabs & Capabilities**:
  - **Issues**: `o` cycles state (server-side), `l` opens label picker (multi-select, client-side), `r` opens repo picker (single-select, client-side).
  - **Repositories**: `v` cycles visibility (client-side), `l` opens language picker (single-select, client-side).
  - **Code**: `l` opens language picker, `r` opens repo picker (both client-side).
  - **Users**: No inline filters.
- **Interactions**: Picker modals support fuzzy search. `x` clears all tab-local filters. 
- **Server vs. Client**: Server-side changes (e.g., issue state) re-query the API. Client-side changes apply against loaded results and show a `(showing M of N)` indicator.
- **Responsive Design**: Collapses to a condensed format at 80x24 minimum resolution.

---

## 2. Implementation Plan

### Phase 1: Filter State Management & Context
1. **Create `apps/tui/src/screens/search/SearchFilterContext.tsx`**
   - Implement a React Context to manage filter states across tabs.
   - **State definitions**:
     - `issues`: `{ state: 'all' | 'open' | 'closed', labels: Set<string>, repo: string | null }`
     - `repositories`: `{ visibility: 'all' | 'public' | 'private', language: string | null }`
     - `code`: `{ language: string | null, repo: string | null }`
   - Expose `updateIssueFilter`, `updateRepoFilter`, `updateCodeFilter`, and `clearTabFilters(tab)` functions.
2. **Integrate Context in `SearchScreen.tsx`**
   - Wrap the tab contents with `SearchFilterProvider`.
   - Add local state `const [filterBarVisible, setFilterBarVisible] = useState(false)` to `SearchScreen`.

### Phase 2: Filter Bar Component
1. **Create `apps/tui/src/screens/search/FilterBar.tsx`**
   - Render conditionally based on `filterBarVisible` and `activeTab !== 'users'`.
   - Use `useTerminalDimensions()` to determine the current layout breakpoint (`minimum`, `standard`, `large`).
   - **Minimum Layout (< 120 cols)**: Render primary filter and `+N filters` indicator (e.g., `[Open] +1 filter`).
   - **Standard/Large Layout (>= 120 cols)**: Render active filter chips separated by `│` (e.g., `State: [Open] │ Label: bug`).
   - Truncate long strings: Labels to 20 chars, Repos to 30 chars.
   - Add right-aligned `x:clear` hint.

### Phase 3: Filter Picker Modal Component
1. **Create `apps/tui/src/screens/search/FilterPicker.tsx`**
   - Build a generic overlay modal using `<box position="absolute" ...>` over the TUI layout.
   - Accept props: `items: {label, value, colorDot?}[]`, `multiSelect: boolean`, `onConfirm`, `onCancel`.
   - Internal state: `searchQuery` (for fuzzy filtering), `focusedIndex` (for `j/k` navigation), `selectedValues` (for toggling).
   - Implement keyboard interactions:
     - `/`: Focus search input.
     - `Esc`: If search focused, unfocus. Else, cancel and close modal.
     - `Space`: Toggle selection (multi-select mode).
     - `Enter`: Confirm selection and close.
     - `j/k`: Navigate filtered items.

### Phase 4: Applying Client-Side Filters
1. **Create `apps/tui/src/screens/search/utils/filterUtils.ts`**
   - Implement pure functions for applying filters to arrays of entities.
   - **Issues**: Match `item.labels` against active labels (AND logic), match `item.repository` against active repo.
   - **Repositories**: Match `item.is_private` against visibility state, match `item.language` against active language.
   - **Code**: Match `item.language` and `item.repository`.
2. **Update Tab Components (`IssuesTab.tsx`, `RepositoriesTab.tsx`, `CodeTab.tsx`)**
   - Extract filter values from `SearchFilterContext`.
   - Before rendering `<ScrollableList>`, process `loadedItems` through the `filterUtils`.
   - Display a `<text>(showing M of N)</text>` indicator when `filteredItems.length < loadedItems.length`.

### Phase 5: Server-Side Filter Execution
1. **Update `IssuesTab.tsx`**
   - Hook into `issueFilters.state`.
   - Pass `state` to the data fetching hook (e.g., `useSearch(query, { type: 'issues', state })`).
   - Use a debounce wrapper (150ms) for the `o` key press to prevent spamming the API when cycling states.
   - Ensure pagination resets when `state` changes.

### Phase 6: Keyboard Bindings & Integration
1. **Update `SearchScreen.tsx`**
   - Register the `f` keybinding globally across search to toggle `filterBarVisible` (no-op on `UsersTab`).
2. **Tab-specific Keybindings**
   - Register bindings conditionally when `filterBarVisible` is true and a modal is not open.
   - **IssuesTab**: Register `o` (cycle state), `l` (open label picker), `r` (open repo picker), `x` (clear issues filters).
   - **RepositoriesTab**: Register `v` (cycle visibility), `l` (open language picker), `x` (clear repo filters).
   - **CodeTab**: Register `l` (open language picker), `r` (open repo picker), `x` (clear code filters).
   - Ensure the Status Bar hints dynamically reflect available keys based on the active tab and `filterBarVisible` state.

---

## 3. Unit & Integration Tests

All tests target the `@microsoft/tui-test` framework and will be placed in `e2e/tui/search.test.ts`.

### 3.1 Terminal Snapshot Tests
- **SNAP-FILTER-001**: Verify filter bar renders on the Issues tab at 120x40 with default state.
- **SNAP-FILTER-002**: Verify filter bar displays `State: [Open]` correctly at 120x40.
- **SNAP-FILTER-003**: Verify multiple active filters rendering at 120x40 (`State: [Open] │ Repo: acme/api-gateway`).
- **SNAP-FILTER-004**: Verify condensed layout at 80x24 showing primary filter (`[Open]`).
- **SNAP-FILTER-005**: Verify condensed layout with multiple filters showing `[Open] +1 filter` at 80x24.
- **SNAP-FILTER-009**: Verify Label Picker overlay rendering correctly at 120x40 with `[ ]` checkboxes.
- **SNAP-FILTER-014**: Verify empty state `"No results match the current filters."` when client filters exclude all items.
- **SNAP-FILTER-018**: Verify responsive transition by actively resizing from 120x40 to 80x24 and checking the snapshot.

### 3.2 Keyboard Interaction Tests
- **KEY-FILTER-001**: Press `f` on Issues tab toggles filter bar visibility.
- **KEY-FILTER-002**: Press `f` on Users tab is a no-op.
- **KEY-FILTER-003**: Press `o` on Issues tab cycles state (All -> Open -> Closed -> All).
- **KEY-FILTER-005**: Press `l` on Issues tab opens the Label Picker overlay.
- **KEY-FILTER-011**: Press `x` clears all filters on the active tab and hides the filter bar.
- **KEY-FILTER-013**: In Label Picker, press `Space` to toggle, then `Enter` confirms selection and closes modal.
- **KEY-FILTER-016**: In Picker, press `/` focuses the search input, typing filters the list.
- **KEY-FILTER-021**: Cycling state with `o` dispatches an API re-query with `state=open`.
- **KEY-FILTER-024**: Rapid `o` presses are debounced (only final state triggers API request).

### 3.3 Integration & Flow Tests
- **INT-FILTER-001**: Perform a full filter flow: open search -> search "api" -> tab to Issues -> press `f` -> press `o` (Open) -> press `l` -> select label -> `Enter`. Verify filtered results match.
- **INT-FILTER-003**: Client-side filtering reduces visible results and displays the `(showing M of N)` indicator.
- **INT-FILTER-007**: Switch tabs (Issues -> Code -> Issues) and verify Issue filters are preserved.
- **INT-FILTER-008**: Pop the search screen (`q`) and reopen; verify all filters are reset to session defaults.
- **INT-FILTER-011**: Simulate HTTP 429 response during a state cycle re-query; verify inline `Rate limited. Retry in {N}s.` message appears.
- **INT-FILTER-014**: Open Label Picker on loaded results with no labels; verify empty state message `"No labels found in results"` and `Enter` is suppressed.

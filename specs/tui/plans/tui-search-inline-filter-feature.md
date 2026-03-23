# Implementation Plan: TUI_SEARCH_INLINE_FILTER

This implementation plan details the step-by-step process for adding per-tab inline filtering, a filter bar, and picker modals to the Codeplane TUI search screen. It incorporates existing architectural patterns like `useLayout` and `useScreenKeybindings`.

## Step 1: Filter State Management & Context
**File:** `apps/tui/src/screens/search/SearchFilterContext.tsx`

1. **Define Types:**
   - Create interfaces for each tab's filter state:
     - `IssueFilterState`: `{ state: 'all' | 'open' | 'closed', labels: Set<string>, repo: string | null }`
     - `RepoFilterState`: `{ visibility: 'all' | 'public' | 'private', language: string | null }`
     - `CodeFilterState`: `{ language: string | null, repo: string | null }`
2. **Create Context:**
   - Export `SearchFilterContext = createContext<SearchFilterContextType | null>(null)`.
3. **Implement Provider (`SearchFilterProvider`):**
   - Manage local state for `issues`, `repositories`, and `code`.
   - Implement updater functions: `updateIssueFilter`, `updateRepoFilter`, `updateCodeFilter`.
   - Implement `clearTabFilters(tab: 'issues' | 'repositories' | 'code')` to reset a specific tab's state.
4. **Create Consumer Hook:**
   - Export `useSearchFilters()` which wraps `useContext(SearchFilterContext)` and throws if used outside the provider.

## Step 2: Client-Side Filter Utilities
**File:** `apps/tui/src/screens/search/utils/filterUtils.ts`

1. **Implement `filterIssues(issues, filterState)`:**
   - If `filterState.labels.size > 0`, keep issues where `item.labels` includes all active labels (AND logic).
   - If `filterState.repo` is set, keep issues matching `item.repository`.
2. **Implement `filterRepositories(repos, filterState)`:**
   - If `filterState.visibility !== 'all'`, match `item.is_private` (true for 'private', false for 'public').
   - If `filterState.language` is set, match `item.language`.
3. **Implement `filterCode(code, filterState)`:**
   - Match `item.language` and `item.repository` if set.
4. *Note: Server-side filters (like issue state) are not handled here, as they require an API re-query.*

## Step 3: Filter UI Components
**File 1:** `apps/tui/src/screens/search/FilterBar.tsx`
1. **Layout & Responsiveness:**
   - Use `const { width } = useLayout()` to detect layout size.
   - **< 120 cols (Condensed):** Render primary filter (e.g., `[Open]`) and `+N filters` if others are active.
   - **>= 120 cols (Standard):** Render full filter chips separated by `│` (e.g., `State: [Open] │ Label: bug`).
2. **Formatting:**
   - Truncate strings: Labels to 20 chars, Repos to 30 chars.
   - Display a right-aligned `x:clear` hint.

**File 2:** `apps/tui/src/screens/search/FilterPicker.tsx`
1. **Modal Overlay Setup:**
   - Use `<box position="absolute" top="auto" left="auto" zIndex={100} flexDirection="column" border={true}>` for the modal container.
   - Use `const { modalWidth, modalHeight } = useLayout()` for dynamic dimensions.
2. **Props & Internal State:**
   - Props: `items: { label: string, value: string, colorDot?: string }[]`, `multiSelect: boolean`, `onConfirm`, `onCancel`.
   - State: `searchQuery`, `focusedIndex`, `selectedValues`.
3. **Keyboard Navigation (`useKeyboard`):**
   - `/`: Focus search input.
   - `Esc`: Unfocus search if focused; otherwise call `onCancel()`.
   - `Space`: Toggle item in `selectedValues` (only if `multiSelect` is true).
   - `Enter`: Call `onConfirm(selectedValues)`.
   - `j/k` or `Down/Up`: Navigate the filtered list.

## Step 4: Search Screen & Tab Integration
**File 1:** `apps/tui/src/screens/search/SearchScreen.tsx`
1. **State & Provider:**
   - Wrap tab contents in `<SearchFilterProvider>`.
   - Add local state: `const [filterBarVisible, setFilterBarVisible] = useState(false)`.
2. **Global Keybinding:**
   - Use `useScreenKeybindings` to register `f` (Toggle filters) with `PRIORITY.SCREEN`. Map it to toggle `filterBarVisible` (ignoring if active tab is 'users').

**File 2:** `apps/tui/src/screens/search/IssuesTab.tsx` (and similarly for Repos/Code tabs)
1. **Consume Context:** Get `issues` filter state and updaters from `useSearchFilters()`.
2. **Tab-Specific Keybindings:**
   - Use `useScreenKeybindings` conditionally when `filterBarVisible` is true and no modal is open.
   - Register `o` (cycle state), `l` (open label picker), `r` (open repo picker), `x` (clear issues filters).
3. **Server-Side API Hook:**
   - Use a debounce wrapper (150ms) around the `o` keypress.
   - Pass the debounced `state` value to the data fetching hook (e.g., `useSearch(query, { type: 'issues', state })`).
4. **Render:**
   - Run loaded items through `filterIssues(loadedItems, filterState)`.
   - Render `<FilterBar>` if `filterBarVisible` is true.
   - Show `<text>(showing M of N)</text>` above `<ScrollableList>` if filtered count < loaded count.
   - Render `<FilterPicker>` conditionally if `l` or `r` was pressed.

## Step 5: E2E Tests
**File:** `e2e/tui/search.test.ts`
1. **Setup:** Import `launchTUI` from `../helpers`.
2. **Snapshot Tests:**
   - `SNAP-FILTER-001/002/003`: Verify full filter bar rendering at 120x40.
   - `SNAP-FILTER-004/005`: Verify condensed format at 80x24 using `await tui.resize(80, 24)`.
   - `SNAP-FILTER-009`: Validate Label Picker overlay renders over the list.
   - `SNAP-FILTER-014`: Ensure "No results match" renders appropriately.
3. **Interaction Tests:**
   - Simulate keypresses: `await tui.sendKeys('f', 'o', 'l')`.
   - Verify `f` toggles visibility and does nothing on Users tab.
   - Verify `Space` and `Enter` workflows inside the `<FilterPicker>`.
   - Assert debounce/API interactions for the `o` key using mocked API responses.
4. **Integration Tests:**
   - Navigate tabs and ensure `SearchFilterContext` maintains state correctly.
   - Assert that pressing `q` to leave search and returning resets the filters (verifying session scoping logic).
# Engineering Specification: TUI_ORG_LIST_SCREEN

## 1. Overview

The Organization List screen is a full-screen view in the Codeplane TUI that displays all organizations the authenticated user is a member of. It features client-side filtering, sorting, responsive column layout, and keyboard-driven navigation using the `useOrgs()` hook from `@codeplane/ui-core`.

## 2. Implementation Plan

### Step 1: Screen Definition & Registration

1. **File:** `apps/tui/src/navigation/screenRegistry.ts`
   - Import `OrgListScreen`.
   - Register the `Organizations` screen route: `{ component: OrgListScreen, requiresRepo: false }`.

2. **File:** `apps/tui/src/commands/commandRegistry.ts`
   - Add a command palette entry for `Organizations` (keyword `:orgs`) that triggers a navigation push to the `Organizations` screen.

3. **File:** `apps/tui/src/navigation/AppShell.tsx` (or KeybindingProvider)
   - Register the `g o` global go-to keybinding to reset the stack and navigate to `Organizations`.

### Step 2: OrgListScreen Component Setup

**File:** `apps/tui/src/screens/organizations/OrgListScreen.tsx`

1. **Imports:**
   - React hooks (`useState`, `useMemo`, `useCallback`, `useEffect`).
   - OpenTUI components (`<box>`, `<text>`, `<scrollbox>`, `<input>`).
   - Core hooks (`useOrgs` from `@codeplane/ui-core`, `useTheme`, `useLayout`, `useNavigation`, `useScreen`).

2. **State Management:**
   - `searchQuery` (string, default `""`)
   - `isSearchFocused` (boolean, default `false`)
   - `sortOrder` (enum: `"created_asc" | "created_desc" | "name_asc" | "name_desc"`, default `"created_asc"`)
   - `visibilityFilter` (enum: `"all" | "public" | "limited" | "private"`, default `"all"`)
   - `focusedIndex` (number, default `0`)
   - `selectedIds` (Set<number> for multi-select via Space)

3. **Data Fetching:**
   - Invoke the hook: `const { items, totalCount, isLoading, error, loadMore, hasMore, retry } = useOrgs({ pageSize: 30 });`

### Step 3: Client-Side Sorting and Filtering Logic

Inside `OrgListScreen`, compute the rendered list dynamically:

```typescript
const filteredAndSortedItems = useMemo(() => {
  let result = items;

  // 1. Filter by Visibility
  if (visibilityFilter !== "all") {
    result = result.filter(org => org.visibility === visibilityFilter);
  }

  // 2. Filter by Search
  if (searchQuery.trim() !== "") {
    const query = searchQuery.toLowerCase();
    result = result.filter(org => 
      org.name.toLowerCase().includes(query) || 
      (org.description && org.description.toLowerCase().includes(query))
    );
  }

  // 3. Sort
  result = [...result].sort((a, b) => {
    switch (sortOrder) {
      case "created_asc": return a.id - b.id;
      case "created_desc": return b.id - a.id;
      case "name_asc": return a.name.localeCompare(b.name);
      case "name_desc": return b.name.localeCompare(a.name);
      default: return 0;
    }
  });

  // 4. Memory Cap
  return result.slice(0, 500);
}, [items, visibilityFilter, searchQuery, sortOrder]);
```

### Step 4: UI Layout and Components

1. **Outer Layout:** `<box flexDirection="column" width="100%" height="100%">`
2. **Header Row:**
   - Displays `<text bold color={theme.primary}>Organizations</text>` and `<text color={theme.muted}> ({totalCount})</text>`.
3. **Filter Toolbar (Height 1, Background: `theme.surface`):**
   - If `breakpoint === "minimum"`, render only the search input or a hint.
   - If `isSearchFocused`, render `<input value={searchQuery} onChange={setSearchQuery} />`.
   - Else, render labels for Sort and Showing visibility.
4. **Column Headers:**
   - `<box flexDirection="row">` with `<text bold color={theme.muted}>` titles. 
   - Hidden on `breakpoint === "minimum"` (80x24).
5. **List via `<scrollbox>`:**
   - Hook up `onScroll` to trigger `loadMore()` when reaching 80% scroll depth and `hasMore` is true.
   - Map over `filteredAndSortedItems`.
   - Adjust column widths based on `breakpoint` (Standard: 120x40, Large: 200x60).
   - Visibility badge uses `<text color={theme.success}>public</text>`, etc.
6. **Empty/Error/Loading States:**
   - Handle `error` via inline `<text color={theme.error}>` and prompt to press `R`.
   - Initial loading: centered spinner.
   - Empty states for zero orgs overall vs. zero matches for current filters.

### Step 5: Keyboard Interactions & Focus Management

Register keybindings scoped to this screen via `useScreen` hook:
- `j` / `Down`: Increment `focusedIndex` (clamp to length - 1).
- `k` / `Up`: Decrement `focusedIndex` (clamp to 0).
- `Enter`: `push("org-overview", { org: filteredAndSortedItems[focusedIndex].name })`.
- `/`: `setIsSearchFocused(true)`.
- `Esc`: If `isSearchFocused`, blur (set false). Else if `searchQuery`, clear it. Else, `pop()`.
- `o`: Cycle `sortOrder` array.
- `v`: Cycle `visibilityFilter` array.
- `c`: `push("org-create")`.
- `G`: `setFocusedIndex(filteredAndSortedItems.length - 1)`.
- `g g`: `setFocusedIndex(0)`.
- `Space`: Toggle `filteredAndSortedItems[focusedIndex].id` in `selectedIds`.
- `q`: `pop()`.
- `R`: Execute `retry()` if an error is present.

## 3. Unit & Integration Tests

**File:** `e2e/tui/organizations.test.ts`

All tests utilize `@microsoft/tui-test` and test a real instance without mocking implementations.

### 3.1 Terminal Snapshot Tests
- **org-list-screen-initial-load**: Validates standard 120x40 layout, header, toolbar, column headers, and populated rows. Focused row highlighted correctly.
- **org-list-screen-empty-state**: Asserts empty state wording: "No organizations yet. Create one with `codeplane org create`."
- **org-list-screen-loading-state**: Asserts centered spinner is displayed correctly on initial load.
- **org-list-screen-error-state**: Asserts red error message and "Press R to retry" hint.
- **org-list-screen-visibility-badges**: Validates that "public", "limited", and "private" tags render with green, yellow, and red colors respectively.
- **org-list-screen-filter-active / filter-results / filter-no-results**: Asserts correct input focus, correct subset of rows rendered, and empty filter message when zero match.
- **org-list-screen-sort-label / sort-cycle**: Validates toolbar text updates for sorting.
- **org-list-screen-visibility-label / cycle**: Validates toolbar text updates for visibility.
- **org-list-screen-pagination-cap**: Ensures footer message "Showing first 500 of X" appears for massive data.

### 3.2 Keyboard Interaction Tests
- **org-list-j-moves-down / k-moves-up / no-wrap**: Simulates keypresses and asserts the active selection visually changes without wrapping at boundaries.
- **org-list-enter-opens-org**: Asserts pressing `Enter` correctly pushes the overview screen (verifying header breadcrumb).
- **org-list-slash-focuses-search / esc-clears-filter / esc-pops**: Validates search input capturing and exiting flow.
- **org-list-filter-case-insensitive / matches-description**: Asserts client-side filtering correctly handles case insensitivity and description fields.
- **org-list-o-cycles-sort / v-cycles-visibility**: Simulates keypresses and asserts the list structurally reorders.
- **org-list-space-selects-row**: Asserts pressing space adds the `✓` prefix.
- **org-list-c-opens-create-form**: Asserts `c` transitions to `org-create`.
- **org-list-G-jumps-to-bottom / gg-jumps-to-top**: Checks jump logic.
- **org-list-pagination-on-scroll**: Scrolls list via simulated interactions and verifies "Loading more..." appears when approaching bottom.

### 3.3 Responsive Tests
- **org-list-80x24-layout / truncation / no-column-headers**: Validates columns are dropped, headers hidden, and truncation works for minimum size.
- **org-list-120x40-layout / column-headers**: Validates standard rendering.
- **org-list-200x60-layout / website-column**: Validates large display rendering adds the website column.
- **org-list-resize-standard-to-min / min-to-standard**: Tests `useOnResize` dynamic adjustment via `terminal.resize()`, ensuring focus is visually preserved.

### 3.4 Integration Tests
- **org-list-auth-expiry**: Mock API to return 401; asserts TUI propagates to the shell-level auth error screen.
- **org-list-rate-limit-429**: Asserts 429 errors display the inline Retry-After message.
- **org-list-pagination-complete**: Validates multiple pages successfully merge in memory.
- **org-list-deep-link-entry**: Launch with `codeplane tui --screen orgs` natively routes to Organizations.
- **org-list-unicode-description**: Ensures CJK/Emoji render without layout breakages.
- **org-list-goto-from-org-and-back**: Validates `g o` logic appropriately resets state avoiding stale references.
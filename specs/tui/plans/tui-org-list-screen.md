# Implementation Plan: TUI Organization List Screen

## 1. Dependencies and Setup

**File:** `apps/tui/package.json`
- **Action:** Add `@codeplane/ui-core` to the dependencies.
- **Code Change:** Add `"@codeplane/ui-core": "workspace:*"` to the `dependencies` object if it's not already present.

## 2. Data Hook Abstraction

**File:** `apps/tui/src/hooks/useOrgData.ts`
- **Action:** Create an adapter hook to provide organizational data. According to research, `useOrgs` might not yet be exposed by `@codeplane/ui-core` directly, so we need a dedicated file to wrap it or provide a structured mock until the core package is updated.
- **Code Change:** 
  - Export a `useOrgs` hook that returns the shape: `{ items, totalCount, isLoading, error, loadMore, hasMore, retry }`.
  - Accept `{ pageSize: number }` as an argument.

## 3. Screen Component Implementation

**File:** `apps/tui/src/screens/organizations/OrgListScreen.tsx`
- **Action:** Create the main screen component.
- **Imports:**
  - React: `useState`, `useMemo`, `useCallback`, `useEffect`
  - OpenTUI: `<box>`, `<text>`, `<scrollbox>`, `<input>`
  - Internal hooks: `useOrgs` (from `../hooks/useOrgData`), `useTheme`, `useLayout`, `useNavigation` (from context/providers), `useScreenKeybindings`.
- **State Management:**
  - `searchQuery` (string, default `""`)
  - `isSearchFocused` (boolean, default `false`)
  - `sortOrder` (enum: `"created_asc" | "created_desc" | "name_asc" | "name_desc"`, default `"created_asc"`)
  - `visibilityFilter` (enum: `"all" | "public" | "limited" | "private"`, default `"all"`)
  - `focusedIndex` (number, default `0`)
  - `selectedIds` (Set<number> for multi-select)
- **Data Fetching:**
  - Call `useOrgs({ pageSize: 30 })`.
- **Client-Side Filtering & Sorting:**
  - Use `useMemo` to compute `filteredAndSortedItems` based on `items`, `searchQuery`, `visibilityFilter`, and `sortOrder`.
  - Enforce a 500-item cap (`slice(0, 500)`).
- **Layout Structure:**
  - **Main Container:** `<box flexDirection="column" width="100%" height="100%">`
  - **Header:** Displays "Organizations ({totalCount})". Use `theme.primary` for the title and `theme.muted` for the count.
  - **Toolbar (Height 1):** Responsive. If `isSearchFocused`, show `<input>`. Otherwise, show labels for current Sort and Visibility settings. If `breakpoint === "minimum"`, simplify the toolbar.
  - **Column Headers:** Hidden on `breakpoint === "minimum"`. Show bold, muted column titles otherwise.
  - **List Content:** `<scrollbox>` rendering the rows. Map over `filteredAndSortedItems`. Attach `onScroll` to trigger `loadMore()` when reaching 80% depth if `hasMore` is true. Handle visual selection based on `focusedIndex` and `selectedIds`.
  - **Visibility Badges:** Color-code based on visibility (`theme.success` for public, warning/error colors for limited/private).
  - **Empty/Loading/Error States:** Render a spinner for initial loading. Display error messages with `theme.error` and a prompt to press `R` to retry. Show empty state messages if no orgs exist or no filter matches.
- **Keyboard Interactions (via `useScreenKeybindings`):**
  - `j` / `Down`: Increment `focusedIndex` (clamp to max).
  - `k` / `Up`: Decrement `focusedIndex` (clamp to 0).
  - `Enter`: Navigate via `push("org-overview", { org: item.name })`.
  - `/`: Set `isSearchFocused(true)`.
  - `Esc`: Clear search focus, clear search query, or `pop()` navigation.
  - `o`: Cycle `sortOrder`.
  - `v`: Cycle `visibilityFilter`.
  - `c`: Navigate via `push("org-create")`.
  - `G`: Jump to bottom of the list.
  - `g g`: Jump to top of the list.
  - `Space`: Toggle selection in `selectedIds`.
  - `q`: `pop()` navigation.
  - `R`: Trigger `retry()` on error.

## 4. Routing and Command Registration

**File:** `apps/tui/src/router/registry.ts`
- **Action:** Update the Organizations route.
- **Code Change:** Import `OrgListScreen`. Replace the `PlaceholderScreen` reference for `ScreenName.Organizations` with `OrgListScreen`.

**File:** `apps/tui/src/commands/commandRegistry.ts`
- **Action:** Scaffold command registry (if missing) and add the Organizations command.
- **Code Change:** Create the file/directory if it does not exist. Add an entry for `:orgs` that triggers a push to `ScreenName.Organizations`.

## 5. End-to-End Tests

**File:** `e2e/tui/organizations.test.ts`
- **Action:** Create comprehensive E2E tests using `@microsoft/tui-test`.
- **Snapshot Tests:**
  - `org-list-screen-initial-load`: Validates 120x40 layout, header, toolbar, columns, and focused row.
  - `org-list-screen-empty-state`: Asserts wording "No organizations yet. Create one...".
  - `org-list-screen-loading-state` & `org-list-screen-error-state`: Validates spinner and red error/retry hints.
  - `org-list-screen-visibility-badges`: Validates colors for public/limited/private tags.
  - Filter/Sort/Pagination labels and active states.
- **Keyboard Interaction Tests:**
  - `j`/`k`, `G`/`gg`: Assert correct visual selection movement and boundaries.
  - `Enter`, `c`: Assert correct navigation pushes to overview and create screens.
  - `/`, `Esc`: Assert input focus, clearing, and exit flows.
  - `o`, `v`: Assert list reordering and filtering upon keypress.
  - `Space`: Assert checkmark selection.
  - Scroll trigger for pagination.
- **Responsive Tests:**
  - Use `terminal.resize()` to test layout adaptations for `80x24` (columns hidden/truncated), `120x40` (standard), and `200x60` (website column added).
- **Integration Tests:**
  - Mock APIs for 401 (auth expiry) and 429 (rate limit) to ensure proper error bubbling.
  - Test pagination data merging.
  - Deep link entry via `codeplane tui --screen orgs`.
  - Proper handling of unicode/CJK characters in descriptions.
  - Verify global `g o` behavior correctly resets state.
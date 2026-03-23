# Engineering Specification: TUI_REPO_CHANGES_VIEW

## High-Level User POV

The changes view is the second tab (`2`) in the repository detail screen. It presents a complete, scrollable list of all jj changes in the repository — the jj equivalent of a commit log, but anchored in jj's stable Change ID model rather than mutable commit hashes. When the user presses `2` from the repository tab bar (or cycles to the Changes tab with `Tab`), the content area below the tab bar replaces with a vertically scrolling list of changes, each rendered as a compact row showing the essential information a developer needs to orient themselves in a repository's history.

Each change row displays four pieces of information at standard terminal width: the short Change ID (the first 8 characters of the stable change identifier, rendered in the `primary` accent color), the first line of the change description (or `(no description)` in muted text if the description is empty), the author name, and a relative timestamp. Two status indicators appear inline: a conflict marker (`⚠` in `warning` color) if the change has unresolved conflicts, and an empty marker (`∅` in `muted` color) if the change is empty (makes no file modifications). These indicators are positioned immediately after the Change ID, before the description, so the user sees status at a glance without scanning to the end of the line.

The list is sorted with the most recent changes at the top, matching the natural reading order for a developer checking what happened recently. The focused row is highlighted with reverse-video styling. The user navigates with `j`/`k` (or arrow keys) to move between changes, and presses `Enter` on the focused change to push a change detail screen showing the full description, metadata, parent change IDs, and a link to view the diff. Pressing `d` on the focused change opens the diff viewer directly, bypassing the detail screen.

The user can filter changes by typing `/` to activate the search input, which performs a client-side fuzzy filter across Change IDs, descriptions, and author names. The filter applies incrementally as the user types, narrowing the visible list in real-time. Pressing `Esc` clears the filter and returns focus to the list. A sort toggle is available via `o`, cycling through three orderings: **Newest first** (default), **Oldest first**, and **Author A→Z**.

At the bottom of the list, cursor-based pagination loads additional changes as the user scrolls. When the scroll position reaches 80% of the loaded content, the next page is fetched automatically. A "Loading more…" indicator appears at the bottom of the list during the fetch. The total change count is displayed in the content header.

The changes view also shows parent-child relationships through indentation when the terminal is wide enough (120+ columns). Conflict changes use a `warning` background tint, making it immediately obvious which changes in the history are in a conflicted state. Empty changes use a dimmed row style. 

## Acceptance Criteria

### Definition of Done
- The changes view renders when the Changes tab (index 1, key `2`) is active in the repository tab bar.
- Change data is fetched via `useChanges(owner, repo)` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/changes`.
- Cursor-based pagination works with a default page size of 50.
- Each change row displays: short change_id (8 chars), conflict indicator, empty indicator, first line of description, author_name, and relative timestamp.
- Changes are listed newest-first by default.
- The focused row is highlighted with reverse-video.
- `Enter` on a focused change pushes `change-detail` screen with `{ repo, change_id }`.
- `d` on a focused change pushes the diff screen with `{ repo, change_id }`.
- `/` activates the filter input with fuzzy matching across change_id, description, and author_name.
- `Esc` from filter input clears the filter and returns focus to the list.
- `o` cycles sort order: Newest first → Oldest first → Author A→Z → Newest first.
- Content header shows total count ("N changes") or filtered count ("M of N changes").
- Pagination triggers automatically at 80% scroll depth.
- "Loading more…" shown at list bottom during page fetch.
- Error states show inline error with "Press `R` to retry".

### Keyboard Interactions
- `j` / `Down`: Move focus to next change row.
- `k` / `Up`: Move focus to previous change row.
- `Enter`: Open change detail screen for focused change.
- `d`: Open diff viewer for focused change.
- `/`: Activate search/filter input.
- `Esc`: Clear filter (if active) or pop screen.
- `o`: Cycle sort order.
- `G`: Jump to last loaded change.
- `g g`: Jump to first change.
- `Ctrl+D`: Page down.
- `Ctrl+U`: Page up.
- `Space`: Toggle selection on focused change.
- `R`: Retry failed fetch.

### Responsive Behavior
- Below 80x24: "Terminal too small" handled by app-shell router.
- 80x24 – 119x39 (minimum): Flat list layout. Columns: change_id (8), status indicators (2), description (remaining width minus 20), timestamp (6). Author name hidden. Tree indicators hidden.
- 120x40 – 199x59 (standard): Full list layout. Columns: tree indicator (3), change_id (8), status indicators (2), description (remaining width minus 40), author_name (16), timestamp (10). Tree indicators visible.
- 200x60+ (large): Expanded layout. Columns: tree indicator (3), change_id (12), status indicators (2), description (remaining width minus 55), author_name (20), timestamp (16).

### Truncation and Boundary Constraints
- `change_id`: 8 characters at min/standard, 12 characters at large. Never truncated.
- `description`: First line only, truncated with trailing `…`.
- `author_name`: Truncated with trailing `…` at 16 (standard) or 20 (large).
- Maximum changes loaded in memory: 1,000 (20 pages x 50 per page).

## Implementation Plan

### 1. File Structure & Scaffolding
- **View Component:** Create `apps/tui/src/screens/repository/tabs/ChangesTab.tsx`. 
- **Row Component:** Create `apps/tui/src/screens/repository/tabs/components/ChangeRow.tsx` to handle the responsive layout of a single row.
- **Utilities:** Create `apps/tui/src/utils/tree-indicators.ts` to compute parent-child tree glyphs based on `parent_change_ids`.
- **Registration:** Integrate `ChangesTab` into `RepoOverviewScreen` mapped to tab key `2`.

### 2. State Management & Data Fetching
- **Component State:**
  - `sort`: `'newest' | 'oldest' | 'author'` (defaults to `'newest'`).
  - `filterQuery`: `string` (defaults to `""`).
  - `filterActive`: `boolean` (defaults to `false`).
  - `focusedIndex`: `number` (defaults to `0`).
- **Data Hooks:** Use `useChanges(repo.owner, repo.name, { sort, limit: 50 })` from `@codeplane/ui-core`. Extract `data`, `isLoading`, `error`, `hasMore`, `loadMore`, `total`.
- **Client-Side Filtering:** Compute `filteredChanges` by applying fuzzy matching (`change_id`, `description`, `author_name`) to `data` when `filterActive` and `filterQuery` are present.

### 3. OpenTUI Layout & Rendering
- **Main Container:** Use `<box flexDirection="column" flexGrow={1}>`.
- **Header Layer:** `<box flexDirection="row" justifyContent="space-between">` displaying "N changes" (or "M of N changes" if filtered) and the sort state.
- **Search Layer:** Conditionally render `<input>` for filtering when `filterActive` is true.
- **List Rendering:**
  - Map `filteredChanges` inside a `<scrollbox onScrollEnd={loadNextPage}>`.
  - Pass dynamic properties to `<ChangeRow>`: `inverse={index === focusedIndex}`, `dimColor={change.is_empty}`, and `backgroundColor={change.has_conflict ? theme.warning_bg : undefined}`.
- **Responsive Handling:** Utilize `useLayout()` or `useTerminalDimensions()` from `@opentui/react`.
  - Compute column visibility based on `breakpoint`.
  - Append tree indicators (`│`, `├`, `└`) *only* if `breakpoint !== 'minimum'` and `sort === 'newest'`.
- **Pagination Footer:** Display `"Loading more..."` when fetching, or `"Showing 1,000 of N changes"` if the 1000 cap is reached.

### 4. Keyboard Navigation & Routing
- Wrap the component in `useScreenKeybindings`:
  - `j`/`k`, `Ctrl+D`/`U`, `G`, `g g`: Safely increment/decrement `focusedIndex`.
  - `o`: Toggle sort logic `setSort(nextSort)`, reset `focusedIndex = 0`, clear filters.
  - `/`: Call `setFilterActive(true)`. Focus transfers to `<input>`.
  - `Esc`: Call `setFilterActive(false)` and `setFilterQuery("")` if a filter is active; otherwise, pop the screen.
  - `Enter`: Trigger `navigation.push('ChangeDetail', { repo: repo.full_name, change_id: current.change_id })`.
  - `d`: Trigger `navigation.push('DiffView', { repo: repo.full_name, change_id: current.change_id })`.
  - `R`: Trigger hook `retry()` on network error states.

## Unit & Integration Tests

### 1. Unit Tests (`apps/tui/src/utils/__tests__/`)
- **`tree-indicators.test.ts`**:
  - Test a flat change history; expect no glyphs or just spaces.
  - Test parent-child sequential history; expect correct assignment of `├` and `└`.
  - Verify glyph generation is aborted entirely if `sort !== 'newest'`.
- **`changes-filter.test.ts`**:
  - Test fuzzy string matching against `change_id`, `description`, and `author_name`.
  - Ensure case-insensitivity behaves correctly.

### 2. E2E Tests (`e2e/tui/repository-changes.test.ts`)
Implement all 65 scenarios requested in the Product Spec using `@microsoft/tui-test`. Group into structural describe blocks:

- **Snapshot & Visuals (Tests 1-19):**
  - **`repo-changes-initial-load`**: Verify the "10 changes" header and table render format at `120x40`.
  - **`repo-changes-conflict-highlight`**: Mock a conflict change and assert the `⚠` token and row background tint match the golden snapshot.
  - **`repo-changes-tree-indicators-120col`**: Supply a graph fixture; verify `├` and `└` are injected properly.
- **Keyboard Interactions (Tests 20-44):**
  - **`repo-changes-j-k-navigation`**: Programmatically emit `j`, assert the focused line shifts down. Emit `k`, assert it shifts up.
  - **`repo-changes-enter-opens-detail`**: Press `Enter` on index 0. Assert the header breadcrumb includes `> change-detail`.
  - **`repo-changes-slash-activates-filter`**: Press `/`, type "fix". Verify row count drops and `M of N changes` updates. Press `Esc`, verify reset.
  - **`repo-changes-o-cycles-sort`**: Press `o`, assert "Sort: Oldest first" displays. Ensure data fetch occurs with new params.
- **Responsive Handling (Tests 45-53):**
  - **`repo-changes-80x24-layout`**: Boot at `80x24`. Assert author column and tree glyphs are missing via regex or snapshot.
  - **`repo-changes-resize-120-to-80`**: Launch at `120x40`, trigger `await terminal.resize(80, 24)`, assert synchronous column truncation while preserving `focusedIndex`.
- **Edge Cases & Data Flow (Tests 54-65):**
  - **`repo-changes-network-error`**: Mock `500` server response. Assert `<text color="error">... Press R to retry</text>` appears. Press `R` to fetch again.
  - **`repo-changes-pagination-continues`**: Emulate scrolling to 80% boundary. Assert list length increases to 100 on subsequent mock fetch. Assert it halts at 1,000.
  - **`repo-changes-tab-switch-unmounts`**: Start in Changes, set a filter, navigate to Bookmarks (`1`), then back (`2`). Assert that filter is cleared due to strict remounting rules.
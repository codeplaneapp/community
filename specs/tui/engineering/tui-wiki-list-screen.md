## Implementation Plan

### 1. Component Architecture & File Structure

The implementation will be modularized into the main screen component and smaller, focused sub-components.

*   `apps/tui/src/screens/Wiki/WikiListScreen.tsx`: The primary orchestrator. Handles data fetching, global screen state (focus, search, delete confirmation), keybinding registration, and rendering the layout wrapper.
*   `apps/tui/src/screens/Wiki/components/WikiToolbar.tsx`: Renders the title row and search input. Manages the `/` focus shortcut locally.
*   `apps/tui/src/screens/Wiki/components/WikiPageRow.tsx`: A pure component for rendering a single wiki page item. Applies responsive column widths and truncation based on the provided layout breakpoint.
*   `apps/tui/src/screens/Wiki/components/InlineDeleteConfirm.tsx`: Replaces a `WikiPageRow` when the delete action is triggered. Captures `y`/`n` keypresses to execute or cancel the deletion.

### 2. State Management

The screen will manage several pieces of local and global state:

*   **Data Hook**: Use `useWikiPages({ owner, repo, q: debouncedSearchQuery })` from `@codeplane/ui-core`.
*   **Focus State**: Track `focusedIndex` (number) representing the currently selected row in the list.
*   **Search State**: Track `searchInput` (string, the current input value) and `activeSearchQuery` (string, the committed query sent to the API).
*   **Delete State**: Track `deletingSlug` (string | null). When not null, the row matching this slug renders the `InlineDeleteConfirm` component and traps focus.
*   **Pagination State**: Track `itemsLoaded`, handle triggering `fetchMore` when scroll reaches 80%, up to the 500-item memory cap.

### 3. Step-by-Step Execution

**Step 1: Scaffolding and Navigation Hookup**
1. Create the `apps/tui/src/screens/Wiki/` directory and empty components.
2. Update `apps/tui/src/navigation/screenRegistry.ts` to include `WikiList: { component: WikiListScreen, requiresRepo: true }`.
3. Add `g k` keybinding in `KeybindingProvider` or global go-to registry to navigate to `WikiList`.
4. Ensure the command palette includes `:wiki` targeting the same screen.

**Step 2: WikiToolbar & Search Integration**
1. Implement `WikiToolbar` using OpenTUI's `<input>`.
2. Connect it to `WikiListScreen` state. Implement a 300ms debounce for the search input value that updates `activeSearchQuery`, triggering a fresh API fetch and resetting pagination.
3. Hook up `/` to focus the search input and `Esc` to blur/clear it.

**Step 3: Responsive Row Rendering**
1. In `WikiPageRow.tsx`, consume `useLayout` to get the current breakpoint (`minimum`, `standard`, `large`).
2. Implement specific column widths based on the PRD:
   *   `minimum` (80x24): Title (remaining space), Timestamp (4ch).
   *   `standard` (120x40): Title (45ch), Slug (25ch), Author (12ch), Timestamp (4ch).
   *   `large` (200x60): Title (70ch), Slug (35ch), Author (15ch), Timestamp (4ch).
3. Apply grapheme-aware string truncation using a utility function to ensure emojis/unicode don't break layout alignments.
4. Style the focused row with reverse video and primary theme color (`ANSI 33`).

**Step 4: List Navigation and Pagination**
1. Utilize the `ScrollableList` abstraction (or native `<scrollbox>`).
2. Register keybindings via `useScreenKeybindings`:
   *   `j`/`k`, `Up`/`Down`, `Ctrl+D`/`Ctrl+U`, `G`, `g g` for navigation.
   *   `Enter` to `push("WikiDetail", { repo, slug })`.
   *   `c` to `push("WikiCreate", { repo })`.
   *   `q` to `pop()`.
3. Implement pagination: Monitor the `onScroll` event from `<scrollbox>`. At >80% threshold, call `fetchMore()` if `hasMore` is true and `items.length < 500`.

**Step 5: Inline Deletion Flow**
1. When `d` is pressed, set `deletingSlug` to the currently focused page's slug.
2. In the list render loop, if `item.slug === deletingSlug`, render `InlineDeleteConfirm` instead of `WikiPageRow`.
3. The confirmation component registers a temporary, high-priority keybinding scope trapping `y`, `n`, and `Esc`.
4. On `y`: Optimistically remove the item from the local cache and call the API `DELETE /api/repos/:owner/:repo/wiki/:slug`. Handle 403 (restore item, show status bar error) and 404 (keep removed, show success flash).
5. On `n`/`Esc`: Clear `deletingSlug` and return to normal navigation.

**Step 6: Edge Cases and Empty States**
1. Handle empty data: If `items.length === 0` and no search query, show "No wiki pages yet. Press c to create one."
2. Handle empty search: Show "No wiki pages match your search."
3. Implement `R` keybinding to trigger `refetch()` when the query hook is in an error state.

## Unit & Integration Tests

The test suite will reside in `e2e/tui/wiki.test.ts` using `@microsoft/tui-test`. It will be grouped into Snapshots, Keyboard interactions, Responsive behaviors, Integration, and Edge cases.

**1. Terminal Snapshot Tests**
*   `SNAP-WIKI-001` - `SNAP-WIKI-003`: Render at 120x40, 80x24, and 200x60, verifying correct column visibility and widths.
*   `SNAP-WIKI-004` - `SNAP-WIKI-007`: Capture empty, empty search, loading, and error states.
*   `SNAP-WIKI-008` - `SNAP-WIKI-010`: Verify focused row highlight, slug prefix formatting, and author muted colors.
*   `SNAP-WIKI-011` - `SNAP-WIKI-013`: Capture search active state, search results, and inline delete confirmation prompt layout.
*   `SNAP-WIKI-014` - `SNAP-WIKI-022`: Capture pagination, caps, breadcrumbs, long text truncation, and status bar hints.

**2. Keyboard Interaction Tests**
*   `KEY-WIKI-001` - `KEY-WIKI-008`: Simulate `j/k`, arrow keys, edge wrapping, and `Enter` key behavior to ensure focus index increments correctly and detail view is pushed.
*   `KEY-WIKI-009` - `KEY-WIKI-015`: Test search input flow: `/` focuses, typing updates, `Enter` submits, and `Esc` cascades (cancels delete -> clears search -> pops screen).
*   `KEY-WIKI-016` - `KEY-WIKI-021`: Test `G`, `g g`, `Ctrl+D/U` for scroll jumping, and `R` for retry.
*   `KEY-WIKI-022` - `KEY-WIKI-026`: Test `c` to create, `d` to delete, `y/n` confirmation branches, and optimistic revert simulation.
*   `KEY-WIKI-027` - `KEY-WIKI-038`: Test search character collision protection (ensuring `j` in input types 'j', not navigate), rapid key presses, and pagination triggers.

**3. Responsive Tests**
*   `RESP-WIKI-001` - `RESP-WIKI-008`: Validate that column combinations respect the strict constraints (e.g., author hidden at 80x24).
*   `RESP-WIKI-009` - `RESP-WIKI-014`: Simulate dynamic terminal resizing using `.resize()`, ensuring focus is preserved, state isn't wiped, and layout adjusts synchronously.

**4. Integration & Edge Case Tests**
*   `INT-WIKI-001` - `INT-WIKI-018`: Verify API lifecycle connections. Test auth expiry propagation, rate limiting UI, pagination limits (500 cap), search parameter propagation (`q`), routing behavior via palette/deep link, and refetch success.
*   `EDGE-WIKI-001` - `EDGE-WIKI-013`: Test pathological data like 200+ char titles, emoji grapheme clusters, null authors ("unknown"), rapid deletes, search special character URL encoding, and API network disconnects mid-pagination.
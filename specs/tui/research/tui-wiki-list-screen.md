# Engineering Specification: TUI Wiki List Screen (`tui-wiki-list-screen`)

## 1. Overview
The Wiki List Screen will be implemented in the Codeplane TUI (`apps/tui/src/screens/Wiki/WikiListScreen.tsx`) to allow users to view, search, and manage wiki pages for a given repository. It will strictly adhere to the existing TUI list patterns (such as `AgentSessionListScreen`), offering responsive columns, cursor-based pagination, inline deletion with an overlay confirmation, and a search toolbar.

## 2. Dependencies & Data Layer
*   **SDK Methods (`packages/sdk/src/services/wiki.ts`)**:
    *   `listWikiPages(input: ListWikiPagesInput)`
    *   `searchWikiPagesByRepo(input: ListWikiPagesInput)`
    *   `deleteWikiPage(slug: string)`
*   **Data Hooks (`@codeplane/ui-core`)**:
    *   `useWikiPages(owner, repo, options)`: Returns `{ pages, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.
    *   `useDeleteWikiPage(owner, repo)`: Mutation hook with `onRevert` and `onError` handlers.
    *   *Note: If these hooks do not yet exist in `@codeplane/ui-core`, they must be implemented as wrappers around the `WikiService`.*
*   **OpenTUI Primitives**: `<box>`, `<text>`, `<scrollbox>`, `<input>`.

## 3. UI Architecture & Layout
The layout follows the standard Codeplane TUI list stack:
1.  **Header**: `<text bold>Wiki Pages ({formatTotalCount(totalCount)})</text>`
2.  **Flash Messages**: Ephemeral `<text color="yellow">` for action statuses (e.g., "Delete failed").
3.  **Toolbar (`WikiFilterToolbar`)**: Contains the text input for searching pages by title/slug.
4.  **List Area (`scrollbox`)**:
    *   Renders an array of `WikiPageRow` components.
    *   **Responsive Columns**: Utilizes a `useMemo` calculated breakpoint (`minimum` < 120, `standard` < 200, `large` 200+). Lower breakpoints collapse columns like `UpdatedAt` and `Author` to preserve the `Title` visibility.
    *   **Pagination Indicator**: `<text>Loading more…</text>` at the end of the scrollbox triggered when `hasMore` is true and `scrollbox` reaches the end.
5.  **Overlays**: `DeleteConfirmationOverlay` to prevent accidental deletions.

## 4. Key Interactions & Focus Model
*   **List Navigation**: 
    *   `j` / `Down`: Move cursor down.
    *   `k` / `Up`: Move cursor up.
    *   `g g` / `G`: Jump to first / jump to last.
    *   *Implementation*: Maintained via a `focusIndex` state clamped between `0` and `pages.length - 1`.
*   **Actions**:
    *   `Enter`: Open the focused wiki page (`push("WikiDetail", { owner, repo, slug })`).
    *   `n`: Create a new wiki page (`push("WikiCreate", { owner, repo })`).
    *   `d`: Trigger inline delete. Opens the `DeleteConfirmationOverlay` and traps focus.
    *   `r`: Refetch/retry loading the page list.
    *   `/`: Focus search toolbar input.
    *   `q`: Back / pop screen (`pop()`).

## 5. File Structure (`apps/tui/src/screens/Wiki/`)
*   `WikiListScreen.tsx`: The primary entry point. Manages `focusIndex`, `deleteTarget`, and connects to hooks.
*   `components/WikiPageRow.tsx`: Individual row renderer calculating truncate boundaries based on terminal width breakpoints.
*   `components/WikiFilterToolbar.tsx`: The search input and filter toggle UI.
*   `components/WikiEmptyState.tsx`: Fallback UI when no wiki pages exist or search yields no results.
*   `components/DeleteConfirmationOverlay.tsx`: Absolute positioned `<box border="single">` overlay for confirming `deleteTarget`.
*   `hooks/useWikiListKeybindings.ts`: Abstraction mapping raw OpenTUI keyboard events to local navigation callbacks.
*   `utils/wikiListColumns.ts`: Configuration defining column flex-ratios per breakpoint.

## 6. Testing Strategy
End-to-End testing relies on `@microsoft/tui-test` within `e2e/tui/wiki.test.ts`.
*   **State Validations**:
    *   Empty state snapshot.
    *   Loading state snapshot.
    *   Standard populated list snapshot displaying truncated responsive columns.
*   **Interaction Validations**:
    *   Verify `j/k` increments `focusIndex` (reverse video highlight changes).
    *   Verify `d` invokes the overlay, and `Esc` cancels it.
    *   Verify `/` focuses the search bar and inputting text filters the `WikiPageRow` count.
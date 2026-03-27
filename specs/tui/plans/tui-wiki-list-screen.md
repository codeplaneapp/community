# Implementation Plan: TUI Wiki List Screen (`tui-wiki-list-screen`)

## Objective
Implement a robust, keyboard-driven Wiki List Screen for the Codeplane TUI. The screen will support responsive columns, cursor-based pagination, inline page deletion with confirmation, and a search toolbar, adhering to existing OpenTUI list patterns.

## Phase 1: Data Layer & Shared Hooks

**1. Verify / Implement SDK Methods**
- **File:** `packages/sdk/src/services/wiki.ts`
- **Action:** Ensure the `WikiService` includes methods for `listWikiPages`, `searchWikiPagesByRepo`, and `deleteWikiPage`. Add them if missing, ensuring they match the backend API contract.

**2. Verify / Implement UI Core Hooks**
- **File:** `packages/ui-core/src/hooks/useWiki.ts` (or similar depending on existing structure)
- **Action:** Ensure `@codeplane/ui-core` exports:
  - `useWikiPages(owner, repo, options)`: Must return `{ pages, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.
  - `useDeleteWikiPage(owner, repo)`: Mutation hook returning a delete function with `onRevert`/`onError` state handling.

## Phase 2: Utilities & Custom Hooks

**3. Define Responsive Columns**
- **File:** `apps/tui/src/screens/Wiki/utils/wikiListColumns.ts`
- **Action:** Create configurations defining flex-ratios and visibility thresholds for columns (`Title`, `Slug`, `UpdatedAt`, `Author`) across the three terminal breakpoints (minimum < 120, standard < 200, large 200+).

**4. Implement Navigation Keybindings Hook**
- **File:** `apps/tui/src/screens/Wiki/hooks/useWikiListKeybindings.ts`
- **Action:** Build a hook utilizing OpenTUI's `useKeyboard` to abstract list navigation. It should handle:
  - `j`/`Down`, `k`/`Up` (clamped index management).
  - `g g`, `G` (jump to top/bottom).
  - Pass-through handlers for `/` (search), `d` (delete), `n` (create), `r` (refetch), `Enter` (open), and `q` (back).

## Phase 3: Presentation Components

**5. Create Empty State Component**
- **File:** `apps/tui/src/screens/Wiki/components/WikiEmptyState.tsx`
- **Action:** Implement a fallback UI displaying a friendly message when no pages exist or search results are empty. Use `<box>` and `<text>`.

**6. Create Delete Confirmation Overlay**
- **File:** `apps/tui/src/screens/Wiki/components/DeleteConfirmationOverlay.tsx`
- **Action:** Implement an absolute-positioned `<box border="single">` modal. It must trap focus, display the target page slug, and accept `Enter` to confirm or `Esc` to cancel.

**7. Create Wiki Page Row Component**
- **File:** `apps/tui/src/screens/Wiki/components/WikiPageRow.tsx`
- **Action:** Build the individual row renderer. 
  - Accept `page`, `isFocused`, and `terminalWidth` props.
  - Use `wikiListColumns.ts` logic to conditionally render or truncate columns based on the current width.
  - Apply reverse video or accent color when `isFocused` is true.

## Phase 4: Interactive Components

**8. Implement Search Toolbar**
- **File:** `apps/tui/src/screens/Wiki/components/WikiFilterToolbar.tsx`
- **Action:** Create a component wrapping an `<input>` primitive. Manage focus state and pass search query changes up to the parent. Handle `Esc` to blur and clear.

## Phase 5: Main Screen Assembly

**9. Build the Wiki List Screen**
- **File:** `apps/tui/src/screens/Wiki/WikiListScreen.tsx`
- **Action:** 
  - Wire up `useWikiPages` and `useDeleteWikiPage`.
  - Manage local state for `focusIndex`, `searchQuery`, and `deleteTarget` (slug string | null).
  - Utilize `useTerminalDimensions` to pass width down to rows.
  - Implement the `<scrollbox>` with scroll-to-end detection to trigger `fetchMore()` when `hasMore` is true, displaying `<text>Loading more...</text>`.
  - Assemble the layout: Header, Flash Messages, Toolbar, Scrollbox (mapping `pages` to `WikiPageRow` or showing `WikiEmptyState`), and the `DeleteConfirmationOverlay` if `deleteTarget` is set.

## Phase 6: Router Integration

**10. Register Screen in Navigation**
- **File:** `apps/tui/src/App.tsx` (or primary router definition file)
- **Action:** Ensure the TUI router can push to `WikiList` with `{ owner, repo }` params. Add the `g k` go-to keybinding in the global navigation handler to jump to this screen if repository context exists.

## Phase 7: End-to-End Testing

**11. Write E2E Tests**
- **File:** `e2e/tui/wiki.test.ts`
- **Action:** Use `@microsoft/tui-test` to implement:
  - **Snapshots:** Empty state, Loading state, and Standard populated list (testing responsive column truncation).
  - **Interactions:** 
    - Press `j`/`k` to verify focus movement.
    - Press `/`, type text, and verify list filtering.
    - Press `d` on a focused item to ensure the overlay appears, then press `Esc` to verify it dismisses.
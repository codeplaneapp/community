# Implementation Plan: TUI Repository Bookmarks View

This document outlines the step-by-step implementation plan for the `tui-repo-bookmarks-view` feature, which adds a functional Bookmarks tab to the Codeplane TUI repository overview screen.

## 1. Directory Setup
Ensure the target directory exists for the repository screen and its tabs.
- **Path:** `apps/tui/src/screens/Repository/tabs/`

## 2. Types & Utilities

### 2.1 Type Definitions
**File:** `apps/tui/src/screens/Repository/tabs/bookmark-types.ts`
- Create the interaction mode type `BookmarksMode` (`"list" | "filter" | "create" | "confirm"`).
- Define `BookmarkColumns` for responsive layout properties.
- Define prop interfaces for `BookmarkRowProps`, `BookmarkCreateFormProps`, and `BookmarkDeleteConfirmProps`.
- Export validation regexes: `BOOKMARK_NAME_REGEX`, `CHANGE_ID_REGEX` and max lengths.
- Re-export `Bookmark` from `../../../hooks/repo-tree-types.js`.

### 2.2 Sorting Logic
**File:** `apps/tui/src/screens/Repository/tabs/bookmark-sort.ts`
- Implement `sortBookmarks(bookmarks, defaultBookmark)`: Pins the default bookmark to the top and sorts the rest alphabetically by name.
- Implement `findBookmarkIndex(sortedBookmarks, name, defaultBookmark)`: Helper to find the insertion index of a newly created bookmark to auto-focus it.

### 2.3 Responsive Columns
**File:** `apps/tui/src/screens/Repository/tabs/bookmark-columns.ts`
- Implement `resolveBookmarkColumns(terminalWidth, breakpoint)`: Returns the visible columns (change ID, commit ID) and widths based on OpenTUI's `minimum`, `standard`, and `large` breakpoints.

## 3. Sub-Components

### 3.1 Bookmark Row
**File:** `apps/tui/src/screens/Repository/tabs/BookmarkRow.tsx`
- Build an OpenTUI `<box flexDirection="row">` representing a single bookmark.
- Render `★` for the default bookmark.
- Apply `TextAttributes.REVERSE | TextAttributes.BOLD` to the focused row using `useTheme()` colors.
- Hide/show columns dynamically based on the provided `columns` prop.

### 3.2 Creation Form Modal
**File:** `apps/tui/src/screens/Repository/tabs/BookmarkCreateForm.tsx`
- Build an absolutely positioned, centered OpenTUI `<box>`.
- Add `<input>` fields for the bookmark Name and Target Change ID.
- Implement client-side validation logic using the regex constants.
- Capture `Ctrl+S` for submission and `Esc` for cancellation.

### 3.3 Deletion Confirmation Modal
**File:** `apps/tui/src/screens/Repository/tabs/BookmarkDeleteConfirm.tsx`
- Build an absolutely positioned, centered `<box border="single" borderColor={theme.warning}>`.
- Display a truncated confirmation message: `Delete bookmark '{name}'? y/n`.

## 4. Main Tab Component

### 4.1 Bookmarks Tab
**File:** `apps/tui/src/screens/Repository/tabs/BookmarksTab.tsx`
- Consume `useRepoContext()` for context and `useBookmarks()` from ` @codeplane/ui-core` (or the mocked local hook) for data.
- Manage local state for: `mode`, `focusedIndex`, `filterText`, `isCreating`, `deleteTarget`.
- Handle loading and error states using `useScreenLoading`.
- Implement `useScreenKeybindings` to map:
  - `j`/`k`, `Down`/`Up` for navigation.
  - `Enter`, `d` for navigating to Change/Diff views via `useNavigation`.
  - `/` for activating the inline filter.
  - `n` for opening the creation form.
  - `x` for triggering the delete confirmation.
  - `c` for copying the bookmark name (using `Bun.spawn` as a fallback mechanism for the POC phase).
  - `R` for refreshing data.
- Wire up optimistic UI updates for deletion using `useOptimisticMutation`.
- Render the `SkeletonList` while loading, the scrollable list of `BookmarkRow` components, and the floating modals based on `mode`.

## 5. Integration

### 5.1 Tab Registry
**File:** `apps/tui/src/screens/Repository/tabs/index.ts`
- Import `BookmarksTab`.
- Replace the `PlaceholderTab` assigned to index `1` (`id: "bookmarks"`) with `BookmarksTab`.

### 5.2 Router Registry (if missing)
**File:** `apps/tui/src/router/types.ts` & `apps/tui/src/router/registry.ts`
- Ensure `ScreenName.ChangeDetail` or `ScreenName.DiffView` is registered so that hitting `Enter` or `d` can push the correct route to the navigation stack.

## 6. E2E Testing

### 6.1 Repository Tests
**File:** `e2e/tui/repository.test.ts`
- Implement ` @microsoft/tui-test` snapshots and interaction assertions.
- Add Snapshot Tests:
  - `repo-bookmarks-initial-load`
  - `repo-bookmarks-empty-state`
  - `repo-bookmarks-focused-row`
  - `repo-bookmarks-create-form`
  - `repo-bookmarks-delete-confirmation`
- Add Keyboard Interaction Tests:
  - `j`/`k` navigation boundary checks.
  - `/` filter activation and typed narrowing.
  - `n` form toggling and `Esc` cancellation.
  - `x` deletion prompt and `y`/`n` handling.
- Add Responsive Layout Tests:
  - Terminal resizing from `120x40` to `80x24` and verifying column collapse behavior.

## 7. Productionization Reminders
- The `useBookmarks` hook acts as a placeholder if `tui-repo-tree-hooks` is not fully resolved; test failures related to data-fetching are accepted until the backend fully satisfies the endpoints.
- Replace raw `Bun.spawn` clipboard handlers with a centralized `clipboard.ts` utility when the platform standardizes one.
- Migrate from direct `useRepoFetch` POST calls to a dedicated `useCreateBookmark` hook once ` @codeplane/ui-core` exports it.
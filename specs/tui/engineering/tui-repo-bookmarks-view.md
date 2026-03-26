# TUI_REPO_BOOKMARKS_VIEW Engineering Specification

## Implementation Plan

### 1. File Structure & Component Overview

- `apps/tui/src/screens/repository/tabs/BookmarksTab.tsx`: The main container component for the tab. It fetches the bookmarks, applies sorting and filtering, handles global tab state, and manages overlays.
- `apps/tui/src/screens/repository/components/BookmarkRow.tsx`: A pure rendering component for a single bookmark row. It adapts to `useTerminalDimensions()` breakpoints.
- `apps/tui/src/screens/repository/components/CreateBookmarkModal.tsx`: An overlay form for bookmark creation.
- `apps/tui/src/screens/repository/components/DeleteBookmarkConfirm.tsx`: An overlay prompt for deletion confirmation.

### 2. State Management & Data Fetching

**Hooks required in `BookmarksTab.tsx`:**
- `useBookmarks(repo.owner, repo.name)` -> `{ items, isLoading, error, refetch, totalCount }`
- `useCreateBookmark(repo.owner, repo.name)` -> `{ mutateAsync }`
- `useDeleteBookmark(repo.owner, repo.name)` -> `{ mutateAsync }`
- `useRepo(repo.owner, repo.name)` -> `{ repo: { default_bookmark, permissions } }`
- `useUser()` -> `{ user }`

**Local State:**
- `focusedIndex` (number): Currently selected row index.
- `filterText` (string): Current filter input.
- `isFilterActive` (boolean): Whether the filter input is currently focused.
- `createModalState` (boolean): Visibility of the create form.
- `deleteConfirmState` (Bookmark | null): The bookmark queued for deletion.
- `optimisticDeleted` (Set<string>): Names of optimistically deleted bookmarks.

### 3. Sorting & Filtering Logic

```typescript
const visibleBookmarks = useMemo(() => {
  if (!items) return [];

  // 1. Remove optimistically deleted
  let filtered = items.filter(b => !optimisticDeleted.has(b.name));

  // 2. Apply text filter (case-insensitive)
  if (filterText) {
    const lowerFilter = filterText.toLowerCase();
    filtered = filtered.filter(b => b.name.toLowerCase().includes(lowerFilter));
  }

  // 3. Sort: Default bookmark first, then alphabetically
  const defaultBmName = repo?.default_bookmark || "main";
  
  const defaultBm = filtered.find(b => b.name === defaultBmName);
  const others = filtered
    .filter(b => b.name !== defaultBmName)
    .sort((a, b) => a.name.localeCompare(b.name));

  return defaultBm ? [defaultBm, ...others] : others;
}, [items, optimisticDeleted, filterText, repo?.default_bookmark]);
```

### 4. Breakpoints and Responsive Layout

Leverage `useLayout()` or `useTerminalDimensions()` inside `BookmarkRow.tsx`:
- `cols < 120`: Minimum size. Show badge, name (truncated to 40), and tracking indicator (↔). Hide `target_change_id` and `target_commit_id`.
- `120 <= cols < 200`: Standard size. Show badge, name (truncated to 30), `change_id` (12ch), `commit_id` (12ch), tracking indicator.
- `cols >= 200`: Large size. Show badge, name (truncated to 50), full IDs, and verbose tracking ("tracking"/"local").

### 5. Keyboard Navigation & Actions

Using `useScreenKeybindings` (or `useKeyboard` within the tab scope), map the following:
- **Navigation (`j`/`k`, `Down`/`Up`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`)**: Updates `focusedIndex`, bound between `0` and `visibleBookmarks.length - 1`.
- **View Actions**:
  - `Enter`: Pushes `"change-detail"` screen with `target_change_id`.
  - `d`: Pushes `"diff-view"` screen with `target_change_id`.
  - `c`: Copies `visibleBookmarks[focusedIndex].name` to clipboard, triggers a status bar toast ("Copied!").
- **Filter**:
  - `/`: Sets `isFilterActive = true`, trapping focus to the filter `<input>`.
  - `Esc` (while filtering): Sets `isFilterActive = false`, `filterText = ""`.
- **Mutations (Requires `repo.permissions.write`)**:
  - `n`: Sets `createModalState = true`.
  - `x`: Checks if focused is `repo.default_bookmark`. If yes, show "Cannot delete default" toast. Otherwise, sets `deleteConfirmState = visibleBookmarks[focusedIndex]`.
- **Refresh**:
  - `R`: Calls `refetch()`.

### 6. Mutation Handling

**Create:**
- In `CreateBookmarkModal`, provide `<input>` for `name` and `target_change_id`.
- On `Ctrl+S` or `Enter` on submit:
  ```typescript
  try {
    await createMutate({ name, target_change_id });
    setCreateModalState(false);
    refetch(); // or manually update cache
  } catch (err) {
    // surface error inline
  }
  ```

**Delete (Optimistic):**
- In `DeleteBookmarkConfirm`, on `y` press:
  ```typescript
  const toDelete = deleteConfirmState;
  setDeleteConfirmState(null);
  setOptimisticDeleted(prev => new Set(prev).add(toDelete.name));
  
  try {
    await deleteMutate(toDelete.name);
    refetch(); // to sync exactly
  } catch (err) {
    setOptimisticDeleted(prev => {
      const next = new Set(prev);
      next.delete(toDelete.name);
      return next;
    });
    showToast(`Error: ${err.message}`);
  }
  ```

## Unit & Integration Tests

All tests target `e2e/tui/repository.test.ts` under a new test suite group: `TUI_REPOSITORY_BOOKMARKS`.

### Snapshot Tests
1. **`repo-bookmarks-initial-load`**: Mock API with 5 bookmarks. Assert terminal output matches golden file (120x40).
2. **`repo-bookmarks-empty-state`**: Mock API with 0 bookmarks. Assert "No bookmarks. Create one with `n`." centered text.
3. **`repo-bookmarks-loading-state`**: Delay API response. Assert "Loading..." spinner visible.
4. **`repo-bookmarks-error-state`**: Mock API 500. Assert inline red error message and `Press R to retry`.
5. **`repo-bookmarks-80x24-layout`**: Render at 80 cols. Assert only name, badge, and tracking visible.
6. **`repo-bookmarks-200x60-layout`**: Render at 200 cols. Assert expanded columns.

### Keyboard Interaction Tests
7. **Navigation (`j`, `k`, `G`, `gg`, `Ctrl+D`, `Ctrl+U`)**: Press keys, assert focused row index via reverse-video styling.
8. **Navigation bounds**: Press `k` on first row (no wrap), `j` on last row (no wrap).
9. **Screen transitions**:
   - Focus row, press `Enter`. Assert breadcrumb changes to change detail. Press `q` to return.
   - Focus row, press `d`. Assert breadcrumb changes to diff view.
10. **Copy to clipboard**: Focus row, press `c`. Assert status bar shows "Copied!".
11. **Filtering**:
    - Press `/`, type text matching 1 bookmark. Assert list updates.
    - Type text matching 0 bookmarks. Assert "No matching bookmarks" empty state.
    - Press `Esc`. Assert filter clears and list resets.

### Mutation and Edge Case Tests
12. **Create flow (Success)**:
    - Press `n`. Assert modal opens.
    - Type "feature/new", press `Ctrl+S`.
    - Assert modal closes, list updates with new bookmark.
13. **Delete flow (Success, Optimistic)**:
    - Focus non-default bookmark, press `x`. Assert modal opens.
    - Press `y`. Assert modal closes, bookmark vanishes immediately.
14. **Delete flow (API Error Rollback)**:
    - Press `x`, press `y`. Mock API to return 500.
    - Assert bookmark disappears initially, then reappears with an error toast in status bar.
15. **Delete default bookmark (Blocked)**:
    - Focus default bookmark, press `x`. Assert no modal opens. Assert "Cannot delete the default bookmark." in status bar.
16. **Read-only Permissions**:
    - Mock user with read-only access. Press `n`. Assert status bar "Insufficient permissions". Press `x`. Assert same.
17. **Rate Limiting**:
    - Mock API 429. Assert inline error "Rate limited. Retry in Ns."
18. **Resize Events**:
    - Launch at 120x40. Resize to 80x24. Assert columns disappear, focus is maintained.
    - Open create modal, resize to 80x24. Assert modal centers and resizes to 90% width.

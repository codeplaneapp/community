# Engineering Specification: TUI_REPO_CONFLICTS_VIEW

## Overview

This specification defines the implementation of the Conflicts tab (Tab 4) within the repository detail screen. It provides a keyboard-driven, hierarchically organized view of jj-native conflicts grouped by change. The view supports inline expansion, file-path filtering, resolved conflict toggling, and direct navigation to diff and change detail screens. 

## Implementation Plan

### 1. Data Layer & Hook Integration (`apps/tui/src/screens/repository/tabs/ConflictsTab.tsx`)

The view depends on the `@codeplane/ui-core` hooks to fetch conflict data.

*   **State Hooks**:
    *   Consume `useRepoConflicts(owner, repo)` to get `{ changes, totalChangeCount, totalFileCount, isLoading, error, refresh }`.
    *   Consume `useTheme()` for color tokens (`primary`, `success`, `warning`, `muted`, `error`).
    *   Consume `useLayout()` for terminal dimensions and responsive breakpoint detection (`minimum`, `standard`, `large`).
    *   Consume `useNavigation()` for `push` to diff/change-detail views.

*   **Local State Management**:
    *   `expandedChanges`: `Set<string>` to track which change IDs are expanded.
    *   `focusedIndex`: `number` representing the global cursor position within the flattened visible list.
    *   `showResolved`: `boolean` (default: `false`) toggled via `h`.
    *   `filterText`: `string` representing the current filter input.
    *   `isFiltering`: `boolean` tracking if the filter `<input>` is currently focused.

### 2. View Model Construction (Flattening & Filtering)

Since the TUI `<scrollbox>` requires a 1D list for vertical `j`/`k` navigation, the hierarchical data (Changes -> Files) must be flattened dynamically based on expansion, resolved visibility, and filter text.

```typescript
type RowItem = 
  | { type: 'change'; change: ConflictedChange; matchedFileCount: number }
  | { type: 'file'; change: ConflictedChange; file: ConflictFile };

const visibleRows = useMemo<RowItem[]>(() => {
  const rows: RowItem[] = [];
  const filterLower = filterText.toLowerCase();

  // Sort changes by total conflict count (desc), then ID
  const sortedChanges = [...(changes || [])].sort((a, b) => 
    b.conflictCount - a.conflictCount || a.id.localeCompare(b.id)
  );

  for (const change of sortedChanges) {
    let visibleFiles = change.files.filter(f => showResolved || !f.resolved);
    if (filterLower) {
      visibleFiles = visibleFiles.filter(f => f.path.toLowerCase().includes(filterLower));
    }

    // Only show change if it has visible files (or if no filter is active)
    if (filterLower && visibleFiles.length === 0) continue;

    rows.push({ type: 'change', change, matchedFileCount: visibleFiles.length });

    if (expandedChanges.has(change.id)) {
      for (const file of visibleFiles) {
        rows.push({ type: 'file', change, file });
      }
    }
  }
  return rows;
}, [changes, expandedChanges, showResolved, filterText]);
```

*Safety Check*: When `visibleRows` updates, if `focusedIndex >= visibleRows.length`, clamp it to `Math.max(0, visibleRows.length - 1)`. If a file is collapsed, set `focusedIndex` to the parent change index.

### 3. Layout and Component Rendering

*   **Section Header**:
    *   Render a `<box flexDirection="row">`.
    *   Calculate unresolved counts: `unresolvedCount = totalFileCount - resolvedFileCount`.
    *   Icon: `⚠` (using `theme.warning`) if `unresolvedCount > 0`, else `✓` (`theme.success`).
    *   Text: `Conflicts ({changes.length} changes, {totalFileCount} files)`.
    *   Mode indicator: `— {showResolved ? 'showing all' : 'unresolved only'}`.
    *   Filter indicator: Show ` / filter ` and ` R refresh ` right-aligned.
*   **Filter Input Overlay/Inline**:
    *   If `isFiltering` is true, render an `<input>` component right below the header.
*   **Main List**:
    *   Use `<scrollbox>` and map over `visibleRows`.
    *   **Change Row**: Indented 1 space. Shows expand indicator (`▾` or `▸`), `change.id.slice(0, 12)`, commit ID, description (truncated based on `layout.breakpoint`), author, and `({change.conflictCount} files)`. Highlight background if `focusedIndex === index`.
    *   **File Row**: Indented 5 spaces. Shows resolution icon (`✓` green + strikethrough if resolved, `✗` yellow if unresolved), `file.path` (truncated from left using `…`), and `file.type`. Highlight background if `focusedIndex === index`.
*   **Empty State**: Render `<text fg={theme.success}>No conflicts. All clear! ✓</text>` centered in the `<box>`.

### 4. Keyboard Controller (`useScreenKeybindings`)

Register keybindings scoped to this tab via `useScreen` or the internal keybinding provider:

*   `j` / `Down`: `setFocusedIndex(i => Math.min(i + 1, visibleRows.length - 1))`
*   `k` / `Up`: `setFocusedIndex(i => Math.max(i - 1, 0))`
*   `Enter`: 
    *   If focused row is `change`: `toggleExpanded(row.change.id)`
    *   If focused row is `file`: `push('diff-view', { repo, changeId: row.change.id, filePath: row.file.path })`
*   `d`: Same as Enter for `file` row.
*   `v`: 
    *   If focused row is `change`: `push('change-detail', { repo, changeId: row.change.id })`
*   `/`: `setIsFiltering(true)`
*   `Esc`: If `isFiltering`, `setIsFiltering(false); setFilterText('')`.
*   `h`: `setShowResolved(prev => !prev)`
*   `x`: `setExpandedChanges(new Set(changes.map(c => c.id)))`
*   `z`: `setExpandedChanges(new Set())`
*   `R`: `refresh()` (trigger API hard fetch)
*   `G`: `setFocusedIndex(visibleRows.length - 1)`
*   `g g`: `setFocusedIndex(0)`

### 5. Status Bar Hints and Help Overlay Integration

*   Dispatch contextual status bar hints via AppShell context when the tab mounts:
    `j/k:navigate  Enter:expand/diff  v:view  d:diff  h:toggle resolved  R:refresh  ?:help`
*   Add the Conflicts Help Group to the global help overlay registry (`help.registry.ts`).

### 6. Error & Loading States

*   If `isLoading`, show `<box justifyContent="center"><text>Loading conflicts…</text></box>`.
*   If `error` is a `501 Not Implemented`, show inline text: `Conflicts endpoint not available. Backend may need updating.`
*   If `error` is a `429`, parse `Retry-After` header and show inline: `Rate limited. Retry in {N}s.`
*   Otherwise, show generic error and `Press R to retry`.

---

## Unit & Integration Tests

Add these tests to `e2e/tui/repository.test.ts` (or `e2e/tui/repo-conflicts.test.ts` if test files are becoming too large). All tests utilize `@microsoft/tui-test`.

### Terminal Snapshot Tests

1.  **`repo-conflicts-initial-load`**: Mock 3 conflicted changes. Navigate to Conflicts tab. Assert standard 120x40 layout snapshot matches golden file (header counts correct, first row selected).
2.  **`repo-conflicts-empty-state`**: Mock 0 conflicts. Assert "No conflicts. All clear! ✓" snapshot.
3.  **`repo-conflicts-expanded-change`**: Press `Enter` on a change row. Assert snapshot shows `▾` and indented file rows with `✗` warning markers.
4.  **`repo-conflicts-resolved-files-visible`**: Press `h`. Assert snapshot shows resolved files with `✓` and strikethrough paths.
5.  **`repo-conflicts-filter-results`**: Press `/`, type `src/parser`. Assert snapshot shows narrowed list and filter active indicator.
6.  **`repo-conflicts-80x24-layout`**: Resize terminal to 80x24. Assert snapshot truncates descriptions/authors and left-truncates file paths.
7.  **`repo-conflicts-error-501`**: Mock API returning 501. Assert snapshot shows "Conflicts endpoint not available".

### Interaction & Logic Tests

8.  **`repo-conflicts-j-k-navigation`**: Press `j` 3 times, verify `focusedIndex` moves down (regex match reverse video). Press `k` 2 times, verify it moves up.
9.  **`repo-conflicts-enter-toggles-expand`**: Press `Enter` on Change A. Verify files visible. Press `Enter` again. Verify files hidden.
10. **`repo-conflicts-collapse-with-file-focused`**: Expand Change A, press `j` to focus its child file, press `Enter` to collapse. Verify focus correctly snaps back to Change A's row.
11. **`repo-conflicts-enter-on-file-opens-diff`**: Expand change, navigate to file, press `Enter`. Verify navigation to diff view (regex match breadcrumb `Dashboard > owner/repo > Conflicts > [id] > [file]`). Press `q` to return, verify focus is preserved.
12. **`repo-conflicts-d-and-v-shortcuts`**: 
    *   On change row: press `v`, verify nav to change detail. Press `q`.
    *   On file row: press `d`, verify nav to diff view.
13. **`repo-conflicts-filter-clears-on-esc`**: Press `/`, type `test`, press `Esc`. Verify filter input vanishes, text clears, and list resets to full.
14. **`repo-conflicts-expand-collapse-all`**: Press `x`. Verify all changes expand. Press `z`. Verify all collapse.
15. **`repo-conflicts-r-refreshes`**: Press `R`. Verify API mock interceptor registers a new fetch request.

### Edge Case Tests

16. **`repo-conflicts-filter-no-results`**: Filter by a random string. Verify "No matching conflicts" message is displayed within the scrollbox.
17. **`repo-conflicts-resize-preserves-focus`**: Focus the 5th item. Resize from 120x40 to 80x24. Verify the 5th item remains focused and visible.
18. **`repo-conflicts-all-resolved-hidden-msg`**: Mock all conflicts as resolved, `showResolved = false`. Verify "All conflicts resolved. Press `h` to show resolved." message is displayed instead of the list.
19. **`repo-conflicts-network-error-retry`**: Mock 500 error. Verify error message. Press `R`. Mock success. Verify list renders.
20. **`repo-conflicts-rapid-navigation`**: Rapidly press `j` 10 times in a 3-item list. Verify focus clamps to the last item index and does not crash out of bounds.
# Engineering Specification: `tui-repo-file-tree`

## Summary

This ticket implements the file tree sidebar component for the Codeplane TUI code explorer. The component renders a hierarchical, keyboard-navigable directory/file listing within a `<scrollbox>` sidebar pane. It integrates with the `SplitLayout` component (from `tui-repo-sidebar-split-layout`), consumes `useRepoTree` and `useBookmarks` hooks (from `tui-repo-tree-hooks`), and provides the file selection interface for the file preview pane.

The file tree is the primary navigation component for Tab 3 (Code) of the repository overview screen and is reusable within the diff viewer sidebar.

---

## Dependencies

| Dependency | Ticket | What It Provides |
|---|---|---|
| `tui-repo-screen-scaffold` | Implemented | `RepoOverviewScreen`, `RepoContext`, tab navigation, `ScreenComponentProps` |
| `tui-repo-tree-hooks` | Implemented | `useRepoTree()`, `useFileContent()`, `useBookmarks()`, `useRepoFetch()`, `TreeEntry`, `Bookmark` |
| `tui-responsive-layout` | Implemented | `useLayout()`, `useBreakpoint()`, `useSidebarState()`, `useResponsiveValue()` |
| `tui-repo-sidebar-split-layout` | Assumed | `SplitLayout`, `useSplitFocus()` |

---

## Implementation Plan

### Step 1: Define Types and Constants

**File: `apps/tui/src/screens/Repository/CodeExplorer/types.ts`**

Define the internal data structures used by the file tree component. These extend the API-level `TreeEntry` from `tui-repo-tree-hooks` with UI state.

```typescript
import type { TreeEntry } from "../../../hooks/data/repo-tree-types.js";
import type { LoadingError } from "../../../loading/types.js";

export interface TreeNode {
  entry: TreeEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  error: LoadingError | null;
  children: TreeNode[] | null;
  nextCursor: string | null;
  hasMoreChildren: boolean;
}

export interface VisibleEntry {
  node: TreeNode;
  path: string;
  name: string;
  type: "file" | "dir" | "submodule" | "symlink";
  depth: number;
  expanded: boolean;
  loading: boolean;
  error: LoadingError | null;
  linkTarget?: string;
}

export function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    const aIsDir = a.type === "dir" ? 0 : 1;
    const bIsDir = b.type === "dir" ? 0 : 1;
    if (aIsDir !== bIsDir) return aIsDir - bIsDir;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export const MAX_INDENT_DEPTH = 20;
export const DIR_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 128;
export const MAX_SEARCH_PATH_LENGTH = 512;
export const BOOKMARK_DROPDOWN_MAX = 10;
```

---

### Step 2: Implement the Tree State Manager Hook

**File: `apps/tui/src/screens/Repository/CodeExplorer/useTreeState.ts`**

Manages the hierarchical tree state — expanding/collapsing directories, lazy-loading children, tracking focus, pagination, and bookmark switching.

**Interface:**

```typescript
export interface TreeStateOptions {
  owner: string;
  repo: string;
  initialRef: string;
  fetchDirectory: (path: string, ref: string, cursor?: string) => Promise<{
    entries: TreeEntry[];
    nextCursor: string | null;
  }>;
}

export interface TreeState {
  currentRef: string;
  visibleEntries: VisibleEntry[];
  focusedIndex: number;
  selectedFilePath: string | null;
  rootLoading: boolean;
  rootError: LoadingError | null;
  isEmpty: boolean;
  moveFocusDown(n?: number): void;
  moveFocusUp(n?: number): void;
  jumpToFirst(): void;
  jumpToLast(): void;
  pageDown(viewportHeight: number): void;
  pageUp(viewportHeight: number): void;
  expandOrSelect(): void;
  collapseOrParent(): void;
  toggleExpand(): void;
  retryFetch(): void;
  switchRef(ref: string): void;
  setFocusedIndex(index: number): void;
}
```

**Key implementation details:**

1. **Root tree** stored in `useState<TreeNode[]>`. On mount, fetches root via `fetchDirectory("", initialRef)`. Sorts via `sortEntries()`.

2. **Flatten to visible** via `useMemo` depth-first walk. Only entries within expanded directories included. Indentation capped at `MAX_INDENT_DEPTH` (traversal uncapped).

3. **Expand directory** (`expandOrSelect`): Set `node.expanded = true`. If `node.children === null`, set `node.loading = true`, call `fetchDirectory(node.entry.path, currentRef)`. On success: set `node.children`, sort. On error: set `node.error`. If children already fetched, just expand (preserved state).

4. **Collapse directory** (`collapseOrParent`): If on expanded dir → collapse (preserve children state). If on file/collapsed dir → move focus to parent. At root level → no-op.

5. **Bookmark switch** (`switchRef`): Abort all pending fetches via `AbortController`, reset tree, set `currentRef`, re-fetch root.

6. **Focus management**: `focusedIndex` clamped to `[0, visibleEntries.length - 1]`. No wrap at boundaries.

7. **Pagination**: Directories with 100+ entries store `nextCursor` on `TreeNode`. "Load more…" sentinel at end of children. Enter on sentinel fetches next page and appends.

8. **AbortController per fetch**: Stored in `Map<string, AbortController>` keyed by path. Aborted on unmount or bookmark switch.

---

### Step 3: Implement the Search Filter Hook

**File: `apps/tui/src/screens/Repository/CodeExplorer/useTreeSearch.ts`**

```typescript
export interface TreeSearchState {
  active: boolean;
  query: string;
  filteredEntries: VisibleEntry[];
  matchCount: number;
  activate(): void;
  deactivate(): void;
  setQuery(query: string): void;
}
```

- Case-insensitive substring match on `entry.path`
- Special characters treated as literals — no regex
- Max 128 character query, max 512 character path for matching
- `Esc` clears search and returns focus to tree
- "No matches" shown when query has zero results

---

### Step 4: Implement the Bookmark Selector Component

**File: `apps/tui/src/screens/Repository/CodeExplorer/BookmarkSelector.tsx`**

```typescript
export interface BookmarkSelectorProps {
  bookmarks: Bookmark[];
  currentRef: string;
  isOpen: boolean;
  onSelect: (refName: string) => void;
  onDismiss: () => void;
  isLoading: boolean;
  error: string | null;
  availableWidth: number;
}
```

**Rendering:**
- **Closed**: Single row — `currentRef` in `primary` color with `▾` suffix in `muted`
- **Open**: Dropdown list (max `BOOKMARK_DROPDOWN_MAX` visible, scrollable). Current bookmark marked with `●`. Focused entry reverse-video. `j`/`k` navigation, `Enter` selects, `Esc` cancels.
- **Error**: Error text in `error` color. `Esc` dismisses. Current ref preserved.
- Bookmark names truncated at `availableWidth - 4` chars via `truncateText()`.

---

### Step 5: Implement the FileTreeEntry Component

**File: `apps/tui/src/screens/Repository/CodeExplorer/FileTreeEntry.tsx`**

```typescript
export interface FileTreeEntryProps {
  entry: VisibleEntry;
  focused: boolean;
  availableWidth: number;
}
```

**Rendering logic:**

1. **Indentation**: `Math.min(entry.depth, MAX_INDENT_DEPTH) * indentPerLevel` where `indentPerLevel = useResponsiveValue({ minimum: 1, standard: 2, large: 2 })`

2. **Icon prefix** (2 chars):
   - Dir loading: `⟳ ` in `warning` (animated via `useSpinner`)
   - Dir error: `✗ ` in `error`
   - Dir expanded: `▾ ` in `primary`
   - Dir collapsed: `▸ ` in `primary`
   - Submodule: `◆ ` in `muted`
   - File/symlink: `  ` (alignment spaces)

3. **Name styling**:
   - Directory: `primary` color, bold
   - File: default color
   - Symlink: default + ` → {linkTarget}` in `muted`
   - Submodule: `muted` color
   - Truncated with `…` if exceeds `availableWidth - indent - 4`

4. **Focus**: `focused === true` → entire row rendered with reverse-video

5. **Empty dir**: `(empty)` in `muted` at `depth + 1` indentation

---

### Step 6: Implement the FileTree Component

**File: `apps/tui/src/screens/Repository/CodeExplorer/FileTree.tsx`**

```typescript
export interface FileTreeProps {
  owner: string;
  repo: string;
  defaultRef: string;
  focused: boolean;
  onFileSelect: (filePath: string) => void;
  onRefChange: (ref: string) => void;
  sidebarWidth: number;
}
```

**Structure:**
```
<box flexDirection="column" height="100%">
  <BookmarkSelector />
  {search.active && <SearchInput />}
  {rootLoading ? <LoadingSpinner /> :
   rootError ? <ErrorWithRetry /> :
   isEmpty ? <EmptyRepoMessage /> :
   <scrollbox flexGrow={1}>
     {displayEntries.map(entry => <FileTreeEntry />)}
     {search.active && search.matchCount === 0 && <NoMatches />}
   </scrollbox>}
</box>
```

**Keybindings** (registered via `useScreenKeybindings` when `focused`):

| Key | Handler |
|---|---|
| `j` / `Down` | `moveFocusDown()` |
| `k` / `Up` | `moveFocusUp()` |
| `Enter` / `l` | `expandOrSelect()` → if file, `onFileSelect(path)` |
| `h` | `collapseOrParent()` |
| `Space` | `toggleExpand()` (dirs only) |
| `G` | `jumpToLast()` |
| `Ctrl+D` | `pageDown(viewportHeight)` |
| `Ctrl+U` | `pageUp(viewportHeight)` |
| `/` | `search.activate()` |
| `Esc` | Search active → `search.deactivate()`. Else → focus to main pane |
| `b` | Open bookmark selector |
| `R` | `retryFetch()` (on errored entry) |

**Status bar hints**: `j/k:navigate  Enter:open  h:collapse  /:search  b:bookmark  Ctrl+B:sidebar`

**Telemetry**: Emit `tui.repo.file_tree.*` events per product spec (view, expand_dir, collapse_dir, select_file, search, switch_ref, toggle_sidebar, navigate, error, retry, pagination).

---

### Step 7: Implement the CodeExplorerTab Component

**File: `apps/tui/src/screens/Repository/CodeExplorer/CodeExplorerTab.tsx`**

Tab 3 content. Composes `SplitLayout` + `FileTree` + file preview placeholder.

```typescript
export function CodeExplorerTab() {
  const { owner, repo, repoData } = useRepoContext();
  const layout = useLayout();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [currentRef, setCurrentRef] = useState(repoData.default_bookmark ?? "main");

  return (
    <SplitLayout
      sidebar={(focused) => (
        <FileTree
          owner={owner} repo={repo}
          defaultRef={currentRef} focused={focused}
          onFileSelect={setSelectedFilePath}
          onRefChange={setCurrentRef}
          sidebarWidth={computeSidebarCols(layout)}
        />
      )}
      main={(focused) => (
        selectedFilePath
          ? <FilePreviewPlaceholder path={selectedFilePath} focused={focused} />
          : <box justifyContent="center" alignItems="center" height="100%">
              <text fg={theme.muted}>Select a file to preview</text>
            </box>
      )}
      initialFocus="sidebar"
    />
  );
}

function computeSidebarCols(layout: LayoutContext): number {
  if (!layout.sidebarVisible) return 0;
  const pct = layout.breakpoint === "minimum" ? 0.30 : 0.25;
  return Math.max(24, Math.floor(layout.width * pct));
}
```

File preview placeholder shows path + "(pending TUI_REPO_FILE_PREVIEW)" in muted text.

---

### Step 8: Register CodeExplorerTab in Repo Screen

**File: `apps/tui/src/screens/Repository/RepoOverviewScreen.tsx`** (modify)

Replace `PlaceholderTab` for tab index 2 (Code) with `CodeExplorerTab`.

---

### Step 9: Barrel Exports

**File: `apps/tui/src/screens/Repository/CodeExplorer/index.ts`**

Export `CodeExplorerTab`, `FileTree`, `FileTreeEntry`, `BookmarkSelector`, `useTreeState`, `useTreeSearch`, and types.

---

## File Inventory

| File | Type | Purpose |
|---|---|---|
| `apps/tui/src/screens/Repository/CodeExplorer/types.ts` | New | Types, constants, sort function |
| `apps/tui/src/screens/Repository/CodeExplorer/useTreeState.ts` | New | Tree state management hook |
| `apps/tui/src/screens/Repository/CodeExplorer/useTreeSearch.ts` | New | Search filter hook |
| `apps/tui/src/screens/Repository/CodeExplorer/BookmarkSelector.tsx` | New | Bookmark/ref selector component |
| `apps/tui/src/screens/Repository/CodeExplorer/FileTreeEntry.tsx` | New | Single tree row component |
| `apps/tui/src/screens/Repository/CodeExplorer/FileTree.tsx` | New | Main file tree sidebar component |
| `apps/tui/src/screens/Repository/CodeExplorer/CodeExplorerTab.tsx` | New | Tab 3 content (SplitLayout + FileTree + Preview) |
| `apps/tui/src/screens/Repository/CodeExplorer/index.ts` | New | Barrel exports |
| `apps/tui/src/screens/Repository/RepoOverviewScreen.tsx` | Modify | Wire CodeExplorerTab into tab 3 |

---

## Detailed Component Behavior

### Tree Flattening Algorithm

Depth-first traversal of all expanded nodes into flat `VisibleEntry[]`:

```typescript
function flattenTree(nodes: TreeNode[]): VisibleEntry[] {
  const result: VisibleEntry[] = [];
  function walk(node: TreeNode) {
    result.push({
      node, path: node.entry.path, name: node.entry.name,
      type: node.entry.type, depth: node.depth,
      expanded: node.expanded, loading: node.loading,
      error: node.error, linkTarget: node.entry.linkTarget,
    });
    if (node.expanded && node.children) {
      for (const child of node.children) walk(child);
    }
  }
  for (const node of nodes) walk(node);
  return result;
}
```

### Focus & Scroll Synchronization

- `focusedIndex` maps into `visibleEntries`
- `<scrollbox>` scrolls to keep focused entry visible via `scrollChildIntoView`
- Rapid `j`/`k` processed sequentially — each keypress increments/decrements by 1, no debouncing

### Expand/Collapse State Preservation

- Collapse hides children from `visibleEntries` but does NOT remove them from `TreeNode`
- Child directories retain their `expanded` state
- Re-expanding parent immediately shows children with previous expansion state
- No re-fetch on re-expand (children cached)
- Bookmark switch resets ALL state (new root, all expansion cleared, focus to 0, selected file to null)

### Entry Truncation

```typescript
function getNameDisplayWidth(sidebarWidth: number, depth: number, indentPerLevel: number): number {
  const indent = Math.min(depth, MAX_INDENT_DEPTH) * indentPerLevel;
  const iconWidth = 2;
  const padding = 2;
  return Math.max(1, sidebarWidth - indent - iconWidth - padding);
}
```

Names exceeding this width truncated with `…` via `truncateText()` from `apps/tui/src/util/text.ts`.

### Submodule Handling

Displayed with `◆` prefix in `muted`. NOT expandable — `Enter`/`l`/`Space` are no-ops on submodules.

### Symlink Handling

Displayed with ` → {target}` suffix in `muted`. Selectable — `Enter` opens symlink target in preview. Suffix included in truncation calculation.

### Binary File Handling

Selectable in tree. Preview pane shows "Binary file" in muted text. Detection delegated to preview component.

### Pagination

Directories with 100+ entries use cursor-based pagination. First fetch returns up to 100 + `nextCursor`. "Load more…" sentinel appended. Enter on sentinel fetches next page and appends sorted results.

---

## Permissions & Security

- All paths from API responses, never from user input
- Tokens via `useRepoFetch()` Bearer header, never displayed/logged
- 401 → propagate to app-shell auth error screen
- 404 → "Repository not found." + `q`
- 429 → "Rate limited" in warning color, `R` retries after delay
- Search query is literal substring — no regex, no shell expansion
- `owner`/`repo` validated at screen push time, `ref` from bookmark API responses

---

## Telemetry

All events use `emit()` from `apps/tui/src/lib/telemetry.ts`. Global context (`session_id`, `timestamp`, `terminal_width`, `terminal_height`) included automatically.

| Event | Trigger |
|---|---|
| `tui.repo.file_tree.view` | Code tab activated |
| `tui.repo.file_tree.expand_dir` | Directory expanded |
| `tui.repo.file_tree.collapse_dir` | Directory collapsed |
| `tui.repo.file_tree.select_file` | File selected for preview |
| `tui.repo.file_tree.search` | Search filter completed |
| `tui.repo.file_tree.switch_ref` | Bookmark switched |
| `tui.repo.file_tree.toggle_sidebar` | Sidebar toggled |
| `tui.repo.file_tree.navigate` | Cursor moved |
| `tui.repo.file_tree.error` | Fetch failed |
| `tui.repo.file_tree.retry` | Retry attempted |
| `tui.repo.file_tree.pagination` | Next page loaded |

---

## Observability

Logging via `apps/tui/src/lib/logger.ts` to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

| Level | Event |
|---|---|
| `info` | Root loaded, directory expanded, file selected, ref switched |
| `warn` | Fetch failed, rate limited, bookmark list failed |
| `debug` | Cursor moved, search filter applied/cleared, sidebar toggled, resize, pagination |

---

## Error Handling

| Error Case | Recovery | UI |
|---|---|---|
| Root fetch timeout (30s) | "Press R to retry" | Full sidebar error |
| Dir expand timeout (10s) | `⟳` → `✗`, R/Enter retries | Entry-level error |
| 404 repo not found | `q` to go back | Full-screen message |
| 401 auth expired | Propagate to auth screen | Auth error screen |
| 429 rate limited | `R` retries after delay | Entry-level warning |
| 500 server error | `R` retries | Entry-level error |
| Empty repo | Show message | `(empty repository)` centered |
| Empty directory | Show placeholder | `(empty)` indented |
| Bookmark list failure | Esc dismisses, current ref preserved | Selector error |
| Resize during fetch | Fetch continues, re-render | Seamless |
| Resize hides sidebar | Auto-hide, focus → main | Sidebar disappears |
| Bookmark switch during fetch | Abort pending, tree reloads | Clean reset |
| Deep nesting >20 | Indentation caps at 20 | Still navigable |
| React error boundary | Per-tab catch, other tabs unaffected | Error fallback |

---

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test` via `e2e/tui/helpers.ts`. Tests that fail due to unimplemented backends are left failing — never skipped.

---

#### Snapshot Tests (20 tests)

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers";

describe("TUI_REPO_FILE_TREE — Snapshots", () => {
  test("file-tree-initial-load", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3");
      await tui.waitForText("▸");
      expect(tui.snapshot()).toContain("Select a file to preview");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-expanded-directory", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("▾");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-deeply-nested", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/deep-repo"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      for (let i = 0; i < 5; i++) { await tui.sendKeys("Enter"); await tui.waitForText("▾"); await tui.sendKeys("j"); }
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-file-selected", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G", "Enter");
      expect(tui.snapshot()).not.toContain("Select a file to preview");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-empty-directory", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/with-empty-dir"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("(empty)");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-empty-repo", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/empty"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("(empty repository)");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-loading-state", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/slow-repo"], env: { CODEPLANE_API_DELAY_MS: "3000" } });
    try {
      await tui.sendKeys("3");
      expect(tui.snapshot()).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|Loading/);
    } finally { await tui.terminate(); }
  });

  test("file-tree-error-state", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/error-repo"], env: { CODEPLANE_API_FORCE_ERROR: "500" } });
    try {
      await tui.sendKeys("3"); await tui.waitForText("✗");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-search-active", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("/"); await tui.sendText("index");
      expect(tui.snapshot()).toContain("index");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-search-no-matches", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("/"); await tui.sendText("zzzznonexistent");
      await tui.waitForText("No matches");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-bookmark-selector", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("b");
      expect(tui.snapshot()).toContain("●");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-sidebar-hidden", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3");
      expect(tui.snapshot()).not.toContain("▸");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-sidebar-toggled-visible", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.sendKeys("ctrl+b"); await tui.waitForText("▸");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-directories-first-sort", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-truncated-filename", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/long-names"] });
    try {
      await tui.sendKeys("3"); await tui.sendKeys("ctrl+b"); await tui.waitForText("▸");
      expect(tui.snapshot()).toContain("…");
    } finally { await tui.terminate(); }
  });

  test("file-tree-symlink-display", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/with-symlinks"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("→");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-submodule-display", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/with-submodules"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("◆");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-breadcrumb-update", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G", "Enter");
      expect(tui.getLine(0)).toMatch(/Code/);
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-status-bar-hints", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      const status = tui.getLine(tui.rows - 1);
      expect(status).toMatch(/j\/k/);
      expect(status).toMatch(/Enter/);
    } finally { await tui.terminate(); }
  });

  test("file-tree-bookmark-label", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      expect(tui.snapshot()).toMatch(/main|master/);
    } finally { await tui.terminate(); }
  });
});
```

---

#### Keyboard Interaction Tests (35 tests)

```typescript
describe("TUI_REPO_FILE_TREE — Keyboard", () => {
  test("file-tree-j-moves-down", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      const before = tui.snapshot();
      await tui.sendKeys("j");
      expect(tui.snapshot()).not.toEqual(before);
    } finally { await tui.terminate(); }
  });

  test("file-tree-k-moves-up", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("j");
      const atSecond = tui.snapshot();
      await tui.sendKeys("k");
      expect(tui.snapshot()).not.toEqual(atSecond);
    } finally { await tui.terminate(); }
  });

  test("file-tree-k-at-top-noop", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      const before = tui.snapshot();
      await tui.sendKeys("k");
      expect(tui.snapshot()).toEqual(before);
    } finally { await tui.terminate(); }
  });

  test("file-tree-j-at-bottom-noop", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G");
      const before = tui.snapshot();
      await tui.sendKeys("j");
      expect(tui.snapshot()).toEqual(before);
    } finally { await tui.terminate(); }
  });

  test("file-tree-enter-expands-directory", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter");
      await tui.waitForText("▾");
    } finally { await tui.terminate(); }
  });

  test("file-tree-enter-opens-file", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G", "Enter");
      await tui.waitForNoText("Select a file to preview");
    } finally { await tui.terminate(); }
  });

  test("file-tree-l-expands-directory", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("l");
      await tui.waitForText("▾");
    } finally { await tui.terminate(); }
  });

  test("file-tree-l-opens-file", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G", "l");
      await tui.waitForNoText("Select a file to preview");
    } finally { await tui.terminate(); }
  });

  test("file-tree-h-collapses-directory", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("▾");
      await tui.sendKeys("h");
      await tui.waitForNoText("▾");
    } finally { await tui.terminate(); }
  });

  test("file-tree-h-moves-to-parent", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("▾");
      await tui.sendKeys("j"); // move to child
      await tui.sendKeys("h"); // should move to parent
      expect(tui.snapshot()).toContain("▾");
    } finally { await tui.terminate(); }
  });

  test("file-tree-h-on-collapsed-moves-parent", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/deep-repo"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("▾");
      await tui.sendKeys("j", "h");
      expect(tui.snapshot()).toBeDefined();
    } finally { await tui.terminate(); }
  });

  test("file-tree-h-at-root-noop", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      const before = tui.snapshot();
      await tui.sendKeys("h");
      expect(tui.snapshot()).toEqual(before);
    } finally { await tui.terminate(); }
  });

  test("file-tree-space-toggles-expand", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Space"); await tui.waitForText("▾");
      await tui.sendKeys("Space"); await tui.waitForNoText("▾");
    } finally { await tui.terminate(); }
  });

  test("file-tree-space-on-file-noop", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G");
      const before = tui.snapshot();
      await tui.sendKeys("Space");
      expect(tui.snapshot()).toEqual(before);
    } finally { await tui.terminate(); }
  });

  test("file-tree-G-jumps-to-end", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-gg-jumps-to-start", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G", "g", "g");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-ctrl-d-page-down", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/many-files"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      const before = tui.snapshot();
      await tui.sendKeys("ctrl+d");
      expect(tui.snapshot()).not.toEqual(before);
    } finally { await tui.terminate(); }
  });

  test("file-tree-ctrl-u-page-up", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/many-files"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("ctrl+d", "ctrl+u");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-slash-focuses-search", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("/");
      expect(tui.snapshot()).toMatch(/filter files|\//);
    } finally { await tui.terminate(); }
  });

  test("file-tree-search-filters-entries", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("/"); await tui.sendText("test");
      expect(tui.snapshot()).toContain("test");
    } finally { await tui.terminate(); }
  });

  test("file-tree-search-case-insensitive", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("/"); await tui.sendText("README");
      expect(tui.snapshot().toLowerCase()).toContain("readme");
    } finally { await tui.terminate(); }
  });

  test("file-tree-esc-clears-search", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("/"); await tui.sendText("test");
      await tui.sendKeys("Escape");
      await tui.waitForText("▸");
    } finally { await tui.terminate(); }
  });

  test("file-tree-b-opens-bookmark-selector", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("b");
      expect(tui.snapshot()).toContain("●");
    } finally { await tui.terminate(); }
  });

  test("file-tree-bookmark-select-reloads", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("b", "j", "Enter");
      await tui.waitForText("▸");
    } finally { await tui.terminate(); }
  });

  test("file-tree-bookmark-esc-cancels", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("b", "Escape");
      expect(tui.snapshot()).toContain("▸");
    } finally { await tui.terminate(); }
  });

  test("file-tree-ctrl-b-toggles-sidebar", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("ctrl+b"); await tui.waitForNoText("▸");
      await tui.sendKeys("ctrl+b"); await tui.waitForText("▸");
    } finally { await tui.terminate(); }
  });

  test("file-tree-tab-focus-to-preview", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Tab");
      expect(tui.getLine(tui.rows - 1)).toMatch(/S-Tab|tree/);
    } finally { await tui.terminate(); }
  });

  test("file-tree-shift-tab-focus-to-tree", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Tab", "shift+Tab");
      expect(tui.getLine(tui.rows - 1)).toMatch(/j\/k/);
    } finally { await tui.terminate(); }
  });

  test("file-tree-R-retries-error", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/error-on-expand"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("✗");
      await tui.sendKeys("R");
      expect(tui.snapshot()).toBeDefined();
    } finally { await tui.terminate(); }
  });

  test("file-tree-enter-retries-error", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/error-on-expand"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("✗");
      await tui.sendKeys("Enter");
      expect(tui.snapshot()).toBeDefined();
    } finally { await tui.terminate(); }
  });

  test("file-tree-q-pops-screen", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("q");
      await tui.waitForNoText("Code");
    } finally { await tui.terminate(); }
  });

  test("file-tree-rapid-j-presses", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/many-files"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      for (let i = 0; i < 15; i++) await tui.sendKeys("j");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  });

  test("file-tree-expand-preserves-children", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("Enter"); await tui.waitForText("▾");
      await tui.sendKeys("j", "Enter"); // expand child
      await tui.sendKeys("h", "h"); // collapse parent
      await tui.sendKeys("Enter"); // re-expand
      await tui.waitForText("▾");
    } finally { await tui.terminate(); }
  });

  test("file-tree-selection-updates-breadcrumb", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("G", "Enter");
      const h1 = tui.getLine(0);
      await tui.sendKeys("shift+Tab", "k", "Enter");
      const h2 = tui.getLine(0);
      expect(h1).not.toEqual(h2);
    } finally { await tui.terminate(); }
  });

  test("file-tree-help-includes-tree", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try {
      await tui.sendKeys("3"); await tui.waitForText("▸");
      await tui.sendKeys("?");
      expect(tui.snapshot()).toMatch(/navigate|open|collapse|search/);
    } finally { await tui.terminate(); }
  });
});
```

---

#### Responsive Tests (11 tests)

```typescript
describe("TUI_REPO_FILE_TREE — Responsive", () => {
  test("file-tree-80x24-sidebar-hidden", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); expect(tui.snapshot()).not.toContain("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-80x24-sidebar-toggle", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3", "ctrl+b"); await tui.waitForText("▸"); expect(tui.snapshot()).toMatchSnapshot(); } finally { await tui.terminate(); }
  });

  test("file-tree-80x24-truncation", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/long-names"] });
    try { await tui.sendKeys("3", "ctrl+b"); await tui.waitForText("▸"); expect(tui.snapshot()).toContain("…"); } finally { await tui.terminate(); }
  });

  test("file-tree-80x24-reduced-indent", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3", "ctrl+b"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("▾"); expect(tui.snapshot()).toMatchSnapshot(); } finally { await tui.terminate(); }
  });

  test("file-tree-120x40-default-visible", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); expect(tui.snapshot()).toMatchSnapshot(); } finally { await tui.terminate(); }
  });

  test("file-tree-120x40-full-layout", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("▾"); await tui.sendKeys("G", "Enter"); expect(tui.snapshot()).toMatchSnapshot(); } finally { await tui.terminate(); }
  });

  test("file-tree-200x60-expanded-layout", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); expect(tui.snapshot()).toMatchSnapshot(); } finally { await tui.terminate(); }
  });

  test("file-tree-resize-standard-to-min", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("▾"); await tui.resize(80, 24); expect(tui.snapshot()).not.toContain("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-resize-min-to-standard", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.resize(120, 40); await tui.waitForText("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-resize-preserves-focus", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("j", "j"); await tui.resize(200, 60); expect(tui.snapshot()).toMatchSnapshot(); } finally { await tui.terminate(); }
  });

  test("file-tree-resize-during-fetch", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-overview", "--repo", "alice/slow-repo"], env: { CODEPLANE_API_DELAY_MS: "2000" } });
    try { await tui.sendKeys("3"); await tui.resize(200, 60); await tui.waitForText("▸", 15000); } finally { await tui.terminate(); }
  });
});
```

---

#### Integration Tests (12 tests)

```typescript
describe("TUI_REPO_FILE_TREE — Integration", () => {
  test("file-tree-auth-expiry", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"], env: { CODEPLANE_TOKEN: "expired-token" } });
    try { await tui.sendKeys("3"); await tui.waitForText("expired", 15000); } finally { await tui.terminate(); }
  });

  test("file-tree-rate-limit-429", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/rate-limited"], env: { CODEPLANE_API_FORCE_STATUS: "429" } });
    try { await tui.sendKeys("3"); await tui.waitForText("Rate limited", 15000); } finally { await tui.terminate(); }
  });

  test("file-tree-network-error-root", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"], env: { CODEPLANE_API_URL: "http://localhost:1" } });
    try { await tui.sendKeys("3"); await tui.waitForText("✗", 35000); } finally { await tui.terminate(); }
  });

  test("file-tree-network-error-expand", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/error-on-expand"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("✗"); expect(tui.snapshot()).toContain("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-server-error-500", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/server-error"], env: { CODEPLANE_API_FORCE_STATUS: "500" } });
    try { await tui.sendKeys("3"); await tui.waitForText("✗", 15000); } finally { await tui.terminate(); }
  });

  test("file-tree-bookmark-switch-cancels", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"], env: { CODEPLANE_API_DELAY_MS: "3000" } });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter", "b", "j", "Enter"); await tui.waitForText("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-bookmark-switch-resets", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("▾"); await tui.sendKeys("b", "j", "Enter"); const snap = tui.snapshot(); expect(snap).not.toContain("▾"); expect(snap).toContain("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-tab-switch-preserves", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("▾"); await tui.sendKeys("1", "3"); await tui.waitForText("▾"); } finally { await tui.terminate(); }
  });

  test("file-tree-deep-link-code-tab", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example", "--tab", "code"] });
    try { await tui.waitForText("Code"); await tui.waitForText("▸"); } finally { await tui.terminate(); }
  });

  test("file-tree-concurrent-expands", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter", "j", "j", "j", "Enter"); await tui.waitForText("▾"); } finally { await tui.terminate(); }
  });

  test("file-tree-select-then-back", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/example"] });
    try { await tui.sendKeys("3"); await tui.waitForText("▸"); await tui.sendKeys("Enter"); await tui.waitForText("▾"); await tui.sendKeys("G", "Enter"); await tui.sendKeys("q"); } finally { await tui.terminate(); }
  });

  test("file-tree-empty-repo-code-tab", async () => {
    const tui = await launchTUI({ args: ["--screen", "repo-overview", "--repo", "alice/empty"] });
    try { await tui.sendKeys("3"); await tui.waitForText("(empty repository)"); } finally { await tui.terminate(); }
  });
});
```

---

## Test Philosophy

1. **Tests that fail due to unimplemented backends are left failing.** API endpoints may return 501. Tests will fail until backend implements them. Never skipped.
2. **No mocking.** Tests run against real TUI process via PTY. No React internals mocked.
3. **Each test validates one behavior.** Named after user-facing behavior.
4. **Snapshots supplementary.** Primary assertions are `waitForText`, `toContain`, `toMatch`.
5. **Tests independent.** Fresh TUI instance per test. No shared state.
6. **Representative sizes.** Snapshots at 80×24, 120×40, 200×60.

---

## Implementation Sequence

1. `types.ts` — Pure types, zero dependencies. `tsc --noEmit` verifiable.
2. `useTreeState.ts` — Core state. Smoke-testable with mock fetch.
3. `useTreeSearch.ts` — Pure filter of visible entries.
4. `FileTreeEntry.tsx` — Single row renderer. Visual only.
5. `BookmarkSelector.tsx` — Self-contained dropdown.
6. `FileTree.tsx` — Full sidebar composing 2–5.
7. `CodeExplorerTab.tsx` — Tab content with SplitLayout.
8. Wire into `RepoOverviewScreen` — Replace PlaceholderTab.
9. Write E2E tests — All 78 tests in `e2e/tui/repository.test.ts`.

---

## Productionization Notes

All code targets production (`apps/tui/src/`). No POC phase.

**Pre-merge validation:**
1. `tsc --noEmit` passes in `apps/tui/`
2. All imports resolve via barrel exports
3. No keybinding conflicts between FileTree and global/tab keybindings
4. Memory stable under repeated expand/collapse (children reused)
5. AbortController cleanup on unmount and bookmark switch

**Assumptions:**
1. `SplitLayout` from `tui-repo-sidebar-split-layout` is available. Fallback: manual `<box flexDirection="row">` split.
2. `useRepoTree` returns `{ entries, isLoading, error, refetch, fetchPath }` per `tui-repo-tree-hooks` spec.
3. `RepoContext` provided by `RepoOverviewScreen` per `tui-repo-screen-scaffold`.
4. Full file preview deferred to `TUI_REPO_FILE_PREVIEW` — this ticket includes placeholder.
5. `FileTree` is reusable in diff viewer (`TUI_DIFF_FILE_TREE`) with different file list and selection handler.
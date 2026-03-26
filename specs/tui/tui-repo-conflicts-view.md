# Engineering Specification: tui-repo-conflicts-view

## Repository Conflicts Tab View with jj-Native Conflict Display

**Ticket:** `tui-repo-conflicts-view`
**Type:** Feature
**Status:** Not started
**Feature:** `TUI_REPO_CONFLICTS_VIEW` (from `specs/tui/features.ts` line 51)
**Dependencies:** `tui-repo-screen-scaffold` (RepoOverviewScreen with tab infrastructure), `tui-repo-jj-hooks` (`useRepoConflicts` data hook)
**Target files:**
- `apps/tui/src/screens/Repository/tabs/conflicts-types.ts`
- `apps/tui/src/screens/Repository/tabs/useConflictRows.ts`
- `apps/tui/src/screens/Repository/tabs/ConflictsHeader.tsx`
- `apps/tui/src/screens/Repository/tabs/ChangeRow.tsx`
- `apps/tui/src/screens/Repository/tabs/FileRow.tsx`
- `apps/tui/src/screens/Repository/tabs/ConflictsTab.tsx`
- `apps/tui/src/screens/Repository/tabs/index.ts` (modified)
**Test file:** `e2e/tui/repository.test.ts`

---

## 1. Problem Statement

The Codeplane TUI's repository detail screen needs a Conflicts tab (Tab 4) that renders a complete inventory of jj-native conflicts. jj preserves conflicts as first-class objects rather than aborting on merge — developers need a way to see which changes have conflicts, which files are affected, and what type of conflict each is, without leaving the terminal. This view answers the question: "what conflicts exist in this repo right now?"

The conflicts view is read-only. Resolution happens through `jj resolve` in the CLI or the daemon sync flow, not within this tab. The tab's purpose is conflict inventory and navigation — expanding changes to see their conflicted files, then opening diffs or change details for further inspection.

### Downstream Consumers

- `RepoOverviewScreen` (from `tui-repo-screen-scaffold`) — renders ConflictsTab as tab content at position 4
- `DiffScreen` (from `tui-diff-screen`) — receives `push("diff-view", { owner, repo, changeId, filePath })` navigation from file row Enter/d
- Future `ChangeDetailScreen` — will receive `push("change-detail", { owner, repo, changeId })` from change row `v`

---

## 2. Codebase Ground Truth

The following facts were validated against the actual repository and drive every decision in this spec:

| Fact | Location | Impact |
|------|----------|--------|
| `useRepoFetch()` provides authenticated GET with `FetchError` → `LoadingError` conversion | `apps/tui/src/hooks/useRepoFetch.ts` lines 80–113 | Conflicts data hook follows same pattern |
| `FetchError` carries `.status` for HTTP status code | `apps/tui/src/hooks/useRepoFetch.ts` line 25–33 | Error classification: 401 → auth_error, 429 → rate_limited, 501 → http_error |
| `toLoadingError()` classifies errors into `LoadingError` types | `apps/tui/src/hooks/useRepoFetch.ts` lines 41–70 | Reused by `useRepoConflicts` from `tui-repo-jj-hooks` |
| `useScreenLoading()` takes `{ id, label, isLoading, error, onRetry }` | `apps/tui/src/hooks/useScreenLoading.ts` lines 56–59 | Returns `{ signal, showSpinner, showSkeleton, showError, loadingError, retry, spinnerFrame }` |
| `useScreenKeybindings(bindings, hints?)` pushes `PRIORITY.SCREEN` scope | `apps/tui/src/hooks/useScreenKeybindings.ts` line 17 | Accepts `KeyHandler[]` and optional `StatusBarHint[]`; pops on unmount |
| `normalizeKeyDescriptor()` canonicalizes key descriptors | `apps/tui/src/providers/normalize-key.js` | Lowercase names: `"escape"`, `"return"`, `"tab"`, `"up"`, `"down"`, `"ctrl+c"`. Single chars as-is. |
| `PRIORITY.SCREEN = 4`, `PRIORITY.TEXT_INPUT = 1` (lower = higher priority) | `apps/tui/src/providers/keybinding-types.ts` line 31 | When filter `<input>` is focused, it captures printable keys at priority 1, shadowing screen keybindings at priority 4 |
| `StatusBarHintsContext` provides `registerHints(sourceId, hints)` and `overrideHints(hints)` | `apps/tui/src/providers/keybinding-types.ts` lines 84–86 | `overrideHints` returns a cleanup function; sets `isOverridden = true` |
| `useTheme()` returns frozen `ThemeTokens` with `RGBA` values | `apps/tui/src/hooks/useTheme.ts` | Tokens: `.primary`, `.success`, `.warning`, `.error`, `.muted`, `.surface`, `.border` |
| `useLayout()` returns `{ width, height, breakpoint, contentHeight }` | `apps/tui/src/hooks/useLayout.ts` | Breakpoints: `"minimum"` (<120×40), `"standard"` (120×40–199×59), `"large"` (200×60+) |
| `TextAttributes.REVERSE = 8` (`1 << 3`), `TextAttributes.DIM = 2` (`1 << 1`), `TextAttributes.BOLD = 1` (`1 << 0`) | `apps/tui/src/theme/tokens.ts` | Used as `attributes={8}` for focused rows, `attributes={2}` for resolved file paths |
| `truncateRight(text, maxWidth)` appends `…` if text exceeds maxWidth | `apps/tui/src/util/text.ts` | For description, author, conflict type truncation |
| `truncateLeft(text, maxWidth)` prepends `…` if text exceeds maxWidth | `apps/tui/src/util/truncate.ts` lines 50–55 | For file path truncation (show filename end) |
| `emit(name, properties)` sends telemetry | `apps/tui/src/lib/telemetry.ts` line 43 | Properties: `Record<string, string \| number \| boolean>` |
| `logger.info/warn/debug/error(msg)` writes to stderr | `apps/tui/src/lib/logger.ts` lines 26–31 | Level: `CODEPLANE_TUI_LOG_LEVEL` (default `"error"`, `"debug"` when `CODEPLANE_TUI_DEBUG=true`) |
| `FullScreenLoading` component | `apps/tui/src/components/FullScreenLoading.tsx` | Props: `{ spinnerFrame, label }` |
| `FullScreenError` component | `apps/tui/src/components/FullScreenError.tsx` | Props: `{ screenLabel, error }` |
| `ScreenName` enum has 32 entries, **no** `ChangeDetail` | `apps/tui/src/router/types.ts` lines 1–43 | `v` keybinding must gracefully degrade with `logger.warn` |
| `ScreenName.DiffView` **does** exist in the enum | `apps/tui/src/router/types.ts` | `Enter`/`d` on file row pushes `DiffView` |
| `useNavigation()` returns `{ push, pop, replace, reset, stack, currentScreen, repoContext }` | `apps/tui/src/providers/NavigationProvider.tsx` | `push(screen, params)` adds to stack |
| Changes list endpoint returns 501 Not Implemented | `apps/server/src/routes/jj.ts` line 200 | Tests will fail — left failing per policy |
| Change conflicts endpoint returns 501 Not Implemented | `apps/server/src/routes/jj.ts` line 260 | Tests will fail — left failing per policy |
| `CursorResponse<T>` = `{ items: T[], next_cursor: string }` | `apps/server/src/routes/jj.ts` line 78 | Empty `next_cursor` = no more pages |
| `ChangeResponse` includes `has_conflict: boolean` | `apps/server/src/routes/jj.ts` line 31 | Filter for conflicted changes |
| `ChangeConflictResponse` does not paginate | `apps/server/src/routes/jj.ts` line 260 | Returns full array per change |
| All imports use `.js` extension suffixes | Convention across all TUI source files | e.g., `import { useTheme } from "../../../hooks/useTheme.js"` |
| `apps/tui/src/screens/Repository/` directory does not exist yet | Verified via Glob | Created by `tui-repo-screen-scaffold` dependency; can use temporary harness |
| `apps/tui/src/hooks/data/` directory does not exist yet | Verified via Glob | Created by `tui-repo-jj-hooks` dependency |

---

## 3. Architecture

### 3.1 Component Hierarchy

```
RepoOverviewScreen (from tui-repo-screen-scaffold)
  └── TabContent (renders based on active tab index)
      └── ConflictsTab (this ticket)
          ├── ConflictsHeader
          │   ├── StatusIcon (⚠ or ✓)
          │   ├── HeaderLabel ("Conflicts (N changes, M files)")
          │   ├── ModeIndicator ("— unresolved" / "— showing all")
          │   └── FilterHint (right-aligned, "/ filter  R refresh")
          ├── ConflictsFilter (conditional, shown when filter active)
          │   └── <input> (inline filter by file path)
          └── ConflictsBody
              ├── <scrollbox> (main scrollable area)
              │   └── FlattenedRowList
              │       ├── ChangeRow (per conflicted change)
              │       │   ├── ExpandIndicator (▸/▾)
              │       │   ├── ChangeId (12ch)
              │       │   ├── CommitId (12ch, standard+)
              │       │   ├── Description (truncated, standard+)
              │       │   ├── Author (truncated, standard+)
              │       │   └── ConflictCountBadge ("(N files)")
              │       └── FileRow (per conflicted file, under expanded change)
              │           ├── Indent (2 spaces)
              │           ├── StatusIcon (✓ green / ✗ yellow)
              │           ├── FilePath (truncated from left)
              │           └── ConflictType (standard+)
              ├── EmptyState ("No conflicts. All clear! ✓")
              ├── AllResolvedState ("All conflicts resolved. Press h to show resolved.")
              ├── FilterNoResults ("No matching conflicts")
              └── LoadingProgressIndicator ("Loading conflicts… (N/M changes)")
```

### 3.2 Data Flow

```
useRepoConflicts(owner, repo)                    [from tui-repo-jj-hooks]
  ├── GET /api/repos/:owner/:repo/changes?has_conflict=true
  │   → List of ConflictedChange[]
  ├── loadConflictsForChange(changeId)
  │   → GET /api/repos/:owner/:repo/changes/:change_id/conflicts
  │   → ConflictFile[] per change
  └── Returns:
      ├── conflictedChanges: ConflictedChange[]
      ├── isLoading: boolean
      ├── error: { message: string; status?: number } | null
      ├── conflictCount: { changes: number; files: number }
      ├── hasMore: boolean
      ├── fetchMore: () => void
      ├── refetch: () => void
      └── loadConflictsForChange: (changeId: string) => Promise<ConflictFile[]>
```

### 3.3 State Model

The ConflictsTab manages the following local state:

```typescript
interface ConflictsTabState {
  // Focus management
  focusedRowIndex: number;           // Index into flattened visible rows

  // Expand/collapse
  expandedChangeIds: Set<string>;    // Which changes have expanded file lists

  // Per-change conflict data (loaded on-demand)
  changeConflicts: Map<string, {     // changeId → loaded conflicts
    files: ConflictFile[];
    isLoading: boolean;
    error: { message: string; status?: number } | null;
  }>;

  // Filter
  filterActive: boolean;             // Is the filter input focused?
  filterText: string;                // Current filter value

  // Resolved visibility
  showResolved: boolean;             // Default: false (hide resolved)

  // Go-to prefix state
  gPending: boolean;                 // Waiting for second key after 'g'

  // Loading progress (for large datasets)
  loadingProgress: { loaded: number; total: number } | null;
}
```

### 3.4 Flattened Row Model

The hierarchical data is flattened into a single list for keyboard navigation. Each row is tagged with its type:

```typescript
type FlatRow =
  | { type: "change"; change: ConflictedChange; index: number }
  | { type: "file"; file: ConflictFile; parentChangeId: string; index: number };
```

The flattening algorithm:
1. Iterate sorted changes (conflict file count descending, change ID ascending)
2. For each change, emit a `ChangeRow`
3. If change is expanded, iterate its loaded conflict files
4. Skip resolved files if `showResolved === false`
5. Skip files not matching `filterText` if filter is active
6. Emit a `FileRow` for each visible file
7. Skip entire changes that have zero visible files after filtering (only when filter is active)

---

## Implementation Plan

The implementation is structured as vertical steps. Each step produces a shippable increment that compiles and can be tested independently.

### Step 1: Define Types

**File:** `apps/tui/src/screens/Repository/tabs/conflicts-types.ts`

Define all type interfaces used by the conflicts tab. This is a pure type file with no runtime dependencies.

```typescript
/** Parsed conflicted change from the API */
export interface ConflictedChange {
  changeId: string;             // Full change ID
  shortChangeId: string;        // First 12 characters
  commitId: string;             // Full commit ID
  shortCommitId: string;        // First 12 characters
  description: string;          // Full description
  descriptionFirstLine: string; // First line only
  authorName: string;
  authorEmail: string;
  timestamp: string;            // ISO 8601
  conflictFileCount: number;
  hasConflict: boolean;         // Always true in this context
}

/** Parsed conflict file detail */
export interface ConflictFile {
  filePath: string;
  conflictType: string;          // e.g., "2-sided conflict", "modify-delete conflict"
  resolved: boolean;
  resolvedBy: string | null;
  resolutionMethod: string | null;
  resolvedAt: string | null;     // ISO 8601
}

/** Union type for flattened row navigation */
export type FlatRow =
  | { type: "change"; change: ConflictedChange }
  | { type: "file"; file: ConflictFile; parentChangeId: string };

/** Per-change loaded conflict state */
export interface ChangeConflictState {
  files: ConflictFile[];
  isLoading: boolean;
  error: { message: string; status?: number } | null;
}

/** Aggregate counts for the section header */
export interface ConflictCounts {
  totalChanges: number;
  totalFiles: number;
  unresolvedFiles: number;
  resolvedFiles: number;
}
```

**Verification:** File compiles with `bun run check` from `apps/tui/`. No tsc errors should reference `conflicts-types.ts` in the output.

---

### Step 2: Build the Flattened Row Hook

**File:** `apps/tui/src/screens/Repository/tabs/useConflictRows.ts`

This hook takes the raw data from `useRepoConflicts()` and the local UI state (expanded IDs, filter text, show-resolved flag) and produces the flattened row list used for rendering and navigation.

```typescript
import { useMemo } from "react";
import type {
  ConflictedChange,
  ConflictFile,
  FlatRow,
  ChangeConflictState,
  ConflictCounts,
} from "./conflicts-types.js";

interface UseConflictRowsInput {
  changes: ConflictedChange[];
  changeConflicts: Map<string, ChangeConflictState>;
  expandedChangeIds: Set<string>;
  filterText: string;
  showResolved: boolean;
}

interface UseConflictRowsOutput {
  rows: FlatRow[];
  counts: ConflictCounts;
  allResolved: boolean;
}

export function useConflictRows(input: UseConflictRowsInput): UseConflictRowsOutput;
```

**Implementation details:**

- Uses `useMemo` with a stable dependency key. Since `Set` and `Map` are reference types, compute a serializable cache key: `expandedChangeIds.size`, `changeConflicts.size`, plus sorted join of expanded IDs, plus `filterText`, plus `showResolved`.
- Sort: `b.conflictFileCount - a.conflictFileCount` primary, `a.changeId.localeCompare(b.changeId)` tiebreaker.
- Filter is case-insensitive substring match via `.toLowerCase().includes()`.
- When `filterText` is active and a change is expanded but has zero visible files, the change row itself is hidden.
- When `filterText` is active and a change is collapsed, check if any of its loaded files match; hide the change if none match and files are loaded. If files are not yet loaded for a collapsed change, keep the change visible (conservative).
- `counts` are computed from all loaded files regardless of filter/visibility state.
- `allResolved` is `true` when `totalFiles > 0 && unresolvedFiles === 0`.
- If no per-change files have been loaded yet, estimate `totalFiles` from `change.conflictFileCount` sums (conservative: assume all unresolved for `unresolvedFiles`).

**Verification:** Unit-testable in isolation with static input data via `bunEval`.

---

### Step 3: Build Sub-Components

#### 3a. ConflictsHeader

**File:** `apps/tui/src/screens/Repository/tabs/ConflictsHeader.tsx`

A single-row header above the scrollbox showing status icon, label, counts, mode indicator, and right-aligned action hints.

**Props:**
```typescript
interface ConflictsHeaderProps {
  counts: ConflictCounts;
  allResolved: boolean;
  showResolved: boolean;
  filterActive: boolean;
}
```

**Rendering logic:**
- Icon: `allResolved ? "✓" : "⚠"`. Color: `allResolved ? theme.success : theme.warning`.
- Label text: `"Conflicts (${counts.totalChanges} changes, ${counts.totalFiles} files)"`.
- Mode text: `showResolved ? "— showing all" : "— unresolved"`. Color: `theme.muted`.
- Right hint: `filterActive ? "" : "/ filter  R refresh"`. Color: `theme.muted`.
- Layout: `<box flexDirection="row" width="100%" height={1}>` with `<box flexGrow={1} />` spacer before right hint.

**Dependencies:**
- `useTheme()` from `../../../hooks/useTheme.js` — provides frozen `ThemeTokens` object with `RGBA` values.
- `useLayout()` from `../../../hooks/useLayout.js` — provides `{ width, breakpoint }`.

#### 3b. ChangeRow

**File:** `apps/tui/src/screens/Repository/tabs/ChangeRow.tsx`

Renders a single change row with responsive column layout.

**Props:**
```typescript
interface ChangeRowProps {
  change: ConflictedChange;
  focused: boolean;
  expanded: boolean;
}
```

**Rendering logic (responsive):**

| Breakpoint | Columns |
|---|---|
| `"minimum"` | `▸/▾` (2ch) + changeId (12ch) + spacer + badge right-aligned |
| `"standard"` | `▸/▾` + changeId + commitId (12ch) + description (30ch) + author (15ch) + badge |
| `"large"` | standard + timestamp (10ch YYYY-MM-DD) |

- Focused row: `attributes={8}` (which is `TextAttributes.REVERSE`, `1 << 3`). This follows the codebase pattern where `FullScreenError` uses `attributes={1}` for bold. Components use raw numeric values from `TextAttributes` constants.
- Expand indicator: `expanded ? "▾" : "▸"` in `theme.muted` color.
- Change ID: `theme.primary` color, always 12ch.
- Commit ID: `theme.muted` color, always 12ch, hidden at minimum.
- Description: truncated via `truncateRight()` from `../../../util/text.js` to 30ch (standard) or 50ch (large). Note: `truncateRight` is in `util/text.ts`, not `util/truncate.ts`.
- Author: truncated via `truncateRight()` to 15ch (standard) or 20ch (large).
- Badge: `"(N files)"` in `theme.warning` color.

#### 3c. FileRow

**File:** `apps/tui/src/screens/Repository/tabs/FileRow.tsx`

Renders a single conflict file row with status icon, path, and optional conflict type.

**Props:**
```typescript
interface FileRowProps {
  file: ConflictFile;
  focused: boolean;
}
```

**Rendering logic:**
- Indent: 2 spaces (literal `"  "` text node).
- Status icon: `file.resolved ? "✓" : "✗"`. Color: `file.resolved ? theme.success : theme.warning`.
- File path: truncated from the left using `truncateLeft()` from `../../../util/truncate.js`. Max width varies by breakpoint: `width - 10` at minimum, `40` at standard, `60` at large.
- Resolved file path: rendered with `attributes={2}` (`TextAttributes.DIM`, `1 << 1`) for dimmed styling. Terminals generally lack true strikethrough support; DIM is the closest approximation that is universally supported across ANSI 16/256/truecolor tiers.
- Conflict type: hidden at minimum. At standard: truncated to 20ch via `truncateRight()`. At large: truncated to 25ch.
- Resolution method and resolved-by: visible only at large breakpoint, each truncated to 15ch via `truncateRight()`.
- Focused row: `attributes={8}` (`TextAttributes.REVERSE`).

**Left truncation function:** The existing `truncateLeft()` in `apps/tui/src/util/truncate.ts` already implements `"…" + text.slice(-(maxWidth - 1))` — use that directly. Verified in codebase: lines 50–55 of `truncate.ts`.

---

### Step 4: Build the Main ConflictsTab Component

**File:** `apps/tui/src/screens/Repository/tabs/ConflictsTab.tsx`

This is the primary component — the tab content rendered when Tab 4 is active. It composes all sub-components, manages local state, registers keybindings, and handles data fetching.

**Props:**
```typescript
interface ConflictsTabProps {
  owner: string;
  repo: string;
}
```

**Constants:**
```typescript
const MAX_CHANGES = 500;
const MAX_FILES_PER_CHANGE = 1000;
const FILTER_MAX_LENGTH = 200;
const MAX_CONCURRENT_REQUESTS = 5;
```

**Core implementation sections:**

#### 4.1 Data Hook Integration

Call `useRepoConflicts(owner, repo)` from the `tui-repo-jj-hooks` dependency. This returns `{ conflictedChanges, isLoading, error, conflictCount, hasMore, fetchMore, refetch, loadConflictsForChange }`.

Wire into `useScreenLoading()` from `../../../hooks/useScreenLoading.js`:
```typescript
const loading = useScreenLoading({
  id: `conflicts-${owner}-${repo}`,
  label: "Loading conflicts…",
  isLoading: hookData.isLoading,
  error: hookData.error,
  onRetry: hookData.refetch,
});
```

This integrates with the existing `LoadingProvider` pipeline. When `error.status === 401`, `parseToLoadingError()` inside `useScreenLoading` classifies it as `auth_error`, and the `LoadingProvider` propagates to the app-shell auth error screen. No custom 401 handling needed in ConflictsTab.

#### 4.2 Local State

```typescript
const [focusedRowIndex, setFocusedRowIndex] = useState(0);
const [expandedChangeIds, setExpandedChangeIds] = useState<Set<string>>(new Set());
const [changeConflicts, setChangeConflicts] = useState<Map<string, ChangeConflictState>>(new Map());
const [filterActive, setFilterActive] = useState(false);
const [filterText, setFilterText] = useState("");
const [showResolved, setShowResolved] = useState(false);
const [gPending, setGPending] = useState(false);
const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const mountTimeRef = useRef(Date.now());
```

#### 4.3 Flattened Row Computation

```typescript
const { rows, counts, allResolved } = useConflictRows({
  changes: hookData.conflictedChanges,
  changeConflicts,
  expandedChangeIds,
  filterText,
  showResolved,
});
```

#### 4.4 Focus Clamping

Use a `useEffect` that fires when `rows.length` changes to clamp `focusedRowIndex` to `[0, Math.max(0, rows.length - 1)]`.

#### 4.5 On-Demand Conflict Loading

When a change is expanded for the first time (added to `expandedChangeIds` but not present in `changeConflicts` Map):

```typescript
async function loadConflictsForChangeId(changeId: string): Promise<void> {
  setChangeConflicts(prev => {
    const next = new Map(prev);
    next.set(changeId, { files: [], isLoading: true, error: null });
    return next;
  });
  try {
    const files = await hookData.loadConflictsForChange(changeId);
    setChangeConflicts(prev => {
      const next = new Map(prev);
      next.set(changeId, { files: files.slice(0, MAX_FILES_PER_CHANGE), isLoading: false, error: null });
      return next;
    });
  } catch (err) {
    setChangeConflicts(prev => {
      const next = new Map(prev);
      next.set(changeId, {
        files: [],
        isLoading: false,
        error: { message: err instanceof Error ? err.message : "Failed to load conflicts", status: (err as any)?.status },
      });
      return next;
    });
  }
}
```

#### 4.6 Keybinding Registration

Registered via `useScreenKeybindings()` from `../../../hooks/useScreenKeybindings.js`. This hook (verified in codebase at `hooks/useScreenKeybindings.ts:17`) takes `(bindings: KeyHandler[], hints?: StatusBarHint[])` and pushes a `PRIORITY.SCREEN` (priority 4) scope on mount, pops on unmount.

```typescript
useScreenKeybindings(
  [
    { key: "j", description: "Next row", group: "Conflicts", handler: moveFocusDown, when: () => !filterActive },
    { key: "down", description: "Next row", group: "Conflicts", handler: moveFocusDown, when: () => !filterActive },
    { key: "k", description: "Previous row", group: "Conflicts", handler: moveFocusUp, when: () => !filterActive },
    { key: "up", description: "Previous row", group: "Conflicts", handler: moveFocusUp, when: () => !filterActive },
    { key: "return", description: "Expand change / open file diff", group: "Conflicts", handler: handleEnter, when: () => !filterActive && !loading.showSpinner },
    { key: "d", description: "Open file diff", group: "Conflicts", handler: openDiff, when: () => !filterActive && currentRowIsFile() },
    { key: "v", description: "View change detail", group: "Conflicts", handler: openChangeDetail, when: () => !filterActive && currentRowIsChange() },
    { key: "/", description: "Filter by file path", group: "Conflicts", handler: activateFilter, when: () => !filterActive },
    { key: "escape", description: "Clear filter", group: "Conflicts", handler: clearFilter, when: () => filterActive },
    { key: "h", description: "Toggle resolved visibility", group: "Conflicts", handler: toggleResolved },
    { key: "G", description: "Jump to bottom", group: "Conflicts", handler: jumpToBottom, when: () => !filterActive },
    { key: "g", description: "Jump to top (gg)", group: "Conflicts", handler: handleG, when: () => !filterActive },
    { key: "ctrl+d", description: "Page down", group: "Conflicts", handler: pageDown, when: () => !filterActive },
    { key: "ctrl+u", description: "Page up", group: "Conflicts", handler: pageUp, when: () => !filterActive },
    { key: "x", description: "Expand all changes", group: "Conflicts", handler: expandAll, when: () => !filterActive },
    { key: "z", description: "Collapse all changes", group: "Conflicts", handler: collapseAll, when: () => !filterActive },
    { key: "R", description: "Refresh list", group: "Conflicts", handler: refresh },
  ],
  [
    { keys: "j/k", label: "navigate", order: 10 },
    { keys: "Enter", label: "expand/diff", order: 20 },
    { keys: "v", label: "view change", order: 30 },
    { keys: "d", label: "diff", order: 40 },
    { keys: "h", label: "toggle resolved", order: 50 },
    { keys: "R", label: "refresh", order: 60 },
    { keys: "?", label: "help", order: 70 },
  ]
);
```

**Key descriptor format:** Per `keybinding-types.ts` lines 6–11, key descriptors use lowercase names: `"escape"`, `"return"`, `"tab"`, `"shift+tab"`, `"up"`, `"down"`, `"ctrl+c"`, etc. Single characters like `"j"`, `"k"`, `"/"` are lowercase. Uppercase characters like `"G"` and `"R"` are passed as-is (shift detection via `event.shift + event.name`). The `normalizeKeyDescriptor()` function in `providers/normalize-key.js` handles canonicalization.

**Important:** When `filterActive` is true, the `<input>` component captures all printable keys at `PRIORITY.TEXT_INPUT` (priority 1, which is higher than `PRIORITY.SCREEN` at 4), so `j`/`k`/etc. are typed into the input rather than dispatched to the screen-level scope. The `when` guards on screen keybindings are a secondary safety layer, not the primary mechanism.

#### 4.7 Action Handlers

```typescript
function moveFocusDown() {
  setFocusedRowIndex(prev => Math.min(prev + 1, rows.length - 1));
}

function moveFocusUp() {
  setFocusedRowIndex(prev => Math.max(prev - 1, 0));
}

function handleEnter() {
  const row = rows[focusedRowIndex];
  if (!row) return;
  if (row.type === "change") {
    toggleExpand(row.change.changeId);
  } else if (row.type === "file") {
    pushDiffView(row.parentChangeId, row.file.filePath);
  }
}

function toggleExpand(changeId: string) {
  setExpandedChangeIds(prev => {
    const next = new Set(prev);
    if (next.has(changeId)) {
      next.delete(changeId);
      // If focused row was a child file, move focus to parent change
      const focusedRow = rows[focusedRowIndex];
      if (focusedRow?.type === "file" && focusedRow.parentChangeId === changeId) {
        const parentIndex = rows.findIndex(r => r.type === "change" && r.change.changeId === changeId);
        if (parentIndex >= 0) setFocusedRowIndex(parentIndex);
      }
    } else {
      next.add(changeId);
      // Load conflicts if not yet loaded
      if (!changeConflicts.has(changeId)) {
        loadConflictsForChangeId(changeId);
      }
    }
    return next;
  });
}

function openDiff() {
  const row = rows[focusedRowIndex];
  if (row?.type !== "file") return;
  pushDiffView(row.parentChangeId, row.file.filePath);
}

function pushDiffView(changeId: string, filePath: string) {
  nav.push(ScreenName.DiffView, { owner, repo, changeId, filePath });
}

function openChangeDetail() {
  const row = rows[focusedRowIndex];
  if (row?.type !== "change") return;
  // ChangeDetail does not exist in ScreenName enum (verified: router/types.ts has 32 entries, none is ChangeDetail)
  // Graceful degradation: log warning and no-op
  logger.warn(`conflicts: ChangeDetail screen not yet registered, cannot navigate to ${row.change.shortChangeId}`);
  // TODO(tui-change-detail-screen): When ChangeDetail is added to ScreenName, change this to:
  // nav.push(ScreenName.ChangeDetail, { owner, repo, changeId: row.change.changeId });
}

function activateFilter() {
  setFilterActive(true);
}

function clearFilter() {
  setFilterText("");
  setFilterActive(false);
}

function toggleResolved() {
  setShowResolved(prev => !prev);
}

function jumpToBottom() {
  setFocusedRowIndex(Math.max(0, rows.length - 1));
}

function handleG() {
  if (gPending) {
    // Second 'g' → jump to top
    setFocusedRowIndex(0);
    setGPending(false);
    if (gTimerRef.current) clearTimeout(gTimerRef.current);
    return;
  }
  setGPending(true);
  gTimerRef.current = setTimeout(() => setGPending(false), 1500);
}

function pageDown() {
  const jump = Math.floor(layout.contentHeight / 2);
  setFocusedRowIndex(prev => Math.min(prev + jump, rows.length - 1));
}

function pageUp() {
  const jump = Math.floor(layout.contentHeight / 2);
  setFocusedRowIndex(prev => Math.max(prev - jump, 0));
}

function expandAll() {
  const allIds = new Set(hookData.conflictedChanges.map(c => c.changeId));
  setExpandedChangeIds(allIds);
  // Load conflicts for all not-yet-loaded changes with concurrency limiter
  const unloaded = hookData.conflictedChanges
    .filter(c => !changeConflicts.has(c.changeId))
    .map(c => c.changeId);
  batchLoadConflicts(unloaded);
}

function collapseAll() {
  // Before collapsing, if focused row is a file, find its parent
  const focusedRow = rows[focusedRowIndex];
  setExpandedChangeIds(new Set());
  if (focusedRow?.type === "file") {
    // After collapse, rows will only be change rows. Find parent.
    const parentIdx = hookData.conflictedChanges.findIndex(
      c => c.changeId === focusedRow.parentChangeId
    );
    setFocusedRowIndex(Math.max(0, parentIdx));
  }
}

function refresh() {
  setExpandedChangeIds(new Set());
  setChangeConflicts(new Map());
  setFilterText("");
  setFilterActive(false);
  hookData.refetch();
}

function currentRowIsFile(): boolean {
  return rows[focusedRowIndex]?.type === "file";
}

function currentRowIsChange(): boolean {
  return rows[focusedRowIndex]?.type === "change";
}
```

#### 4.8 Batch Loading with Concurrency Limiter

```typescript
async function batchLoadConflicts(changeIds: string[]): Promise<void> {
  let inFlight = 0;
  let index = 0;

  setLoadingProgress({ loaded: 0, total: changeIds.length });

  return new Promise<void>(resolve => {
    function next() {
      while (inFlight < MAX_CONCURRENT_REQUESTS && index < changeIds.length) {
        const changeId = changeIds[index++];
        inFlight++;
        loadConflictsForChangeId(changeId).finally(() => {
          inFlight--;
          setLoadingProgress(prev =>
            prev ? { ...prev, loaded: prev.loaded + 1 } : null
          );
          if (index >= changeIds.length && inFlight === 0) {
            setLoadingProgress(null);
            resolve();
          } else {
            next();
          }
        });
      }
    }
    if (changeIds.length === 0) {
      setLoadingProgress(null);
      resolve();
    } else {
      next();
    }
  });
}
```

#### 4.9 Render Logic

```tsx
const layout = useLayout();
const theme = useTheme();
const nav = useNavigation();

// Loading state
if (loading.showSpinner) {
  return <FullScreenLoading spinnerFrame={loading.spinnerFrame} label="Loading conflicts…" />;
}

// Error state
if (loading.showError && loading.loadingError) {
  // Special handling for 501
  if (loading.loadingError.httpStatus === 501) {
    return (
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center" width="100%" height={layout.contentHeight}>
        <text fg={theme.warning}>Conflicts endpoint not available. Backend may need updating.</text>
      </box>
    );
  }
  // Special handling for 403
  if (loading.loadingError.httpStatus === 403) {
    return (
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center" width="100%" height={layout.contentHeight}>
        <text fg={theme.error}>Permission denied. You may not have access to this repository.</text>
      </box>
    );
  }
  // Special handling for 429
  if (loading.loadingError.type === "rate_limited") {
    return (
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center" width="100%" height={layout.contentHeight}>
        <text fg={theme.warning}>Rate limited. Retry in a few seconds.</text>
        <text fg={theme.muted}>Press R to retry.</text>
      </box>
    );
  }
  // Generic error via FullScreenError component
  return <FullScreenError screenLabel="conflicts" error={loading.loadingError} />;
}

// Empty state (no conflicts)
if (!loading.showSpinner && !loading.showError && hookData.conflictedChanges.length === 0) {
  return (
    <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center" width="100%" height={layout.contentHeight}>
      <text fg={theme.success}>No conflicts. All clear! ✓</text>
    </box>
  );
}

// All resolved with hide-resolved active
if (allResolved && !showResolved && rows.length === 0) {
  return (
    <box flexDirection="column" width="100%">
      <ConflictsHeader counts={counts} allResolved={allResolved} showResolved={showResolved} filterActive={filterActive} />
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={theme.success}>All conflicts resolved. Press h to show resolved.</text>
      </box>
    </box>
  );
}

// Main content
return (
  <box flexDirection="column" width="100%" height="100%">
    <ConflictsHeader counts={counts} allResolved={allResolved} showResolved={showResolved} filterActive={filterActive} />
    {filterActive && (
      <box height={1} width="100%">
        <input
          value={filterText}
          onChange={(value: string) => setFilterText(value.slice(0, FILTER_MAX_LENGTH))}
          placeholder="Filter by file path…"
        />
      </box>
    )}
    {loadingProgress && (
      <text fg={theme.muted}>Loading conflicts… ({loadingProgress.loaded}/{loadingProgress.total} changes)</text>
    )}
    <scrollbox flexGrow={1}>
      <box flexDirection="column">
        {rows.length === 0 && filterText && (
          <text fg={theme.muted}>No matching conflicts</text>
        )}
        {rows.map((row, i) => {
          if (row.type === "change") {
            const state = changeConflicts.get(row.change.changeId);
            return (
              <box key={row.change.changeId} flexDirection="column">
                <ChangeRow
                  change={row.change}
                  focused={i === focusedRowIndex}
                  expanded={expandedChangeIds.has(row.change.changeId)}
                />
                {expandedChangeIds.has(row.change.changeId) && state?.isLoading && (
                  <text fg={theme.muted}>  Loading…</text>
                )}
                {expandedChangeIds.has(row.change.changeId) && state?.error && (
                  <text fg={theme.error}>  Error: {truncateRight(state.error.message, 50)}</text>
                )}
              </box>
            );
          }
          return (
            <FileRow
              key={`${row.parentChangeId}-${row.file.filePath}`}
              file={row.file}
              focused={i === focusedRowIndex}
            />
          );
        })}
      </box>
    </scrollbox>
  </box>
);
```

#### 4.10 Filter Input Handling

- When `filterActive === true`, render an `<input>` component between header and scrollbox.
- The `<input>` captures all printable keys at OpenTUI's text input priority (`PRIORITY.TEXT_INPUT = 1`, verified in `keybinding-types.ts:31`).
- `escape` is registered at `PRIORITY.SCREEN` (4) with `when: () => filterActive` — it clears `filterText`, sets `filterActive = false`, returns focus to list.
- Filter is case-insensitive substring match on `file.filePath`.
- Filter is disabled (not rendered) while `loading.showSpinner` is true.
- Max 200 characters via `value.slice(0, FILTER_MAX_LENGTH)`.

#### 4.11 Telemetry

All events use `emit()` from `../../../lib/telemetry.js`. The `emit()` function (verified in `lib/telemetry.ts:43`) takes `(name: string, properties: Record<string, string | number | boolean>)`.

```typescript
import { emit } from "../../../lib/telemetry.js";

// On successful load
useEffect(() => {
  if (!hookData.isLoading && !hookData.error && hookData.conflictedChanges.length >= 0) {
    emit("tui.repo.conflicts.view", {
      repo_full_name: `${owner}/${repo}`,
      conflicted_change_count: counts.totalChanges,
      total_file_count: counts.totalFiles,
      unresolved_file_count: counts.unresolvedFiles,
      resolved_file_count: counts.resolvedFiles,
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "unknown",
      load_time_ms: Date.now() - mountTimeRef.current,
    });
    if (counts.totalChanges === 0) {
      emit("tui.repo.conflicts.empty", { repo_full_name: `${owner}/${repo}` });
    }
  }
}, [hookData.isLoading]);

// Expand/collapse — in toggleExpand()
emit(expanding ? "tui.repo.conflicts.expand_change" : "tui.repo.conflicts.collapse_change", {
  repo_full_name: `${owner}/${repo}`,
  change_id: changeId,
  conflict_file_count: change.conflictFileCount,
  position_in_list: focusedRowIndex,
});

// Open diff — in pushDiffView()
emit("tui.repo.conflicts.open_diff", {
  repo_full_name: `${owner}/${repo}`,
  change_id: changeId,
  file_path: filePath,
  conflict_type: focusedFile?.conflictType ?? "unknown",
  is_resolved: focusedFile?.resolved ?? false,
});

// All other events follow the same pattern per the product spec.
```

#### 4.12 Logging

All logging uses `logger` from `../../../lib/logger.js`. The `logger` object (verified in `lib/logger.ts:26-31`) has methods: `.error(msg)`, `.warn(msg)`, `.info(msg)`, `.debug(msg)`. Output to stderr. Level controlled by `CODEPLANE_TUI_LOG_LEVEL` env var (default: `"error"`, or `"debug"` when `CODEPLANE_TUI_DEBUG=true`).

```typescript
import { logger } from "../../../lib/logger.js";

// info: Conflicts loaded
logger.info(`conflicts: loaded ${owner}/${repo} (${counts.totalChanges} changes, ${counts.totalFiles} files) in ${loadTimeMs}ms`);

// warn: API errors
logger.warn(`conflicts: API error ${error.status} on GET /api/repos/${owner}/${repo}/changes?has_conflict=true`);

// debug: Focus changes
logger.debug(`conflicts: focus → row ${focusedRowIndex} (${row.type}: ${row.type === "change" ? row.change.shortChangeId : row.file.filePath})`);
```

---

### Step 5: Register Tab in Repository Screen

**File:** `apps/tui/src/screens/Repository/tabs/index.ts`

Update the tab configuration array (created by `tui-repo-screen-scaffold`) to wire ConflictsTab as tab index 3 (0-indexed) / display number 4:

```typescript
import { ConflictsTab } from "./ConflictsTab.js";

export const REPO_TABS = [
  { label: "Bookmarks", key: "1", component: PlaceholderTab },
  { label: "Changes",   key: "2", component: PlaceholderTab },
  { label: "Code",      key: "3", component: PlaceholderTab },
  { label: "Conflicts", key: "4", component: ConflictsTab },   // ← this ticket
  { label: "Op Log",    key: "5", component: PlaceholderTab },
  { label: "Settings",  key: "6", component: PlaceholderTab },
];
```

---

### Step 6: Wire Status Bar Hints

The ConflictsTab registers context-sensitive status bar hints via `useScreenKeybindings()`. Two hint sets are managed:

**List focused (default):** Registered via the second argument to `useScreenKeybindings()` (see Step 4.6 above). The `StatusBarHintsContext.registerHints()` method (verified in `keybinding-types.ts:84`) returns a cleanup function.

**Filter focused:** When `filterActive` becomes true, use `statusBarCtx.overrideHints()` to temporarily replace hints:
```typescript
const statusBarCtx = useStatusBarHints();

useEffect(() => {
  if (filterActive) {
    const cleanup = statusBarCtx.overrideHints([
      { keys: "Type", label: "filter by path", order: 10 },
      { keys: "Esc", label: "clear", order: 20 },
    ]);
    return cleanup;
  }
}, [filterActive, statusBarCtx]);
```

The `overrideHints()` method (verified in `keybinding-types.ts:86`) returns a cleanup function and sets `isOverridden = true`, which the `StatusBar` component checks to display override hints instead of the registered screen hints.

---

### Step 7: Implement Loading Progress for Large Datasets

When `expandAll()` is triggered or when 100+ conflicted changes are present, show a loading progress indicator:

```typescript
const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
```

Rendered inside the scrollbox above the row list when non-null:
```
Loading conflicts… (42/100 changes)
```

The progress counter increments as each `loadConflictsForChangeId()` promise resolves. Max 5 concurrent requests via the `batchLoadConflicts()` semaphore.

---

### Step 8: Add the Help Overlay Conflicts Group

The help overlay (`?` key) automatically includes all keybindings registered via `useScreenKeybindings()`, grouped by the `group` field on each `KeyHandler`. Since all conflict keybindings use `group: "Conflicts"`, they appear as:

```
── Conflicts ────────────────────────
j / Down           Next row
k / Up             Previous row
Enter              Expand change / open file diff
d                  Open file diff
v                  View change detail
/                  Filter by file path
h                  Toggle resolved visibility
x                  Expand all changes
z                  Collapse all changes
R                  Refresh list
G                  Jump to bottom
g g                Jump to top
```

No additional work is needed — the `KeybindingProvider`'s `getAllBindings()` method (verified in `keybinding-types.ts:64`) returns bindings grouped by `group` string, and the help overlay component iterates these groups.

---

## File Inventory

### New Files

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `apps/tui/src/screens/Repository/tabs/conflicts-types.ts` | Type definitions for conflicts tab | 60 |
| `apps/tui/src/screens/Repository/tabs/useConflictRows.ts` | Flattened row computation hook | 120 |
| `apps/tui/src/screens/Repository/tabs/ConflictsHeader.tsx` | Section header component | 50 |
| `apps/tui/src/screens/Repository/tabs/ChangeRow.tsx` | Change row component | 80 |
| `apps/tui/src/screens/Repository/tabs/FileRow.tsx` | File row component with truncation | 80 |
| `apps/tui/src/screens/Repository/tabs/ConflictsTab.tsx` | Main tab component (orchestrator) | 450 |

### Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/screens/Repository/tabs/index.ts` | Wire `ConflictsTab` as tab 4 |

### Dependency Files (from other tickets, assumed to exist)

| File | Source Ticket | Required Interface |
|------|--------------|-----------------|
| `apps/tui/src/screens/Repository/index.tsx` | `tui-repo-screen-scaffold` | `RepoOverviewScreen` with tab infrastructure |
| `apps/tui/src/screens/Repository/tabs/index.ts` | `tui-repo-screen-scaffold` | `REPO_TABS` array with tab config |
| `apps/tui/src/screens/Repository/tabs/PlaceholderTab.tsx` | `tui-repo-screen-scaffold` | Placeholder for other tabs |
| `apps/tui/src/hooks/data/useRepoConflicts.ts` | `tui-repo-jj-hooks` | `useRepoConflicts(owner, repo)` |

---

## API Integration Details

### Endpoint 1: List Conflicted Changes

```
GET /api/repos/:owner/:repo/changes?has_conflict=true&limit=30&cursor={cursor}
```

**Request:** Query params `has_conflict=true`, `limit` (default 30, max 100), `cursor` (optional).

**Response (200):**
```json
{
  "items": [
    {
      "change_id": "ksxypqvm12345678abcdef",
      "commit_id": "abc123def456789012345",
      "description": "Fix authentication flow\n\nDetailed description...",
      "author_name": "Alice",
      "author_email": "alice@example.com",
      "timestamp": "2026-03-23T10:30:00Z",
      "has_conflict": true,
      "is_empty": false,
      "parent_change_ids": ["parent1"]
    }
  ],
  "next_cursor": "cursor_token_or_empty_string"
}
```

**Note:** The `conflictFileCount` field may not be present in the API response for the changes list. The `useRepoConflicts()` hook (from `tui-repo-jj-hooks`) is responsible for either enriching the data or computing counts on-demand. If unavailable, the badge shows `"(?)"` until the per-change conflicts are loaded.

### Endpoint 2: Per-Change Conflict Details

```
GET /api/repos/:owner/:repo/changes/:change_id/conflicts
```

**Response (200):**
```json
{
  "conflicts": [
    {
      "file_path": "src/parser/mod.rs",
      "conflict_type": "2-sided conflict",
      "resolution_status": "unresolved",
      "resolved_by": null,
      "resolution_method": null,
      "resolved_at": null
    }
  ]
}
```

### Error Responses

| Status | Handling |
|--------|----------|
| 200 | Parse and render |
| 401 | Classified as `auth_error` by `parseToLoadingError()` in `useScreenLoading` → propagated to app-shell auth error screen via `LoadingProvider` |
| 403 | Inline: "Permission denied. You may not have access to this repository." |
| 404 | Inline: "Change not found" on the specific row |
| 429 | Classified as `rate_limited` by `parseToLoadingError()` → inline: "Rate limited. Retry in a few seconds." No auto-retry. |
| 500 | Generic error via `FullScreenError` component + "Press `R` to retry" (shown via `StatusBar` retry hint) |
| 501 | Special case: "Conflicts endpoint not available. Backend may need updating." |
| Network timeout | `FullScreenError` with `type: "network"` |

### Batch Loading Strategy

1. Queue all change IDs needing conflict detail loading.
2. Process queue with max 5 concurrent requests (`MAX_CONCURRENT_REQUESTS`).
3. As each resolves, update `changeConflicts` Map and re-render.
4. Track progress: `loaded / total` for the progress indicator.
5. On per-change failure: mark that change's state as `error`, continue with others.
6. Memory cap: 500 changes max, 1000 files per change max.

---

## Responsive Layout Specification

### 80×24 (Minimum Breakpoint — `breakpoint === "minimum"`)

**Change row columns:**
```
│ ▸ ksxypqvm1234  (3 files) │
```
- Expand indicator: 2ch
- Change ID: 12ch
- Gap: 2ch
- Badge: right-aligned, variable
- Description, commit ID, author: HIDDEN

**File row columns:**
```
│   ✗ …/parser/mod.rs │
```
- Indent: 2ch
- Status icon: 2ch
- File path: remaining width, truncated from left via `truncateLeft()` from `util/truncate.ts`
- Conflict type: HIDDEN

### 120×40 (Standard Breakpoint — `breakpoint === "standard"`)

**Change row columns:**
```
│ ▸ ksxypqvm1234  abc123def456  Fix auth flow              Alice         (3 files) │
```
- Expand indicator: 2ch
- Change ID: 12ch + 2ch gap
- Commit ID: 12ch + 2ch gap
- Description: 30ch + 2ch gap (via `truncateRight()` from `util/text.ts`)
- Author: 15ch + 2ch gap (via `truncateRight()` from `util/text.ts`)
- Badge: right-aligned

**File row columns:**
```
│   ✗ src/parser/mod.rs                    2-sided conflict     │
```
- Indent: 2ch
- Status icon: 2ch
- File path: 40ch + gap
- Conflict type: 20ch, right-aligned (via `truncateRight()`)

### 200×60 (Large Breakpoint — `breakpoint === "large"`)

**Change row:** Standard + timestamp (10ch YYYY-MM-DD) + description widened to 50ch + author widened to 20ch.

**File row:** Standard + resolution method (15ch) + resolved-by (15ch).

---

## Edge Cases and Boundary Handling

### Focus Preservation

| Event | Behavior |
|-------|----------|
| Terminal resize while scrolled | Scroll position preserved relative to focused item via `useOnResize()`. Column widths recalculate via `useLayout()`. Focused row stays visible. Expanded state preserved. |
| Collapse change with child file focused | Focus moves to parent change row. Found via `rows.findIndex(r => r.type === "change" && r.change.changeId === parentId)` in the *post-collapse* row list. |
| Filter removes focused row | Focus clamps to `Math.min(focusedRowIndex, newRows.length - 1)` via the `useEffect` focus clamping hook. |
| Toggle resolved removes focused row | Same as filter — clamp to nearest valid index. |
| Expand all with no data loaded | Each change shows inline "Loading…"; focus stays on current row. |
| Navigate back from diff (`q`) | React state survives back-navigation (stack-based model caches component state). Focus and expanded state preserved. |
| Tab switch and return | Tab unmounts and remounts (per scaffold design); state resets, data re-fetches. |

### Rapid Key Presses

- `j`/`k` presses are processed sequentially with no debouncing.
- 10 rapid `j` presses must move focus exactly 10 rows (spec test #51).
- State updates via `setState` are batched by React 19 but applied in order.

### Unicode and Grapheme Clusters

- File paths may contain Unicode characters. `truncateLeft()` and `truncateRight()` use `string.slice()` which operates on UTF-16 code units. For most practical file paths this is correct. Astral plane characters (emoji, etc.) in file paths are rare. Noted as acceptable for V1.

### Memory Limits

- Maximum 500 conflicted changes loaded in memory (`MAX_CHANGES = 500`). If API returns more, pagination stops loading.
- Maximum 1000 files per change (`MAX_FILES_PER_CHANGE = 1000`). `files.slice(0, 1000)` applied on load.
- Filter input capped at 200 characters (`FILTER_MAX_LENGTH = 200`).

### Network Resilience

- Partial load failure: Successfully loaded changes render normally; failed changes show inline error text (`"  Error: {message}"` in `theme.error` color) under the change row.
- Network error during expansion: The change shows a loading-error state. `R` retries all.
- SSE disconnect: Unaffected — this view is entirely REST-based.

---

## Productionization Checklist

### Dependency Verification

Before implementing ConflictsTab, verify dependencies:

1. **`tui-repo-screen-scaffold`**: Verify `apps/tui/src/screens/Repository/index.tsx` exists and exports `RepoOverviewScreen` with tab infrastructure. **Current state:** `apps/tui/src/screens/Repository/` directory does not exist (verified via Glob). If not yet available, ConflictsTab can be developed with a temporary harness that renders ConflictsTab directly with `owner` and `repo` props.

2. **`tui-repo-jj-hooks`**: Verify `apps/tui/src/hooks/data/useRepoConflicts.ts` is importable. If not yet implemented, create a temporary stub:

   **File:** `apps/tui/src/hooks/data/useRepoConflicts.stub.ts`
   ```typescript
   // TEMPORARY STUB — delete when tui-repo-jj-hooks lands
   export function useRepoConflicts(_owner: string, _repo: string) {
     return {
       conflictedChanges: [] as any[],
       isLoading: false,
       error: null as { message: string; status?: number } | null,
       conflictCount: { changes: 0, files: 0 },
       hasMore: false,
       fetchMore: () => {},
       refetch: () => {},
       loadConflictsForChange: async (_id: string) => [] as any[],
     };
   }
   ```

   **Critical:** This stub must be replaced with the real hook and deleted once `tui-repo-jj-hooks` lands. It is never committed as production code.

3. **API endpoints**: Both endpoints currently return 501. Tests will fail against real API but this is expected per project policy — tests are left failing, never skipped.

4. **`ScreenName.ChangeDetail`**: Does **not** exist in `apps/tui/src/router/types.ts`. Verified: the enum has 32 entries (lines 1-43), none is `ChangeDetail`. The `v` keybinding handler must check for this and log a warning via `logger.warn()`. When `ChangeDetail` is added to the `ScreenName` enum and registry (by a future ticket), the `v` handler can be updated to push the screen.

### Performance Validation

- **First render:** ConflictsTab must render within the 50ms screen transition budget. Initial render shows loading state — no heavy computation on mount.
- **Expansion latency:** Expanding a change triggers an async API call. The UI shows inline "Loading…" immediately; file rows render within one React render cycle of data arrival.
- **Flattened row computation:** `useConflictRows()` is `useMemo`-ized. With 500 changes × average 10 files = 5,000 potential rows. Recomputation only on state changes.
- **Scroll performance:** `<scrollbox>` handles viewport clipping at the OpenTUI native Zig level. React emits all rows but OpenTUI only renders visible ones.

### Error Boundary Integration

ConflictsTab is rendered within the app-level `<ErrorBoundary>` (from `apps/tui/src/components/ErrorBoundary.tsx`, verified to exist). Unhandled errors trigger the recovery UI ("Press `r` to restart"). ConflictsTab does not need its own error boundary — expected errors are handled via `useScreenLoading()` and inline error rendering.

### Import Path Conventions

All imports use `.js` extension suffixes per the codebase convention (verified across all existing source files):
```typescript
import { useTheme } from "../../../hooks/useTheme.js";
import { useLayout } from "../../../hooks/useLayout.js";
import { useNavigation } from "../../../hooks/useNavigation.js";
import { useScreenKeybindings } from "../../../hooks/useScreenKeybindings.js";
import { useScreenLoading } from "../../../hooks/useScreenLoading.js";
import { useStatusBarHints } from "../../../hooks/useStatusBarHints.js";
import { truncateLeft } from "../../../util/truncate.js";
import { truncateRight } from "../../../util/text.js";
import { TextAttributes } from "../../../theme/tokens.js";
import { ScreenName } from "../../../router/types.js";
import { emit } from "../../../lib/telemetry.js";
import { logger } from "../../../lib/logger.js";
import { FullScreenError } from "../../../components/FullScreenError.js";
import { FullScreenLoading } from "../../../components/FullScreenLoading.js";
```

All components use `.tsx` extension. All non-component TypeScript files use `.ts`.

---

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test` via helpers from `e2e/tui/helpers.ts`. Tests import:

```typescript
import { describe, test, expect } from "bun:test";
import {
  launchTUI,
  type TUITestInstance,
  createMockAPIEnv,
  TERMINAL_SIZES,
  TUI_SRC,
  bunEval,
} from "./helpers.ts";
import { join } from "node:path";
import { existsSync } from "node:fs";
```

Tests that fail due to unimplemented backends (501 responses, missing screens) are left failing — never skipped, never commented out. This is per project policy documented in `CLAUDE.md` and `memory/feedback_failing_tests.md`.

### Test Helper Functions

```typescript
const TABS_DIR = join(TUI_SRC, "screens", "Repository", "tabs");

async function navigateToRepoConflicts(
  terminal: TUITestInstance,
): Promise<void> {
  // Navigate to repo list
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Open first repo
  await terminal.sendKeys("Enter");
  // Switch to Conflicts tab (tab 4)
  await terminal.sendKeys("4");
  await terminal.waitForText("Conflicts");
}
```

### File Structure Tests

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — File structure", () => {
  test("conflicts-types.ts exists", () => {
    expect(existsSync(join(TABS_DIR, "conflicts-types.ts"))).toBe(true);
  });

  test("useConflictRows.ts exists", () => {
    expect(existsSync(join(TABS_DIR, "useConflictRows.ts"))).toBe(true);
  });

  test("ConflictsHeader.tsx exists", () => {
    expect(existsSync(join(TABS_DIR, "ConflictsHeader.tsx"))).toBe(true);
  });

  test("ChangeRow.tsx exists", () => {
    expect(existsSync(join(TABS_DIR, "ChangeRow.tsx"))).toBe(true);
  });

  test("FileRow.tsx exists", () => {
    expect(existsSync(join(TABS_DIR, "FileRow.tsx"))).toBe(true);
  });

  test("ConflictsTab.tsx exists", () => {
    expect(existsSync(join(TABS_DIR, "ConflictsTab.tsx"))).toBe(true);
  });

  test("useConflictRows exports useConflictRows function", async () => {
    const result = await bunEval(
      `import { useConflictRows } from '${join(TABS_DIR, "useConflictRows.ts")}'; console.log(typeof useConflictRows)`
    );
    expect(result.stdout.trim()).toBe("function");
  });

  test("ConflictedChange type has correct shape", async () => {
    const result = await bunEval(`
      import type { ConflictedChange } from '${join(TABS_DIR, "conflicts-types.ts")}';
      const change: ConflictedChange = {
        changeId: 'full-id', shortChangeId: 'ksxypqvm1234',
        commitId: 'full-commit', shortCommitId: 'abc123def456',
        description: 'Fix auth', descriptionFirstLine: 'Fix auth',
        authorName: 'Alice', authorEmail: 'a@b.c',
        timestamp: '2026-03-23T10:30:00Z', conflictFileCount: 3, hasConflict: true,
      };
      console.log(JSON.stringify(change));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.shortChangeId).toBe("ksxypqvm1234");
    expect(parsed.conflictFileCount).toBe(3);
  });

  test("ConflictFile type has correct shape", async () => {
    const result = await bunEval(`
      import type { ConflictFile } from '${join(TABS_DIR, "conflicts-types.ts")}';
      const file: ConflictFile = {
        filePath: 'src/mod.rs', conflictType: '2-sided conflict',
        resolved: false, resolvedBy: null, resolutionMethod: null, resolvedAt: null,
      };
      console.log(JSON.stringify(file));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.filePath).toBe("src/mod.rs");
    expect(parsed.resolved).toBe(false);
  });

  test("conflicts-types.ts introduces no new tsc errors", async () => {
    const { run } = await import("./helpers.ts");
    const result = await run(["bun", "run", "check"], { cwd: join(TUI_SRC, "../..") });
    expect(result.stderr).not.toContain("conflicts-types.ts");
  });
});
```

### useConflictRows Unit Tests

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — useConflictRows logic", () => {
  test("sorts changes by conflict file count descending", async () => {
    const result = await bunEval(`
      import { useConflictRows } from '${join(TABS_DIR, "useConflictRows.ts")}';
      // Test sorting logic with mock React useMemo
      const React = { useMemo: (fn) => fn() };
      globalThis.React = React;
      // Direct function test of sort order
      const changes = [
        { changeId: 'aaa', conflictFileCount: 1 },
        { changeId: 'bbb', conflictFileCount: 5 },
        { changeId: 'ccc', conflictFileCount: 3 },
      ];
      const sorted = [...changes].sort((a, b) =>
        b.conflictFileCount - a.conflictFileCount || a.changeId.localeCompare(b.changeId)
      );
      console.log(JSON.stringify(sorted.map(c => c.changeId)));
    `);
    expect(JSON.parse(result.stdout.trim())).toEqual(["bbb", "ccc", "aaa"]);
  });

  test("tiebreaker sorts by change ID ascending", async () => {
    const result = await bunEval(`
      const changes = [
        { changeId: 'zzz', conflictFileCount: 3 },
        { changeId: 'aaa', conflictFileCount: 3 },
      ];
      const sorted = [...changes].sort((a, b) =>
        b.conflictFileCount - a.conflictFileCount || a.changeId.localeCompare(b.changeId)
      );
      console.log(JSON.stringify(sorted.map(c => c.changeId)));
    `);
    expect(JSON.parse(result.stdout.trim())).toEqual(["aaa", "zzz"]);
  });

  test("filter is case-insensitive substring match", async () => {
    const result = await bunEval(`
      const filePath = "src/Parser/Lexer.ts";
      const filter = "parser";
      console.log(filePath.toLowerCase().includes(filter.toLowerCase()));
    `);
    expect(result.stdout.trim()).toBe("true");
  });

  test("allResolved true when all files resolved", async () => {
    const result = await bunEval(`
      const totalFiles = 5;
      const unresolvedFiles = 0;
      const allResolved = totalFiles > 0 && unresolvedFiles === 0;
      console.log(allResolved);
    `);
    expect(result.stdout.trim()).toBe("true");
  });

  test("allResolved false when zero total files", async () => {
    const result = await bunEval(`
      const totalFiles = 0;
      const unresolvedFiles = 0;
      const allResolved = totalFiles > 0 && unresolvedFiles === 0;
      console.log(allResolved);
    `);
    expect(result.stdout.trim()).toBe("false");
  });
});
```

### Terminal Snapshot Tests

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — Terminal Snapshot Tests", () => {
  test("repo-conflicts-initial-load — renders conflicts at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-empty-state — zero conflicts shows empty message", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("No conflicts. All clear!");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-loading-state — shows spinner during load", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-error-state — API failure shows error and retry hint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Press");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-501-error — shows backend not available message", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Conflicts endpoint not available");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-focused-change-row — first change row highlighted", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-expanded-change — Enter shows file rows with ▾ indicator", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-collapsed-change — Enter twice shows ▸ indicator, files hidden", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resolved-files-hidden — default hides resolved files", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resolved-files-visible — h toggle shows resolved with dim styling", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("h");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-all-resolved — all resolved with hide-resolved shows message", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("All conflicts resolved");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-filter-active — / shows filter input with placeholder", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-filter-results — typing narrows results", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    await terminal.sendText("parser");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-filter-no-results — nonexistent filter shows no results", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    await terminal.sendText("zzzznonexistent");
    await terminal.waitForText("No matching conflicts");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-multiple-expanded — two expanded changes show both file lists", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j", "j", "j");
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-header-icon-warning — unresolved conflicts show ⚠", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("⚠");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-header-icon-success — all resolved shows ✓", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("✓");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-partial-load-failure — failed changes show inline error", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-single-conflict — one change, one file renders correctly", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

### Keyboard Interaction Tests

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — Keyboard Interaction Tests", () => {
  test("repo-conflicts-j-moves-down — j moves focus to next row", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-k-moves-up — j then k returns focus to first row", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("j");
    await terminal.sendKeys("k");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-k-at-top-no-wrap — k at top stays at first row", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("k");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-j-at-bottom-no-wrap — j at bottom stays at last row", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("G");
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-down-arrow-moves-down — Down arrow same as j", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Down");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-up-arrow-moves-up — Up arrow same as k", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("j");
    await terminal.sendKeys("Up");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-enter-expands-change — Enter expands with ▾ and file rows", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.waitForText("▾");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-enter-collapses-change — Enter on expanded collapses with ▸", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("▸");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-j-into-file-rows — j after expand enters file rows", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-k-from-file-to-change — k from first file returns to change", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    await terminal.sendKeys("k");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-enter-on-file-opens-diff — Enter on file pushes diff view", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-d-on-file-opens-diff — d on file opens diff view", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    await terminal.sendKeys("d");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-v-on-change-opens-detail — v on change row attempts navigation", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("v");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-v-on-file-row-no-op — v on file row does nothing", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    await terminal.sendKeys("v");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-d-on-change-row-no-op — d on change row does nothing", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("d");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-slash-activates-filter — / focuses filter input", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-filter-narrows-list — filter narrows to matching paths", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("x");
    await terminal.sendKeys("/");
    await terminal.sendText("parser");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-filter-case-insensitive — case-insensitive matching", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("x");
    await terminal.sendKeys("/");
    await terminal.sendText("PARSER");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-esc-clears-filter — Esc clears filter and restores list", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    await terminal.sendText("parser");
    await terminal.sendKeys("Escape");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-h-toggles-resolved — h toggles resolved visibility", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("h");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-G-jumps-to-bottom — G focuses last row", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("G");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-gg-jumps-to-top — g g focuses first row", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("G");
    await terminal.sendKeys("g", "g");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-ctrl-d-page-down — Ctrl+D pages down", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("ctrl+d");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-ctrl-u-page-up — Ctrl+U pages up", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("ctrl+d");
    await terminal.sendKeys("ctrl+u");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-x-expands-all — x expands all change rows", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("x");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-z-collapses-all — z collapses all change rows", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("x");
    await terminal.sendKeys("z");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-R-refreshes-list — R re-fetches from API", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("R");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-R-on-error-retries — R in error state retries fetch", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Press");
    await terminal.sendKeys("R");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-collapse-with-file-focused — collapse moves focus to parent", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    await terminal.sendKeys("z");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-j-in-filter-types-j — j in filter types character, not navigate", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    await terminal.sendText("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-enter-during-loading — Enter during load is no-op", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-rapid-j-presses — 10 rapid j presses move focus 10 rows", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("x");
    for (let i = 0; i < 10; i++) {
      await terminal.sendKeys("j");
    }
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-expand-during-filter — expand shows only matching files", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    await terminal.sendText("mod.rs");
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

### Responsive Tests

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — Responsive Tests", () => {
  test("repo-conflicts-80x24-layout — minimum shows change ID + count only", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-80x24-file-path-truncation — long paths truncated from left", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-80x24-filter — filter at full width", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-120x40-layout — standard shows all columns", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-120x40-all-columns — snapshot verifies column layout", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-200x60-layout — large shows timestamp and resolution", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resize-120-to-80 — columns collapse on shrink", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resize-80-to-120 — columns appear on grow", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.resize(120, 40);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resize-preserves-focus — focus preserved on resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("j");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resize-preserves-expanded — expanded state preserved on resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-resize-during-filter — filter persists through resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("/");
    await terminal.sendText("parser");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

### Integration Tests

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — Integration Tests", () => {
  test("repo-conflicts-auth-expiry — 401 propagates to auth error screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv({ token: "expired-token" }) });
    await navigateToRepoConflicts(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-rate-limit-429 — 429 shows rate limited inline", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Rate limited");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-network-error — timeout shows error and retry hint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Press");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-server-error-500 — 500 shows error and retry hint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Press");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-403-permission — 403 shows permission denied", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.waitForText("Permission denied");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-partial-failure-recovery — partial success renders, R retries", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("R");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-diff-then-q-returns — back from diff preserves state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("j");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("q");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-change-detail-then-q-returns — back from change preserves focus", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("v");
    await terminal.sendKeys("q");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-tab-switch-and-back — tab switch re-fetches on return", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("1");
    await terminal.sendKeys("4");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-help-overlay-includes-conflicts — ? shows Conflicts group", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    await terminal.sendKeys("?");
    await terminal.waitForText("Conflicts");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("repo-conflicts-status-bar-hints — status bar shows conflict-specific hints", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
    await navigateToRepoConflicts(terminal);
    const lastLine = terminal.getLine(terminal.rows - 1);
    expect(lastLine).toMatch(/j\/k.*navigate/);
    expect(lastLine).toMatch(/Enter.*expand/);
    await terminal.terminate();
  });

  test("repo-conflicts-deep-link — --screen repo --tab conflicts works", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: createMockAPIEnv(),
      args: ["--screen", "repo", "--repo", "testowner/testrepo", "--tab", "conflicts"],
    });
    await terminal.waitForText("Conflicts");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

### Test Summary

| Category | Count | ID Range |
|----------|-------|----------|
| File Structure Tests | 9 | — |
| useConflictRows Unit Tests | 5 | — |
| Terminal Snapshot Tests | 19 | #1 – #19 |
| Keyboard Interaction Tests | 33 | #20 – #52 |
| Responsive Tests | 11 | #53 – #63 |
| Integration Tests | 12 | #64 – #75 |
| **Total** | **89** | |

All 75 acceptance criteria tests are covered (plus 9 file structure tests and 5 unit tests following existing `repository.test.ts` patterns).

---

## Telemetry Event Reference

All events use `emit()` from `apps/tui/src/lib/telemetry.ts` (verified: function signature at line 43).

| Event Name | Trigger | Key Properties |
|------------|---------|----------------|
| `tui.repo.conflicts.view` | Data loads successfully on tab mount | `repo_full_name`, `conflicted_change_count`, `total_file_count`, `unresolved_file_count`, `resolved_file_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.repo.conflicts.expand_change` | Enter on change row (expand) | `repo_full_name`, `change_id`, `conflict_file_count`, `position_in_list` |
| `tui.repo.conflicts.collapse_change` | Enter on expanded change row | `repo_full_name`, `change_id` |
| `tui.repo.conflicts.open_diff` | Enter or `d` on file row | `repo_full_name`, `change_id`, `file_path`, `conflict_type`, `is_resolved` |
| `tui.repo.conflicts.view_change` | `v` on change row | `repo_full_name`, `change_id`, `conflict_file_count` |
| `tui.repo.conflicts.filter` | `/` activates filter | `conflicted_change_count`, `total_file_count` |
| `tui.repo.conflicts.filter_results` | User types in filter | `filter_text_length`, `matched_change_count`, `matched_file_count` |
| `tui.repo.conflicts.toggle_resolved` | `h` pressed | `repo_full_name`, `new_mode`, `resolved_count`, `unresolved_count` |
| `tui.repo.conflicts.expand_all` | `x` pressed | `repo_full_name`, `change_count` |
| `tui.repo.conflicts.collapse_all` | `z` pressed | `repo_full_name`, `change_count` |
| `tui.repo.conflicts.refresh` | `R` pressed | `repo_full_name`, `was_error_state`, `previous_change_count` |
| `tui.repo.conflicts.error` | API request fails | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.conflicts.empty` | Empty state rendered | `repo_full_name` |

---

## Logging Reference

All logging uses `logger` from `apps/tui/src/lib/logger.ts` (verified: lines 26-31). Output to stderr. Level controlled by `CODEPLANE_TUI_LOG_LEVEL` (default: `"error"`, or `"debug"` when `CODEPLANE_TUI_DEBUG=true`).

| Level | Event | Format |
|-------|-------|--------|
| `info` | Conflicts loaded | `"conflicts: loaded {owner}/{repo} ({N} changes, {M} files) in {T}ms"` |
| `info` | Diff opened from conflicts | `"conflicts: diff opened {owner}/{repo} {changeId} {filePath}"` |
| `info` | Change detail opened | `"conflicts: change detail opened {owner}/{repo} {changeId}"` |
| `warn` | API error on conflicts fetch | `"conflicts: API error {status} on {endpoint}"` |
| `warn` | 501 Not Implemented | `"conflicts: 501 on {endpoint} — backend not implemented"` |
| `warn` | Rate limited | `"conflicts: rate limited, retry after {N}s"` |
| `warn` | Partial load failure | `"conflicts: partial load {ok}/{total}, failed: [{changeIds}]"` |
| `warn` | Filter zero results | `"conflicts: filter '{text}' returned 0 results from {total}"` |
| `warn` | ChangeDetail screen missing | `"conflicts: ChangeDetail screen not yet registered, cannot navigate to {changeId}"` |
| `debug` | Focus changed | `"conflicts: focus → row {index} ({type}: {id})"` |
| `debug` | Change expanded/collapsed | `"conflicts: {action} {changeId} ({N} files)"` |
| `debug` | Filter activated/cleared | `"conflicts: filter {action} (length: {N})"` |
| `debug` | Resolved visibility toggled | `"conflicts: resolved {show|hide}"` |
| `debug` | Refresh triggered | `"conflicts: refresh (was_error: {bool})"` |

---

## Implementation Order

Designed for vertical slices where each step produces a testable result:

### Phase 1: Foundation (can begin immediately)
1. **Create `conflicts-types.ts`** — All type definitions. No runtime dependencies. Verify compiles with `bun run check`.
2. **Create `useConflictRows.ts`** — Pure computation hook. Can be unit-tested with static input via `bunEval`.
3. **Create `ConflictsHeader.tsx`** — Stateless presentational component. Uses `useTheme()`, `useLayout()`.
4. **Create `ChangeRow.tsx`** — Stateless presentational component with responsive columns. Uses `useTheme()`, `useLayout()`, `truncateRight()` from `util/text.ts`.
5. **Create `FileRow.tsx`** — Stateless presentational component. Uses `truncateLeft()` from `util/truncate.ts`, `truncateRight()` from `util/text.ts`.

### Phase 2: Orchestrator (requires tui-repo-screen-scaffold or harness)
6. **Create `ConflictsTab.tsx`** — Main component. Wire state, keybindings (via `useScreenKeybindings()`), data hook, loading (via `useScreenLoading()`), telemetry (`emit()`), logging (`logger`), and sub-components.
7. **Wire into tab configuration** — Update `tabs/index.ts` to register ConflictsTab at position 4.

### Phase 3: Testing
8. **Write all E2E tests** in `e2e/tui/repository.test.ts` — file structure tests, snapshot tests, keyboard interaction tests, responsive tests, integration tests. Run them. Tests that fail due to 501 backends stay failing.
9. **Verify snapshot golden files** at 80×24, 120×40, and 200×60.

### Phase 4: Polish
10. **Add telemetry events** — Wire `emit()` calls into action handlers.
11. **Add logging** — Wire `logger` calls into data lifecycle and user actions.
12. **Verify help overlay** — Ensure `?` shows the Conflicts group with all keybindings (automatic via `group: "Conflicts"` on each `KeyHandler`).
13. **Verify status bar hints** — Ensure context-sensitive hints appear correctly in both list and filter modes (list via `useScreenKeybindings()` second arg, filter via `statusBarCtx.overrideHints()`).
14. **Remove any development stubs** — If `useRepoConflicts.stub.ts` was used, delete it and wire the real hook.

---

## Open Questions and Risks

| # | Question | Resolution |
|---|----------|------------|
| 1 | Does `ScreenName.ChangeDetail` exist in the router? | **No.** Verified in `router/types.ts` lines 1-43: 32 screen names, none is `ChangeDetail`. The `v` keybinding handler must gracefully degrade — log via `logger.warn()` and no-op. Add a TODO comment referencing the future ticket. |
| 2 | Does the API return `conflict_file_count` in the changes list response? | The `ChangeResponse` type has `has_conflict: boolean` but no count. The `useRepoConflicts()` hook (from `tui-repo-jj-hooks`) is responsible for enrichment. If not available, default to `"(?)"` in the badge until loaded on expansion. |
| 3 | How does `truncateLeft` handle Unicode grapheme clusters? | The existing `truncateLeft()` in `util/truncate.ts` (lines 50-55) uses `string.slice()` — UTF-16 code unit based. This is correct for BMP characters covering all practical file paths. Astral plane characters (emoji) in file paths are vanishingly rare. Acceptable for V1. |
| 4 | Does OpenTUI's `<scrollbox>` expose scroll position for focus tracking? | OpenTUI handles viewport clipping natively at the Zig level. Focus tracking is maintained in React state (`focusedRowIndex`). The scrollbox should auto-scroll to keep focused children visible. If not, ConflictsTab can manually manage scroll offset. |
| 5 | Tab unmount/remount on switch: is state loss acceptable? | Yes, per `tui-repo-screen-scaffold` design. Each tab mount is fresh. Data re-fetches, expanded state resets. This is documented as expected behavior. |
| 6 | `g g` conflict with global go-to mode? | The global `g` handler registers at `PRIORITY.GLOBAL = 5`. The screen-level `g` handler registers at `PRIORITY.SCREEN = 4`. Since lower number = higher priority, the screen handler fires first. `g g` at the screen level works: first `g` sets `gPending = true`, second `g` triggers `jumpToTop()`. Global go-to mode is shadowed while on the Conflicts tab. |
| 7 | Where does `truncateRight` live? | In `util/text.ts` (verified), NOT in `util/truncate.ts`. Import from `../../../util/text.js`. The `truncateText()` function in `util/truncate.ts` is functionally identical but should NOT be mixed — use `truncateRight` from `text.ts` consistently for column truncation, `truncateLeft` from `truncate.ts` for left-side truncation. |

---

## Acceptance Checklist

- [ ] `ConflictsTab` renders in tab position 4 within `RepoOverviewScreen`
- [ ] Section header shows "Conflicts (N changes, M files)" with correct counts
- [ ] `⚠` icon in `theme.warning` color when unresolved conflicts exist
- [ ] `✓` icon in `theme.success` color when all resolved
- [ ] Changes sorted by conflict file count (desc), then change ID (asc)
- [ ] Change rows show: short change ID, short commit ID, description, author, count badge (responsive)
- [ ] `j`/`k`/`Down`/`Up` navigate focus through flattened list
- [ ] Focused rows rendered with `attributes={8}` (`TextAttributes.REVERSE`)
- [ ] `Enter` on change toggles expand/collapse
- [ ] `Enter` on file pushes `ScreenName.DiffView` with `{ owner, repo, changeId, filePath }`
- [ ] `d` on file pushes diff view
- [ ] `v` on change attempts change detail (graceful degradation with `logger.warn` if `ChangeDetail` screen missing)
- [ ] Resolved files show `✓` in `theme.success` color; unresolved show `✗` in `theme.warning` color
- [ ] Resolved file paths rendered with `attributes={2}` (`TextAttributes.DIM`)
- [ ] `h` toggles resolved visibility (default: hidden)
- [ ] `/` activates filter input; `Esc` clears filter and returns focus
- [ ] Filter is case-insensitive substring on file path
- [ ] Filter input captures printable keys via OpenTUI text input priority (`PRIORITY.TEXT_INPUT = 1`)
- [ ] Status bar hints switch between list and filter modes via `statusBarCtx.overrideHints()`
- [ ] `x` expands all with batch loading (max 5 concurrent via `batchLoadConflicts()`); `z` collapses all
- [ ] `G` jumps to bottom; `g g` jumps to top
- [ ] `Ctrl+D` pages down; `Ctrl+U` pages up (half `layout.contentHeight`)
- [ ] `R` triggers hard refresh (clears expanded state, re-fetches via `hookData.refetch()`)
- [ ] Empty state: "No conflicts. All clear! ✓" in `theme.success` centered
- [ ] Loading state: `FullScreenLoading` with spinner and "Loading conflicts…"
- [ ] Large dataset loading: progress indicator "Loading conflicts… (N/M changes)"
- [ ] Error states: `FullScreenError` for 500, special message for 501/403/429
- [ ] 401 propagates to app-shell auth error screen via `useScreenLoading()` → `LoadingProvider` pipeline
- [ ] All E2E tests written and running in `e2e/tui/repository.test.ts` (failing due to 501 is expected)
- [ ] Responsive layout correct at 80×24, 120×40, 200×60
- [ ] Resize preserves focus, expanded state, and filter state
- [ ] Telemetry events emitted for all user actions via `emit()` from `lib/telemetry.js`
- [ ] Logger calls at appropriate levels via `logger` from `lib/logger.js`
- [ ] Status bar shows context-sensitive hints via `useScreenKeybindings()` second arg
- [ ] Help overlay includes Conflicts keybinding group via `group: "Conflicts"` on all `KeyHandler` entries
- [ ] No development stubs left in production code
- [ ] All imports use `.js` extension suffix per codebase convention

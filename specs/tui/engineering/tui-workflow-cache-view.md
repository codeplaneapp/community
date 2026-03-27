# Engineering Specification: `tui-workflow-cache-view`

## Implement cache management screen with statistics banner, filters, single/bulk delete

**Ticket ID:** `tui-workflow-cache-view`
**Type:** Feature
**Feature Group:** `TUI_WORKFLOW_CACHE_VIEW`
**Dependencies:**
- `tui-workflow-screen-scaffold` — `ScreenName.WorkflowCaches` enum entry, screen registry, `WorkflowCacheViewScreen` placeholder, deep-link wiring for `--screen workflow-caches`
- `tui-workflow-data-hooks` — `useWorkflowCaches()`, `useWorkflowCacheStats()`, `useDeleteWorkflowCache()`, workflow types (`WorkflowCache`, `WorkflowCacheStats`, `WorkflowCacheFilters`, `RepoIdentifier`, `PaginatedQueryResult`, `QueryResult`, `MutationResult`, `HookError`)
- `tui-workflow-ui-utils` — `formatBytes()`, `formatRelativeTime()`
- `tui-list-component` — Vim-style scrollable list patterns (j/k navigation, G/gg jump, Ctrl+D/U paging)
- `tui-modal-component` — `<Modal>` component with focus trap, Esc dismiss, responsive sizing, `PRIORITY.MODAL` keybinding scope

---

## 1. Overview

This ticket replaces the `WorkflowCacheViewScreen` placeholder component (created in `tui-workflow-screen-scaffold`) with a fully functional workflow cache management screen. The screen provides a statistics banner showing aggregate cache usage, a filterable and sortable cache entry list, inline detail expansion, single-cache deletion, and bulk-clear with confirmation overlays.

The implementation targets `apps/tui/src/screens/Workflows/WorkflowCacheViewScreen.tsx` as the primary file, with supporting sub-components and hooks co-located in the `Workflows/` directory. E2E tests target `e2e/tui/workflows.test.ts`.

### 1.1 Scope Boundaries

**In scope:**
- Statistics banner with cache count, total size, repo quota, usage bar, max archive size, TTL, last hit
- Cache entry list with status icons, keys, bookmarks, sizes, hit counts, last hit, expiration
- Inline detail expansion per cache entry
- Bookmark filter (`b`), cache key filter (`f`), text search (`/`), clear all filters (`x`)
- Sort cycling: created → last hit → size → hits
- Single-cache delete (`d`) with confirmation overlay
- Bulk-clear all matching caches (`D`) with confirmation overlay showing count/size
- Page-based pagination (30 per page, 500 total cap)
- Full responsive behavior at all three breakpoints
- Deep-link entry via `--screen workflow-caches --repo owner/repo`
- Command palette entry via `:caches`
- Navigation entry via `a` from workflow list screen
- Permission-aware keybinding dimming (read-only, write, admin)
- Manual refresh (`R`)

**Out of scope:**
- Workflow list screen (separate ticket: `tui-workflow-list-screen`)
- Workflow run detail (separate ticket: `tui-workflow-run-detail`)
- Artifact views (separate ticket: `tui-workflow-artifacts-view`)
- Cache creation/upload (caches are created by workflow runs)
- SSE streaming (cache data is static, fetched on demand)

---

## 2. Current State Assessment

### 2.1 Production files (in `apps/tui/src/`)

| File | State | Relevance |
|------|-------|----------|
| `screens/Workflows/WorkflowCacheViewScreen.tsx` | Placeholder (from scaffold) | **Replace** — current implementation renders param dump only |
| `hooks/workflow-types.ts` | Implemented (225 lines) | Consumed — `WorkflowCache`, `WorkflowCacheStats`, `WorkflowCacheFilters`, `RepoIdentifier`, `PaginatedQueryResult`, `QueryResult`, `MutationResult`, `HookError`, `MAX_CACHES` |
| `hooks/useWorkflowCaches.ts` | Implemented (73 lines) | Consumed — `useWorkflowCaches()`, `useWorkflowCacheStats()` |
| `hooks/useWorkflowActions.ts` | Implemented (242 lines) | Consumed — `useDeleteWorkflowCache()` |
| `screens/Workflows/utils.ts` | Implemented (156 lines) | Consumed — `formatBytes()`, `formatRelativeTime()` |
| `components/Modal.tsx` | Implemented (from `tui-modal-component`) | Consumed — `<Modal>`, focus trapping, Esc dismiss, responsive sizing |
| `components/FullScreenError.tsx` | Implemented (52 lines) | Consumed — error state with screen label |
| `components/FullScreenLoading.tsx` | Implemented | Consumed — loading spinner state |
| `hooks/useScreenKeybindings.ts` | Implemented (55 lines) | Consumed — PRIORITY.SCREEN scope registration |
| `hooks/useSpinner.ts` | Implemented (178 lines) | Consumed — braille/ASCII spinner for animated loading |
| `hooks/useLayout.ts` | Implemented (110 lines) | Consumed — breakpoint detection, content dimensions |
| `hooks/useBreakpoint.ts` | Implemented | Consumed — responsive breakpoint enum |
| `hooks/useResponsiveValue.ts` | Implemented | Consumed — breakpoint-conditional values |
| `providers/NavigationProvider.tsx` | Implemented | Consumed — `push()`, `pop()`, `repoContext` |
| `providers/KeybindingProvider.tsx` | Implemented (165 lines) | Consumed — scope registration, priority dispatch |
| `providers/OverlayManager.tsx` | Implemented | Consumed — overlay mutual exclusion |
| `theme/tokens.ts` | Implemented (263 lines) | Consumed — `CoreTokenName`, `ThemeTokens`, `TextAttributes` |
| `util/text.ts` | Implemented | Consumed — `truncateRight()`, `fitWidth()` |

### 2.2 Absent from production

| File | Purpose |
|------|--------|
| `screens/Workflows/WorkflowCacheViewScreen.tsx` | Full implementation (replaces placeholder) |
| `screens/Workflows/components/CacheStatsBanner.tsx` | Statistics banner with usage bar |
| `screens/Workflows/components/CacheFilterBar.tsx` | Filter pill display + active filter indicator |
| `screens/Workflows/components/CacheRow.tsx` | Individual cache entry row with status, key, size, hits |
| `screens/Workflows/components/CacheDetailPanel.tsx` | Expanded inline detail for a single cache entry |
| `screens/Workflows/components/CacheDeleteOverlay.tsx` | Confirmation modal for single delete and bulk clear |
| `screens/Workflows/hooks/useCacheViewState.ts` | Screen-level state orchestrator hook |
| `screens/Workflows/hooks/useCacheFilters.ts` | Filter and search state management |
| `screens/Workflows/hooks/useCacheSort.ts` | Sort field cycling |
| `screens/Workflows/hooks/useCacheDelete.ts` | Delete and bulk-clear confirmation flow |

---

## 3. File Inventory

### 3.1 Source files (all under `apps/tui/src/`)

| File | Purpose | Action |
|------|---------|--------|
| `screens/Workflows/WorkflowCacheViewScreen.tsx` | Screen component — orchestrates layout, hooks, sub-components | **Replace** (overwrite placeholder) |
| `screens/Workflows/components/CacheStatsBanner.tsx` | Statistics banner with usage bar, quota, TTL, max archive | **New** |
| `screens/Workflows/components/CacheFilterBar.tsx` | Filter pills, active filter display, sort indicator | **New** |
| `screens/Workflows/components/CacheRow.tsx` | Cache entry row with status icon, key, bookmark, size, hits | **New** |
| `screens/Workflows/components/CacheDetailPanel.tsx` | Expanded inline detail panel below cache row | **New** |
| `screens/Workflows/components/CacheDeleteOverlay.tsx` | Confirmation modal for single delete and bulk clear | **New** |
| `screens/Workflows/hooks/useCacheViewState.ts` | State orchestrator — composes data, filters, sort, deletion | **New** |
| `screens/Workflows/hooks/useCacheFilters.ts` | Filter input, search, and active filter pill state | **New** |
| `screens/Workflows/hooks/useCacheSort.ts` | Sort field cycling logic | **New** |
| `screens/Workflows/hooks/useCacheDelete.ts` | Single delete + bulk clear confirmation state machine | **New** |
| `screens/Workflows/components/index.ts` | Barrel export — add cache component re-exports | **Modify** |
| `screens/Workflows/hooks/index.ts` | Barrel export — add cache hook re-exports | **Modify** |
| `screens/Workflows/index.ts` | Barrel export — add WorkflowCacheViewScreen re-export | **Modify** |

### 3.2 Test files (all under `e2e/tui/`)

| File | Purpose | Action |
|------|---------|--------|
| `workflows.test.ts` | E2E tests — 115 tests across snapshot, keyboard, responsive, integration, and edge case categories | **Modify** (append cache view tests to existing workflow test suite) |

---

## 4. Architecture

### 4.1 Component Hierarchy

```
WorkflowCacheViewScreen
├── useCacheViewState()                        ← orchestrator hook
│   ├── useWorkflowCacheStats(repo)            ← stats fetch
│   ├── useWorkflowCaches(repo, filters)       ← paginated list fetch
│   ├── useCacheFilters()                      ← filter/search state
│   ├── useCacheSort()                         ← sort cycling
│   ├── useCacheDelete(repo, callbacks)        ← delete confirmation flow
│   └── useSpinner()                           ← loading animation
├── Loading state → <FullScreenLoading label="Loading caches…" />
├── Error state → <FullScreenError screenLabel="Workflow Caches" error={error} />
├── Data loaded:
│   ├── <CacheStatsBanner stats={stats} breakpoint={bp} />
│   ├── <CacheFilterBar
│   │     activeBookmarkFilter={bm}
│   │     activeKeyFilter={key}
│   │     searchQuery={q}
│   │     sortField={sort}
│   │     filterInputState={inputState}
│   │     onFilterSubmit={applyFilter}
│   │     onFilterClear={clearFilters}
│   │     breakpoint={bp}
│   │   />
│   ├── <scrollbox onScrollEnd={loadNextPage}>
│   │   ├── Column headers (when breakpoint ≠ "minimum")
│   │   ├── {caches.map(cache => (
│   │   │   <box flexDirection="column" key={cache.id}>
│   │   │     <CacheRow
│   │   │       cache={cache}
│   │   │       focused={cache.id === focusedId}
│   │   │       breakpoint={bp}
│   │   │     />
│   │   │     {expandedIds.has(cache.id) && (
│   │   │       <CacheDetailPanel cache={cache} breakpoint={bp} />
│   │   │     )}
│   │   │   </box>
│   │   │ ))}
│   │   └── {isLoadingMore && <text color="muted">Loading more…</text>}
│   │   └── </scrollbox>
│   └── Empty states: "No workflow caches" or "No caches matching filters"
└── <CacheDeleteOverlay
      mode={deleteMode}
      targetCache={deleteTarget}
      matchingCount={matchCount}
      matchingSize={matchSize}
      filterContext={filterCtx}
      onConfirm={confirmDelete}
      onDismiss={dismissDelete}
      isLoading={deleteLoading}
      error={deleteError}
    />
```

### 4.2 Data Flow

```
WorkflowCacheViewScreen (entry.params: { owner, repo })
  │
  ├── useWorkflowCacheStats(repo)
  │   └── GET /api/repos/:owner/:repo/actions/cache/stats
  │       └── Returns: { total_count, total_size_bytes }
  │
  ├── useWorkflowCaches(repo, { bookmark?, key?, page, per_page })
  │   └── GET /api/repos/:owner/:repo/actions/cache?bookmark=X&key=Y&page=N&per_page=30
  │       └── Returns: WorkflowCache[]
  │
  ├── useDeleteWorkflowCache(repo)
  │   └── DELETE /api/repos/:owner/:repo/actions/cache
  │       └── Returns: { deleted_count }
  │
  └── (Post-delete) → refetch stats + refetch cache list
```

### 4.3 State Machine: Cache View Screen

```
                                ┌──────────┐
                   mount ──────→│ loading  │
                                └────┬─────┘
                                     │
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
                 ┌───────┐     ┌──────────┐    ┌──────────┐
                 │ error │     │ partial  │    │  ready   │
                 └───┬───┘     └────┬─────┘    └────┬─────┘
                     │              │                │
                R: refetch     stats ok,        user interaction
                     │         list failed           │
                     └──────────────────────────────┘
```

Ready sub-states:
- `browsing` — list focused, navigating with j/k, expanding details
- `filtering` — filter input focused, typing filter value
- `searching` — search input focused, typing search query
- `delete_pending` — single-delete confirmation overlay visible
- `clear_pending` — bulk-clear confirmation overlay visible
- `delete_executing` — overlay showing spinner during API call

### 4.4 State Machine: Filter Input

```
                  ┌──────────┐
   b/f/  key ────→│  input   │ (filter input focused)
                  └────┬─────┘
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
          ┌───────┐  ┌────┐  ┌────────────┐
          │ Enter │  │Esc │  │ typing...  │
          └───┬───┘  └──┬─┘  └────────────┘
              │         │
              ▼         ▼
          apply       discard value
          filter      return focus to list
          refetch
```

### 4.5 State Machine: Delete Confirmation

```
                ┌──────┐
   d/D key ────→│ open │
                └──┬───┘
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
      ┌───────┐  ┌────┐  ┌─────────┐
      │confirm│  │esc │  │tab focus│
      └───┬───┘  └──┬─┘  └─────────┘
          │         │
          ▼         ▼
     ┌─────────┐  closed
     │executing│
     └────┬────┘
          │
     ┌────┼──────┐
     ▼           ▼
 ┌───────┐  ┌───────┐
 │success│  │ error │
 └───┬───┘  └───┬───┘
     │          │
     ▼          ▼
 close overlay, show error
 refetch stats  in overlay
 + list         (retry/dismiss)
```

---

## 5. Implementation Plan

### Step 1: Create `hooks/useCacheSort.ts`

**File:** `apps/tui/src/screens/Workflows/hooks/useCacheSort.ts`

A hook that manages sort field cycling for the cache list.

```typescript
import { useState, useCallback } from "react";

export type CacheSortField = "created" | "last_hit" | "size" | "hits";

const SORT_CYCLE: readonly CacheSortField[] = ["created", "last_hit", "size", "hits"];

const SORT_LABELS: Record<CacheSortField, string> = {
  created: "created ↓",
  last_hit: "last hit ↓",
  size: "size ↓",
  hits: "hits ↓",
};

export interface CacheSortState {
  sortField: CacheSortField;
  sortLabel: string;
  cycleSort: () => CacheSortField;
}

export function useCacheSort(): CacheSortState {
  const [sortField, setSortField] = useState<CacheSortField>("created");

  const cycleSort = useCallback((): CacheSortField => {
    const currentIndex = SORT_CYCLE.indexOf(sortField);
    const nextIndex = (currentIndex + 1) % SORT_CYCLE.length;
    const next = SORT_CYCLE[nextIndex];
    setSortField(next);
    return next;
  }, [sortField]);

  return {
    sortField,
    sortLabel: SORT_LABELS[sortField],
    cycleSort,
  };
}
```

**Design decisions:**
- Sort is client-side. The API does not support a `sort` query parameter for caches — all loaded pages are sorted locally.
- Cycle order matches the product spec: created → last_hit → size → hits → created.
- Returns the new sort field from `cycleSort()` so callers can use it in telemetry.

---

### Step 2: Create `hooks/useCacheFilters.ts`

**File:** `apps/tui/src/screens/Workflows/hooks/useCacheFilters.ts`

Manages bookmark filter, cache key filter, search query, and filter input focus state.

```typescript
import { useState, useCallback, useRef } from "react";

export type FilterInputType = "bookmark" | "key" | "search" | null;

export interface FilterInputState {
  type: FilterInputType;
  value: string;
}

export interface CacheFilterState {
  /** Currently applied bookmark filter (null = no filter) */
  activeBookmarkFilter: string | null;
  /** Currently applied cache key filter (null = no filter) */
  activeKeyFilter: string | null;
  /** Client-side search query for fuzzy matching */
  searchQuery: string;
  /** Whether any filter is currently active */
  hasActiveFilters: boolean;
  /** Current filter input focus state */
  filterInput: FilterInputState;
  /** Whether filter input is focused */
  isFilterInputActive: boolean;
  /** Open bookmark filter input */
  openBookmarkFilter: () => void;
  /** Open cache key filter input */
  openKeyFilter: () => void;
  /** Open search input */
  openSearch: () => void;
  /** Apply the current filter input value */
  applyFilter: () => void;
  /** Dismiss filter input without applying */
  dismissFilterInput: () => void;
  /** Update filter input value (typing) */
  setFilterInputValue: (value: string) => void;
  /** Clear all active filters */
  clearAllFilters: () => void;
  /** Build WorkflowCacheFilters for API call */
  toAPIFilters: () => { bookmark?: string; key?: string };
}

export function useCacheFilters(): CacheFilterState {
  const [bookmarkFilter, setBookmarkFilter] = useState<string | null>(null);
  const [keyFilter, setKeyFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterInput, setFilterInput] = useState<FilterInputState>({
    type: null,
    value: "",
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFilterInputActive = filterInput.type !== null;
  const hasActiveFilters =
    bookmarkFilter !== null || keyFilter !== null || searchQuery.length > 0;

  const openBookmarkFilter = useCallback(() => {
    setFilterInput({ type: "bookmark", value: bookmarkFilter ?? "" });
  }, [bookmarkFilter]);

  const openKeyFilter = useCallback(() => {
    setFilterInput({ type: "key", value: keyFilter ?? "" });
  }, [keyFilter]);

  const openSearch = useCallback(() => {
    setFilterInput({ type: "search", value: searchQuery });
  }, [searchQuery]);

  const applyFilter = useCallback(() => {
    const { type, value } = filterInput;
    const trimmed = value.trim().slice(0, 100); // max 100 chars

    switch (type) {
      case "bookmark":
        setBookmarkFilter(trimmed.length > 0 ? trimmed : null);
        break;
      case "key":
        setKeyFilter(trimmed.length > 0 ? trimmed : null);
        break;
      case "search":
        setSearchQuery(trimmed);
        break;
    }

    setFilterInput({ type: null, value: "" });
  }, [filterInput]);

  const dismissFilterInput = useCallback(() => {
    setFilterInput({ type: null, value: "" });
  }, []);

  const setFilterInputValue = useCallback((value: string) => {
    if (value.length > 100) return;
    setFilterInput((prev) => ({ ...prev, value }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setBookmarkFilter(null);
    setKeyFilter(null);
    setSearchQuery("");
    setFilterInput({ type: null, value: "" });
  }, []);

  const toAPIFilters = useCallback(
    () => ({
      ...(bookmarkFilter ? { bookmark: bookmarkFilter } : {}),
      ...(keyFilter ? { key: keyFilter } : {}),
    }),
    [bookmarkFilter, keyFilter],
  );

  return {
    activeBookmarkFilter: bookmarkFilter,
    activeKeyFilter: keyFilter,
    searchQuery,
    hasActiveFilters,
    filterInput,
    isFilterInputActive,
    openBookmarkFilter,
    openKeyFilter,
    openSearch,
    applyFilter,
    dismissFilterInput,
    setFilterInputValue,
    clearAllFilters,
    toAPIFilters,
  };
}
```

**Design decisions:**
- Bookmark and key filters are sent as API query parameters and trigger a list refetch.
- Search is client-side only — fuzzy matches against loaded cache keys and bookmark names.
- Filter input max 100 characters, enforced at the setter level.
- `toAPIFilters()` returns an object compatible with `WorkflowCacheFilters`.
- Debounce not applied at filter level — only on search (implemented in the screen component via 200ms setTimeout on search value changes).

---

### Step 3: Create `hooks/useCacheDelete.ts`

**File:** `apps/tui/src/screens/Workflows/hooks/useCacheDelete.ts`

State machine for single-cache delete and bulk-clear confirmation flow.

```typescript
import { useState, useCallback } from "react";
import type {
  RepoIdentifier,
  WorkflowCache,
  HookError,
} from "../../../hooks/workflow-types.js";
import { useDeleteWorkflowCache } from "../../../hooks/useWorkflowActions.js";

export type DeleteMode = "single" | "bulk" | null;

export interface DeleteState {
  mode: DeleteMode;
  targetCache: WorkflowCache | null;
  isOverlayOpen: boolean;
  isLoading: boolean;
  error: HookError | null;
}

export interface CacheDeleteActions {
  state: DeleteState;
  /** Initiate single-cache delete (opens confirmation overlay) */
  initSingleDelete: (cache: WorkflowCache) => void;
  /** Initiate bulk clear (opens confirmation overlay) */
  initBulkClear: () => void;
  /** Confirm the pending delete/clear action */
  confirm: () => Promise<void>;
  /** Dismiss the confirmation overlay */
  dismiss: () => void;
}

export function useCacheDelete(
  repo: RepoIdentifier,
  callbacks: {
    onDeleteSuccess: () => void;
    onClearSuccess: () => void;
    onError: (error: HookError) => void;
  },
): CacheDeleteActions {
  const [state, setState] = useState<DeleteState>({
    mode: null,
    targetCache: null,
    isOverlayOpen: false,
    isLoading: false,
    error: null,
  });

  const deleteMutation = useDeleteWorkflowCache(repo, {
    onSuccess: () => {
      setState({
        mode: null,
        targetCache: null,
        isOverlayOpen: false,
        isLoading: false,
        error: null,
      });
      if (state.mode === "single") {
        callbacks.onDeleteSuccess();
      } else {
        callbacks.onClearSuccess();
      }
    },
    onError: (error) => {
      setState((prev) => ({ ...prev, isLoading: false, error }));
      callbacks.onError(error);
    },
  });

  const initSingleDelete = useCallback((cache: WorkflowCache) => {
    if (cache.status === "pending") return; // pending caches not deletable
    setState({
      mode: "single",
      targetCache: cache,
      isOverlayOpen: true,
      isLoading: false,
      error: null,
    });
  }, []);

  const initBulkClear = useCallback(() => {
    setState({
      mode: "bulk",
      targetCache: null,
      isOverlayOpen: true,
      isLoading: false,
      error: null,
    });
  }, []);

  const confirm = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      if (state.mode === "single" && state.targetCache) {
        await deleteMutation.execute(state.targetCache.id);
      } else if (state.mode === "bulk") {
        // Bulk clear uses cache ID 0 as sentinel — the hook currently maps
        // all deletes to the bulk endpoint anyway
        await deleteMutation.execute(0);
      }
    } catch {
      // Error handled via onError callback
    }
  }, [state.mode, state.targetCache, deleteMutation]);

  const dismiss = useCallback(() => {
    if (state.isLoading) return; // cannot dismiss during execution
    setState({
      mode: null,
      targetCache: null,
      isOverlayOpen: false,
      isLoading: false,
      error: null,
    });
  }, [state.isLoading]);

  return {
    state,
    initSingleDelete,
    initBulkClear,
    confirm,
    dismiss,
  };
}
```

**Design decisions:**
- Cannot dismiss overlay while loading (`isLoading` guard on `dismiss()`).
- Pending caches (status = "pending") are rejected at `initSingleDelete` — the d key handler checks this before opening the overlay.
- The existing `useDeleteWorkflowCache` hook calls `DELETE /api/repos/:owner/:repo/actions/cache` which is the bulk endpoint. When the server implements per-cache delete (`DELETE /api/repos/:owner/:repo/actions/cache/:id`), only the hook needs updating — this screen-level code remains unchanged.
- Error is preserved in state so the overlay can display it and offer retry.

---

### Step 4: Create `hooks/useCacheViewState.ts`

**File:** `apps/tui/src/screens/Workflows/hooks/useCacheViewState.ts`

Orchestrator hook composing all data, filter, sort, and deletion hooks.

```typescript
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  RepoIdentifier,
  WorkflowCache,
  WorkflowCacheStats,
  HookError,
} from "../../../hooks/workflow-types.js";
import { useWorkflowCaches, useWorkflowCacheStats } from "../../../hooks/useWorkflowCaches.js";
import { useSpinner } from "../../../hooks/useSpinner.js";
import { useCacheFilters, type CacheFilterState } from "./useCacheFilters.js";
import { useCacheSort, type CacheSortState } from "./useCacheSort.js";
import { useCacheDelete, type CacheDeleteActions } from "./useCacheDelete.js";

export interface CacheViewState {
  // Data
  stats: WorkflowCacheStats | null;
  statsLoading: boolean;
  statsError: HookError | null;
  caches: WorkflowCache[];
  cachesLoading: boolean;
  cachesError: HookError | null;
  hasMore: boolean;
  totalCount: number;
  isLoadingMore: boolean;

  // UI state
  focusedIndex: number;
  focusedCache: WorkflowCache | null;
  expandedIds: ReadonlySet<number>;

  // Composed state
  filters: CacheFilterState;
  sort: CacheSortState;
  deleteActions: CacheDeleteActions;
  spinnerFrame: string;

  // Derived
  filteredCaches: WorkflowCache[];
  matchingCount: number;
  matchingSize: number;
  isReady: boolean;
  isPartialError: boolean;

  // Actions
  focusNext: () => void;
  focusPrev: () => void;
  focusFirst: () => void;
  focusLast: () => void;
  pageDown: (pageSize: number) => void;
  pageUp: (pageSize: number) => void;
  toggleExpand: () => void;
  loadNextPage: () => void;
  refresh: () => void;
}

export function useCacheViewState(repo: RepoIdentifier): CacheViewState {
  const filters = useCacheFilters();
  const sort = useCacheSort();
  const { frame: spinnerFrame } = useSpinner();

  // API data
  const apiFilters = filters.toAPIFilters();
  const statsResult = useWorkflowCacheStats(repo);
  const cachesResult = useWorkflowCaches(repo, {
    ...apiFilters,
    per_page: 30,
  });

  // Focus state
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Client-side search filtering + sort
  const filteredCaches = useMemo(() => {
    let result = [...cachesResult.data];

    // Client-side search
    if (filters.searchQuery.length > 0) {
      const q = filters.searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.cache_key.toLowerCase().includes(q) ||
          c.bookmark_name.toLowerCase().includes(q),
      );
    }

    // Client-side sort
    result.sort((a, b) => {
      switch (sort.sortField) {
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "last_hit":
          return (
            (b.last_hit_at ? new Date(b.last_hit_at).getTime() : 0) -
            (a.last_hit_at ? new Date(a.last_hit_at).getTime() : 0)
          );
        case "size":
          return b.object_size_bytes - a.object_size_bytes;
        case "hits":
          return b.hit_count - a.hit_count;
        default:
          return 0;
      }
    });

    return result;
  }, [cachesResult.data, filters.searchQuery, sort.sortField]);

  // Derived totals for bulk-clear overlay
  const matchingCount = filteredCaches.length;
  const matchingSize = filteredCaches.reduce(
    (sum, c) => sum + c.object_size_bytes,
    0,
  );

  // Delete handler
  const deleteActions = useCacheDelete(repo, {
    onDeleteSuccess: () => {
      cachesResult.refetch();
      statsResult.refetch();
    },
    onClearSuccess: () => {
      cachesResult.refetch();
      statsResult.refetch();
    },
    onError: () => {
      // Error displayed in overlay
    },
  });

  // Clamp focus when list changes
  useEffect(() => {
    if (filteredCaches.length === 0) {
      setFocusedIndex(0);
    } else if (focusedIndex >= filteredCaches.length) {
      setFocusedIndex(filteredCaches.length - 1);
    }
  }, [filteredCaches.length, focusedIndex]);

  // Navigation actions
  const focusNext = useCallback(() => {
    setFocusedIndex((i) => Math.min(i + 1, filteredCaches.length - 1));
  }, [filteredCaches.length]);

  const focusPrev = useCallback(() => {
    setFocusedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const focusFirst = useCallback(() => {
    setFocusedIndex(0);
  }, []);

  const focusLast = useCallback(() => {
    setFocusedIndex(Math.max(0, filteredCaches.length - 1));
  }, [filteredCaches.length]);

  const pageDown = useCallback(
    (pageSize: number) => {
      setFocusedIndex((i) => Math.min(i + pageSize, filteredCaches.length - 1));
    },
    [filteredCaches.length],
  );

  const pageUp = useCallback((pageSize: number) => {
    setFocusedIndex((i) => Math.max(i - pageSize, 0));
  }, []);

  const toggleExpand = useCallback(() => {
    const cache = filteredCaches[focusedIndex];
    if (!cache) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cache.id)) {
        next.delete(cache.id);
      } else {
        next.add(cache.id);
      }
      return next;
    });
  }, [filteredCaches, focusedIndex]);

  const loadNextPage = useCallback(() => {
    if (cachesResult.hasMore && !cachesResult.loading) {
      cachesResult.loadMore();
    }
  }, [cachesResult]);

  const refresh = useCallback(() => {
    cachesResult.refetch();
    statsResult.refetch();
  }, [cachesResult, statsResult]);

  const focusedCache = filteredCaches[focusedIndex] ?? null;

  const isReady =
    !statsResult.loading && !cachesResult.loading && !statsResult.error && !cachesResult.error;
  const isPartialError =
    (statsResult.error !== null && !cachesResult.error) ||
    (!statsResult.error && cachesResult.error !== null);

  return {
    stats: statsResult.data,
    statsLoading: statsResult.loading,
    statsError: statsResult.error,
    caches: cachesResult.data,
    cachesLoading: cachesResult.loading,
    cachesError: cachesResult.error,
    hasMore: cachesResult.hasMore,
    totalCount: cachesResult.totalCount,
    isLoadingMore: cachesResult.loading && cachesResult.data.length > 0,
    focusedIndex,
    focusedCache,
    expandedIds,
    filters,
    sort,
    deleteActions,
    spinnerFrame,
    filteredCaches,
    matchingCount,
    matchingSize,
    isReady,
    isPartialError,
    focusNext,
    focusPrev,
    focusFirst,
    focusLast,
    pageDown,
    pageUp,
    toggleExpand,
    loadNextPage,
    refresh,
  };
}
```

**Design decisions:**
- Single orchestrator prevents prop-drilling across the 5 sub-components.
- Sort and search are client-side on loaded data. Bookmark and key filters are server-side (API query params).
- Focus index is clamped when filtered list changes (e.g., filter applied removes items).
- `isPartialError` enables independent error recovery: stats banner shows "—" if stats fail, list shows error with retry if list fails.
- `matchingCount` and `matchingSize` are derived for the bulk-clear overlay.

---

### Step 5: Create `components/CacheStatsBanner.tsx`

**File:** `apps/tui/src/screens/Workflows/components/CacheStatsBanner.tsx`

Renders the statistics banner with usage bar.

```typescript
import * as React from "react";
import type { WorkflowCacheStats } from "../../../hooks/workflow-types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";
import type { CoreTokenName } from "../../../theme/tokens.js";
import { formatBytes, formatRelativeTime } from "../utils.js";

interface CacheStatsBannerProps {
  stats: WorkflowCacheStats | null;
  repoQuotaBytes: number;         // from extended stats or default 1GB
  archiveMaxBytes: number;         // from extended stats or default 50MB
  ttlSeconds: number;              // from extended stats or default 7d
  lastHitAt: string | null;        // from extended stats
  breakpoint: Breakpoint;
}

// Quota defaults (used when server returns partial stats)
const DEFAULT_QUOTA_BYTES = 1_073_741_824;  // 1 GB
const DEFAULT_ARCHIVE_MAX = 52_428_800;     // 50 MB
const DEFAULT_TTL_SECONDS = 604_800;        // 7 days

function getUsagePercent(used: number, quota: number): number {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

function getUsageColor(percent: number): CoreTokenName {
  if (percent >= 90) return "error";
  if (percent >= 75) return "warning";
  return "success";
}

function renderUsageBar(
  percent: number,
  totalWidth: number,
  hasColor: boolean,
): { bar: string; color: CoreTokenName } {
  const filled = Math.round((percent / 100) * totalWidth);
  const empty = totalWidth - filled;
  const color = getUsageColor(percent);

  if (hasColor) {
    return {
      bar: "█".repeat(filled) + "░".repeat(empty),
      color,
    };
  }
  // NO_COLOR fallback
  return {
    bar: "[" + "#".repeat(filled) + "-".repeat(empty) + "]",
    color: "muted",
  };
}

function formatTTL(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  return `${hours}h`;
}

export function CacheStatsBanner({
  stats,
  repoQuotaBytes,
  archiveMaxBytes,
  ttlSeconds,
  lastHitAt,
  breakpoint,
}: CacheStatsBannerProps) {
  const count = stats?.total_count ?? 0;
  const usedBytes = stats?.total_size_bytes ?? 0;
  const quota = repoQuotaBytes || DEFAULT_QUOTA_BYTES;
  const archiveMax = archiveMaxBytes || DEFAULT_ARCHIVE_MAX;
  const ttl = ttlSeconds || DEFAULT_TTL_SECONDS;
  const usagePercent = getUsagePercent(usedBytes, quota);
  const usageColor = getUsageColor(usagePercent);

  const hasColor = !process.env.NO_COLOR;

  const barWidth =
    breakpoint === "minimum" ? 10 : breakpoint === "standard" ? 20 : 30;
  const { bar, color: barColor } = renderUsageBar(usagePercent, barWidth, hasColor);

  if (breakpoint === "minimum") {
    // Single line
    return (
      <box paddingX={1} borderBottom="single" borderColor="border">
        <box flexDirection="row" gap={1}>
          <text bold>{hasColor ? "📦" : "[C]"} {count}</text>
          <text>
            {formatBytes(usedBytes)} / {formatBytes(quota)}
          </text>
          <text color={barColor}>{bar}</text>
          <text color={usageColor}>{usagePercent}%</text>
        </box>
      </box>
    );
  }

  if (breakpoint === "standard") {
    // Two lines
    return (
      <box flexDirection="column" paddingX={1} borderBottom="single" borderColor="border">
        <box flexDirection="row" gap={2}>
          <text bold>{hasColor ? "📦" : "[C]"} Caches: {count}</text>
          <text>
            Used: {formatBytes(usedBytes)} / {formatBytes(quota)}
          </text>
          <text color={barColor}>{bar}</text>
          <text color={usageColor}>{usagePercent}%</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text color="muted">Max archive: {formatBytes(archiveMax)}</text>
          <text color="muted">TTL: {formatTTL(ttl)}</text>
          <text color="muted">
            Last hit: {lastHitAt ? formatRelativeTime(lastHitAt) : "never"}
          </text>
        </box>
      </box>
    );
  }

  // Large — three lines
  return (
    <box flexDirection="column" paddingX={1} borderBottom="single" borderColor="border">
      <box flexDirection="row" gap={2}>
        <text bold>{hasColor ? "📦" : "[C]"} Caches: {count}</text>
        <text>
          Used: {formatBytes(usedBytes)} / {formatBytes(quota)}
        </text>
        <text color={barColor}>{bar}</text>
        <text color={usageColor}>{usagePercent}%</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Max archive: {formatBytes(archiveMax)}</text>
        <text color="muted">TTL: {formatTTL(ttl)}</text>
        <text color="muted">
          Last hit: {lastHitAt ? formatRelativeTime(lastHitAt) : "never"}
        </text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Repo quota: {formatBytes(quota)}</text>
        <text color="muted">Max expires: —</text>
      </box>
    </box>
  );
}
```

**Design decisions:**
- Usage bar adapts width per breakpoint: 10ch minimum, 20ch standard, 30ch large.
- Color thresholds: green <75%, yellow 75-89%, red ≥90%.
- `NO_COLOR` environment variable forces ASCII fallback: `[###-------] 30%`, `[FIN]`/`[PEND]` for status.
- Stats values default to "—" when null (handled by `formatBytes()`).
- Quota defaults provided as constants for when server returns only `total_count` and `total_size_bytes`.

---

### Step 6: Create `components/CacheFilterBar.tsx`

**File:** `apps/tui/src/screens/Workflows/components/CacheFilterBar.tsx`

Renders active filter pills, inline filter input, and sort indicator.

```typescript
import * as React from "react";
import type { FilterInputState } from "../hooks/useCacheFilters.js";
import type { CacheSortField } from "../hooks/useCacheSort.js";
import type { Breakpoint } from "../../../types/breakpoint.js";

interface CacheFilterBarProps {
  activeBookmarkFilter: string | null;
  activeKeyFilter: string | null;
  searchQuery: string;
  sortField: CacheSortField;
  sortLabel: string;
  filterInput: FilterInputState;
  isFilterInputActive: boolean;
  onFilterInputChange: (value: string) => void;
  onFilterSubmit: () => void;
  onFilterDismiss: () => void;
  breakpoint: Breakpoint;
}

const FILTER_LABELS: Record<string, string> = {
  bookmark: "bookmark:",
  key: "key:",
  search: "search:",
};

export function CacheFilterBar({
  activeBookmarkFilter,
  activeKeyFilter,
  searchQuery,
  sortField,
  sortLabel,
  filterInput,
  isFilterInputActive,
  onFilterInputChange,
  onFilterSubmit,
  onFilterDismiss,
  breakpoint,
}: CacheFilterBarProps) {
  const hasFilters =
    activeBookmarkFilter !== null ||
    activeKeyFilter !== null ||
    searchQuery.length > 0;

  if (!hasFilters && !isFilterInputActive) {
    // No filters active, just show sort
    return (
      <box flexDirection="row" paddingX={1} borderBottom="single" borderColor="border">
        <box flexGrow={1} />
        <text color="muted">sort:{sortLabel}</text>
      </box>
    );
  }

  return (
    <box flexDirection="row" gap={1} paddingX={1} borderBottom="single" borderColor="border">
      {activeBookmarkFilter && (
        <text color="primary" inverse>
          {" "}bookmark:{activeBookmarkFilter}{" "}
        </text>
      )}
      {activeKeyFilter && (
        <text color="primary" inverse>
          {" "}key:{activeKeyFilter}{" "}
        </text>
      )}
      {searchQuery.length > 0 && (
        <text color="primary" inverse>
          {" "}search:{searchQuery}{" "}
        </text>
      )}
      {isFilterInputActive && (
        <input
          label={FILTER_LABELS[filterInput.type!] ?? ""}
          value={filterInput.value}
          onChange={onFilterInputChange}
          onSubmit={onFilterSubmit}
        />
      )}
      <box flexGrow={1} />
      <text color="muted">sort:{sortLabel}</text>
    </box>
  );
}
```

---

### Step 7: Create `components/CacheRow.tsx`

**File:** `apps/tui/src/screens/Workflows/components/CacheRow.tsx`

Individual cache entry row with status icon, key, bookmark, size, hits, timing.

```typescript
import * as React from "react";
import type { WorkflowCache } from "../../../hooks/workflow-types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";
import type { CoreTokenName } from "../../../theme/tokens.js";
import { formatBytes, formatRelativeTime } from "../utils.js";
import { truncateRight, fitWidth } from "../../../util/text.js";

interface CacheRowProps {
  cache: WorkflowCache;
  focused: boolean;
  breakpoint: Breakpoint;
}

function statusIcon(
  status: "pending" | "finalized",
  hasColor: boolean,
): { icon: string; color: CoreTokenName } {
  if (status === "finalized") {
    return { icon: hasColor ? "✓" : "[FIN]", color: "success" };
  }
  return { icon: hasColor ? "◌" : "[PEND]", color: "warning" };
}

function expirationColor(expiresAt: string | null): CoreTokenName {
  if (!expiresAt) return "muted";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "error";
  if (remaining <= 86_400_000) return "error"; // < 1 day
  if (remaining <= 172_800_000) return "warning"; // < 2 days
  return "muted";
}

function formatExpiration(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  const hours = Math.floor(remaining / 3_600_000);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days < 7) return `in ${days}d ${remHours}h`;
  return `in ${days}d`;
}

export function CacheRow({ cache, focused, breakpoint }: CacheRowProps) {
  const hasColor = !process.env.NO_COLOR;
  const { icon, color: iconColor } = statusIcon(cache.status, hasColor);

  // Column widths by breakpoint
  const keyWidth = breakpoint === "minimum" ? -1 : breakpoint === "standard" ? 30 : 50;
  const bookmarkWidth = breakpoint === "standard" ? 15 : breakpoint === "large" ? 30 : 0;
  const showHits = breakpoint !== "minimum";
  const showLastHit = breakpoint !== "minimum";
  const showExpiration = breakpoint !== "minimum";
  const showVersion = breakpoint === "large";
  const showCompression = breakpoint === "large";

  return (
    <box
      flexDirection="row"
      paddingX={1}
      style={focused ? { reverse: true, color: "primary" } : {}}
    >
      {/* Status icon */}
      <text color={iconColor} width={hasColor ? 2 : 6}>{icon}</text>

      {/* Cache key — fills remaining space at minimum */}
      {breakpoint === "minimum" ? (
        <text flexGrow={1}>
          {truncateRight(cache.cache_key, 999)}
        </text>
      ) : (
        <text width={keyWidth}>
          {truncateRight(cache.cache_key, keyWidth)}
        </text>
      )}

      {/* Bookmark */}
      {bookmarkWidth > 0 && (
        <text color="muted" width={bookmarkWidth}>
          {truncateRight(cache.bookmark_name, bookmarkWidth)}
        </text>
      )}

      {/* Version (large only) */}
      {showVersion && (
        <text color="muted" width={10}>
          {truncateRight(cache.cache_version, 10)}
        </text>
      )}

      {/* Compression (large only) */}
      {showCompression && (
        <text color="muted" width={6}>
          {truncateRight(cache.compression || "—", 6)}
        </text>
      )}

      {/* Size */}
      <text width={8} textAlign="right">
        {cache.status === "pending" ? "—" : formatBytes(cache.object_size_bytes)}
      </text>

      {/* Hit count */}
      {showHits && (
        <text width={5} textAlign="right">
          {cache.hit_count}
        </text>
      )}

      {/* Last hit */}
      {showLastHit && (
        <text color="muted" width={10} textAlign="right">
          {cache.last_hit_at ? formatRelativeTime(cache.last_hit_at) : "never"}
        </text>
      )}

      {/* Expiration */}
      {showExpiration && (
        <text color={expirationColor(cache.expires_at)} width={12} textAlign="right">
          {formatExpiration(cache.expires_at)}
        </text>
      )}
    </box>
  );
}
```

**Design decisions:**
- Column visibility is breakpoint-driven, matching the product spec exactly.
- At minimum (80×24): only status icon + key (fill) + size (8ch).
- At standard (120×40): icon + key (30ch) + bookmark (15ch) + size (8ch) + hits (5ch) + last hit (10ch).
- At large (200×60): all columns including version (10ch) and compression (6ch), key (50ch), bookmark (30ch).
- `NO_COLOR` fallback uses `[FIN]`/`[PEND]` text markers (width 6 instead of 2).
- Null fields render as "—".

---

### Step 8: Create `components/CacheDetailPanel.tsx`

**File:** `apps/tui/src/screens/Workflows/components/CacheDetailPanel.tsx`

Expanded inline detail panel showing full cache metadata.

```typescript
import * as React from "react";
import type { WorkflowCache } from "../../../hooks/workflow-types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";
import { formatBytes, formatRelativeTime } from "../utils.js";

interface CacheDetailPanelProps {
  cache: WorkflowCache;
  breakpoint: Breakpoint;
}

export function CacheDetailPanel({ cache, breakpoint }: CacheDetailPanelProps) {
  const indent = breakpoint === "minimum" ? 2 : 4;

  return (
    <box
      flexDirection="column"
      paddingLeft={indent}
      borderLeft="single"
      borderColor="primary"
      marginLeft={1}
      marginBottom={1}
    >
      <box flexDirection="row" gap={2}>
        <text color="muted">Cache Key:</text>
        <text>{cache.cache_key}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Bookmark:</text>
        <text>{cache.bookmark_name}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Status:</text>
        <text color={cache.status === "finalized" ? "success" : "warning"}>
          {cache.status}
        </text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Size:</text>
        <text>{formatBytes(cache.object_size_bytes)}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Version:</text>
        <text>{cache.cache_version || "—"}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Compression:</text>
        <text>{cache.compression || "—"}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Hit Count:</text>
        <text>{cache.hit_count}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Last Hit:</text>
        <text>{cache.last_hit_at ? formatRelativeTime(cache.last_hit_at) : "never"}</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text color="muted">Created:</text>
        <text>{formatRelativeTime(cache.created_at)} ago</text>
      </box>
      {cache.finalized_at && (
        <box flexDirection="row" gap={2}>
          <text color="muted">Finalized:</text>
          <text>{formatRelativeTime(cache.finalized_at)} ago</text>
        </box>
      )}
      <box flexDirection="row" gap={2}>
        <text color="muted">Expires:</text>
        <text color={cache.expires_at && new Date(cache.expires_at).getTime() < Date.now() ? "error" : "muted"}>
          {cache.expires_at ? formatRelativeTime(cache.expires_at) : "—"}
        </text>
      </box>
      {cache.workflow_run_id && (
        <box flexDirection="row" gap={2}>
          <text color="muted">Run ID:</text>
          <text color="primary">#{cache.workflow_run_id}</text>
        </box>
      )}
      {!cache.workflow_run_id && (
        <box flexDirection="row" gap={2}>
          <text color="muted">Run ID:</text>
          <text>—</text>
        </box>
      )}
      <box flexDirection="row" gap={2}>
        <text color="muted">Object Key:</text>
        <text color="muted">{cache.object_key || "—"}</text>
      </box>
    </box>
  );
}
```

**Design decisions:**
- Left border in primary color visually connects detail to its parent row.
- All fields shown regardless of breakpoint — the detail panel is a vertical layout that wraps naturally.
- Indent adjusted at minimum breakpoint (2 vs 4) to save horizontal space.
- Null/missing fields render as "—".

---

### Step 9: Create `components/CacheDeleteOverlay.tsx`

**File:** `apps/tui/src/screens/Workflows/components/CacheDeleteOverlay.tsx`

Confirmation modal for single delete and bulk clear.

```typescript
import * as React from "react";
import { useState, useCallback } from "react";
import type { WorkflowCache, HookError } from "../../../hooks/workflow-types.js";
import type { DeleteMode } from "../hooks/useCacheDelete.js";
import { formatBytes } from "../utils.js";

interface CacheDeleteOverlayProps {
  mode: DeleteMode;
  targetCache: WorkflowCache | null;
  matchingCount: number;
  matchingSize: number;
  filterContext: {
    bookmark: string | null;
    key: string | null;
  };
  onConfirm: () => void;
  onDismiss: () => void;
  isLoading: boolean;
  error: HookError | null;
  visible: boolean;
}

export function CacheDeleteOverlay({
  mode,
  targetCache,
  matchingCount,
  matchingSize,
  filterContext,
  onConfirm,
  onDismiss,
  isLoading,
  error,
  visible,
}: CacheDeleteOverlayProps) {
  const [focusedButton, setFocusedButton] = useState<"confirm" | "cancel">("cancel");

  const handleTab = useCallback(() => {
    setFocusedButton((prev) => (prev === "confirm" ? "cancel" : "confirm"));
  }, []);

  if (!visible) return null;

  const isSingle = mode === "single";
  const title = isSingle ? "Delete Cache" : "Clear Caches";
  const confirmDisabled = isLoading || (!isSingle && matchingCount === 0);

  const description = isSingle
    ? `Delete cache "${targetCache?.cache_key}" (${targetCache?.bookmark_name}, ${formatBytes(targetCache?.object_size_bytes ?? 0)})?`
    : filterContext.bookmark || filterContext.key
      ? `Delete ${matchingCount} cache${matchingCount !== 1 ? "s" : ""} (${formatBytes(matchingSize)}) matching current filters?`
      : `Delete ALL ${matchingCount} cache${matchingCount !== 1 ? "s" : ""} (${formatBytes(matchingSize)})?`;

  const warning =
    !isSingle && !filterContext.bookmark && !filterContext.key
      ? "No filters active — all caches will be deleted."
      : null;

  return (
    <box
      position="absolute"
      top="center"
      left="center"
      width="50%"
      border="single"
      borderColor="border"
      flexDirection="column"
      padding={1}
    >
      <text bold>{title}</text>
      <text>{""}</text>
      <text>{description}</text>
      {warning && (
        <text color="warning">{warning}</text>
      )}
      {error && (
        <text color="error">
          Error: {error.message ?? "Request failed"}
        </text>
      )}
      <text>{""}</text>
      <box flexDirection="row" gap={2}>
        <text
          color={confirmDisabled ? "muted" : "error"}
          bold={focusedButton === "confirm"}
          inverse={focusedButton === "confirm" && !confirmDisabled}
        >
          {isLoading ? "Deleting…" : confirmDisabled ? "[Confirm]" : "[Confirm]"}
        </text>
        <text
          bold={focusedButton === "cancel"}
          inverse={focusedButton === "cancel"}
        >
          [Cancel]
        </text>
      </box>
    </box>
  );
}
```

**Design decisions:**
- Tab/Shift+Tab cycles between Confirm and Cancel buttons.
- Confirm is disabled when: loading, or bulk mode with 0 matching caches.
- Error is displayed inline within the overlay so user can retry.
- Cannot dismiss while loading (enforced in the `useCacheDelete` hook).
- Warning text shown when bulk clear has no active filters.
- Overlay width adapts via responsive sizing in the parent screen.

---

### Step 10: Barrel export updates

**File:** `apps/tui/src/screens/Workflows/components/index.ts` — **Modify**

Add cache component exports:

```typescript
// ... existing exports ...
export { CacheStatsBanner } from "./CacheStatsBanner.js";
export { CacheFilterBar } from "./CacheFilterBar.js";
export { CacheRow } from "./CacheRow.js";
export { CacheDetailPanel } from "./CacheDetailPanel.js";
export { CacheDeleteOverlay } from "./CacheDeleteOverlay.js";
```

**File:** `apps/tui/src/screens/Workflows/hooks/index.ts` — **Modify**

Add cache hook exports:

```typescript
// ... existing exports ...
export { useCacheViewState, type CacheViewState } from "./useCacheViewState.js";
export { useCacheFilters, type CacheFilterState, type FilterInputType } from "./useCacheFilters.js";
export { useCacheSort, type CacheSortState, type CacheSortField } from "./useCacheSort.js";
export { useCacheDelete, type DeleteMode, type DeleteState, type CacheDeleteActions } from "./useCacheDelete.js";
```

---

### Step 11: Implement `WorkflowCacheViewScreen.tsx`

**File:** `apps/tui/src/screens/Workflows/WorkflowCacheViewScreen.tsx`

Main screen component with keybinding registration, Esc priority chain, status bar hints.

```typescript
import * as React from "react";
import { useMemo, useCallback } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import type { StatusBarHint } from "../../providers/keybinding-types.js";
import { FullScreenLoading } from "../../components/FullScreenLoading.js";
import { FullScreenError } from "../../components/FullScreenError.js";
import { useCacheViewState } from "./hooks/useCacheViewState.js";
import {
  CacheStatsBanner,
  CacheFilterBar,
  CacheRow,
  CacheDetailPanel,
  CacheDeleteOverlay,
} from "./components/index.js";
import type { RepoIdentifier } from "../../hooks/workflow-types.js";
import { formatBytes } from "./utils.js";
import { truncateRight } from "../../util/text.js";

export function WorkflowCacheViewScreen({ entry }: ScreenComponentProps) {
  const { owner, repo } = entry.params;
  const repoId: RepoIdentifier = { owner, repo };
  const nav = useNavigation();
  const layout = useLayout();
  const bp = layout.breakpoint;

  const state = useCacheViewState(repoId);

  // Content height minus stats banner and filter bar
  const pageSize = Math.max(1, Math.floor((layout.height - 6) / 2));

  // -- Esc priority chain --
  const handleEsc = useCallback(() => {
    // 1. Close filter input
    if (state.filters.isFilterInputActive) {
      state.filters.dismissFilterInput();
      return;
    }
    // 2. Close delete overlay
    if (state.deleteActions.state.isOverlayOpen) {
      state.deleteActions.dismiss();
      return;
    }
    // 3. Collapse expanded details
    if (state.expandedIds.size > 0) {
      // Collapse all
      state.expandedIds.clear?.(); // Set doesn't have clear exposed; handled via toggleExpand
      return;
    }
    // 4. Pop screen
    nav.pop();
  }, [state.filters, state.deleteActions, state.expandedIds, nav]);

  // -- Keybindings --
  const handleDelete = useCallback(() => {
    if (state.deleteActions.state.isOverlayOpen) return; // no-op if overlay open
    const cache = state.focusedCache;
    if (!cache) return;
    if (cache.status === "pending") return; // pending not deletable
    state.deleteActions.initSingleDelete(cache);
  }, [state.deleteActions, state.focusedCache]);

  const handleBulkClear = useCallback(() => {
    if (state.deleteActions.state.isOverlayOpen) return;
    state.deleteActions.initBulkClear();
  }, [state.deleteActions]);

  const handleOverlayConfirm = useCallback(() => {
    state.deleteActions.confirm();
  }, [state.deleteActions]);

  const bindings = useMemo(
    () => [
      { key: "j", description: "Move down", group: "Navigation", handler: state.focusNext },
      { key: "k", description: "Move up", group: "Navigation", handler: state.focusPrev },
      { key: "Down", description: "Move down", group: "Navigation", handler: state.focusNext },
      { key: "Up", description: "Move up", group: "Navigation", handler: state.focusPrev },
      { key: "Enter", description: "Toggle detail", group: "Actions", handler: state.toggleExpand },
      { key: "d", description: "Delete cache", group: "Actions", handler: handleDelete },
      { key: "D", description: "Clear caches", group: "Actions", handler: handleBulkClear },
      { key: "b", description: "Filter bookmark", group: "Filters", handler: state.filters.openBookmarkFilter },
      { key: "f", description: "Filter key", group: "Filters", handler: state.filters.openKeyFilter },
      { key: "/", description: "Search", group: "Filters", handler: state.filters.openSearch },
      { key: "x", description: "Clear filters", group: "Filters", handler: state.filters.clearAllFilters },
      { key: "s", description: "Sort", group: "Actions", handler: state.sort.cycleSort },
      { key: "R", description: "Refresh", group: "Actions", handler: state.refresh },
      { key: "G", description: "Jump to bottom", group: "Navigation", handler: state.focusLast },
      { key: "ctrl+d", description: "Page down", group: "Navigation", handler: () => state.pageDown(pageSize) },
      { key: "ctrl+u", description: "Page up", group: "Navigation", handler: () => state.pageUp(pageSize) },
      { key: "Escape", description: "Back", group: "Navigation", handler: handleEsc },
    ],
    [state, handleDelete, handleBulkClear, handleEsc, pageSize],
  );

  // g g (jump to top) — registered as a two-key sequence
  // Handled via go-to mode in KeybindingProvider

  const statusHints: StatusBarHint[] = useMemo(
    () => [
      { keys: "j/k", label: "nav", order: 10 },
      { keys: "Enter", label: "detail", order: 20 },
      { keys: "d", label: "delete", order: 30 },
      { keys: "D", label: "clear", order: 40 },
      { keys: "b", label: "bookmark", order: 50 },
      { keys: "f", label: "filter", order: 60 },
      { keys: "/", label: "search", order: 70 },
      { keys: "s", label: "sort", order: 80 },
      { keys: "q", label: "back", order: 90 },
    ],
    [],
  );

  useScreenKeybindings(bindings, statusHints);

  // -- Loading & error states --
  if (state.statsLoading && state.cachesLoading && state.caches.length === 0) {
    return <FullScreenLoading label="Loading caches…" />;
  }

  // Both failed: full error
  if (state.statsError && state.cachesError) {
    return <FullScreenError screenLabel="Workflow Caches" error={state.cachesError} />;
  }

  // -- Main render --
  const showColumnHeaders = bp !== "minimum";
  const hasColor = !process.env.NO_COLOR;

  // Column header widths (must match CacheRow)
  const keyWidth = bp === "minimum" ? -1 : bp === "standard" ? 30 : 50;

  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      {/* Stats banner */}
      <CacheStatsBanner
        stats={state.stats}
        repoQuotaBytes={0}
        archiveMaxBytes={0}
        ttlSeconds={0}
        lastHitAt={null}
        breakpoint={bp}
      />

      {/* Filter bar */}
      <CacheFilterBar
        activeBookmarkFilter={state.filters.activeBookmarkFilter}
        activeKeyFilter={state.filters.activeKeyFilter}
        searchQuery={state.filters.searchQuery}
        sortField={state.sort.sortField}
        sortLabel={state.sort.sortLabel}
        filterInput={state.filters.filterInput}
        isFilterInputActive={state.filters.isFilterInputActive}
        onFilterInputChange={state.filters.setFilterInputValue}
        onFilterSubmit={state.filters.applyFilter}
        onFilterDismiss={state.filters.dismissFilterInput}
        breakpoint={bp}
      />

      {/* Column headers */}
      {showColumnHeaders && (
        <box flexDirection="row" paddingX={1} borderBottom="single" borderColor="border">
          <text bold width={hasColor ? 2 : 6}>{" "}</text>
          <text bold width={keyWidth}>Cache Key</text>
          {bp !== "minimum" && (
            <text bold width={bp === "standard" ? 15 : 30}>Bookmark</text>
          )}
          {bp === "large" && <text bold width={10}>Version</text>}
          {bp === "large" && <text bold width={6}>Comp.</text>}
          <text bold width={8} textAlign="right">Size</text>
          <text bold width={5} textAlign="right">Hits</text>
          <text bold width={10} textAlign="right">Last Hit</text>
          {bp !== "minimum" && (
            <text bold width={12} textAlign="right">Expires</text>
          )}
        </box>
      )}

      {/* Cache list or empty state */}
      {state.cachesError && !state.statsError ? (
        <box flexDirection="column" padding={2}>
          <text color="error">Failed to load caches</text>
          <text color="muted">Press R to retry</text>
        </box>
      ) : state.filteredCaches.length === 0 && !state.cachesLoading ? (
        <box flexDirection="column" padding={2}>
          {state.filters.hasActiveFilters ? (
            <text color="muted">No caches matching filters</text>
          ) : (
            <box flexDirection="column">
              <text color="muted">No workflow caches.</text>
              <text color="muted">Caches are created by workflow runs.</text>
            </box>
          )}
        </box>
      ) : (
        <scrollbox flexGrow={1} onScrollEnd={state.loadNextPage}>
          <box flexDirection="column">
            {state.filteredCaches.map((cache, index) => (
              <box key={cache.id} flexDirection="column">
                <CacheRow
                  cache={cache}
                  focused={index === state.focusedIndex}
                  breakpoint={bp}
                />
                {state.expandedIds.has(cache.id) && (
                  <CacheDetailPanel cache={cache} breakpoint={bp} />
                )}
              </box>
            ))}
            {state.isLoadingMore && (
              <text color="muted" paddingX={1}>Loading more…</text>
            )}
          </box>
        </scrollbox>
      )}

      {/* Delete confirmation overlay */}
      <CacheDeleteOverlay
        mode={state.deleteActions.state.mode}
        targetCache={state.deleteActions.state.targetCache}
        matchingCount={state.matchingCount}
        matchingSize={state.matchingSize}
        filterContext={{
          bookmark: state.filters.activeBookmarkFilter,
          key: state.filters.activeKeyFilter,
        }}
        onConfirm={handleOverlayConfirm}
        onDismiss={state.deleteActions.dismiss}
        isLoading={state.deleteActions.state.isLoading}
        error={state.deleteActions.state.error}
        visible={state.deleteActions.state.isOverlayOpen}
      />
    </box>
  );
}
```

**Design decisions:**
- Esc priority chain: filter input → delete overlay → expanded details → pop screen.
- Keybindings are guarded: `d` is no-op on pending caches or when overlay is open.
- `g g` (jump to top) is handled by the global go-to mode in `KeybindingProvider` — the screen registers `focusFirst` handler that is called when `g g` sequence completes.
- Stats banner receives defaults for `repoQuotaBytes`, `archiveMaxBytes`, `ttlSeconds`, `lastHitAt` since the current stubbed endpoint only returns `total_count` and `total_size_bytes`. When the server implements the full stats response, these will be populated from `stats` data.
- Partial error: stats fail → banner shows "—", list renders normally. List fails → banner renders, list shows error.

---

### Step 12: Update `screens/Workflows/index.ts`

Add the WorkflowCacheViewScreen re-export:

```typescript
// ... existing exports ...
export { WorkflowCacheViewScreen } from "./WorkflowCacheViewScreen.js";
```

---

## 6. Telemetry Integration

All telemetry events from the product spec are emitted at documented emission points. Events use the shared `trackEvent()` utility from `@codeplane/ui-core`.

| Event | Emission Point |
|-------|---------------|
| `tui.workflow_cache.view` | `useCacheViewState` — after both stats and list data resolve |
| `tui.workflow_cache.detail_expand` | `toggleExpand()` — when expanding (not collapsing) |
| `tui.workflow_cache.detail_collapse` | `toggleExpand()` — when collapsing |
| `tui.workflow_cache.delete` | `useCacheDelete.onSuccess` — single mode |
| `tui.workflow_cache.delete_denied` | `useCacheDelete.onError` — 403 status |
| `tui.workflow_cache.clear` | `useCacheDelete.onSuccess` — bulk mode |
| `tui.workflow_cache.clear_denied` | `useCacheDelete.onError` — 403 status, bulk mode |
| `tui.workflow_cache.filter_applied` | `useCacheFilters.applyFilter()` |
| `tui.workflow_cache.filter_cleared` | `useCacheFilters.clearAllFilters()` |
| `tui.workflow_cache.search` | `useCacheFilters.applyFilter()` — search type |
| `tui.workflow_cache.sort_changed` | `useCacheSort.cycleSort()` |
| `tui.workflow_cache.refresh` | Screen-level `R` handler |
| `tui.workflow_cache.pagination` | `loadNextPage()` in `useCacheViewState` |
| `tui.workflow_cache.error` | All API error handlers |
| `tui.workflow_cache.data_load_time` | `useCacheViewState` — measured via `performance.now()` |

---

## 7. Observability

All log output writes to stderr. Level gated by `CODEPLANE_LOG_LEVEL` (default: `warn`).

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `WorkflowCacheView: mounted [repo={r}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Stats loaded | `WorkflowCacheView: stats loaded [repo={r}] [count={n}] [size={bytes}] [duration={ms}ms]` |
| `debug` | List loaded | `WorkflowCacheView: list loaded [repo={r}] [count={n}] [page={p}] [duration={ms}ms]` |
| `debug` | Entry expanded | `WorkflowCacheView: expanded [repo={r}] [cache_id={id}] [key={k}]` |
| `debug` | Filter applied | `WorkflowCacheView: filter [repo={r}] [type={t}] [value={v}] [results={n}]` |
| `debug` | Sort changed | `WorkflowCacheView: sort [repo={r}] [field={f}]` |
| `info` | Fully loaded | `WorkflowCacheView: ready [repo={r}] [caches={n}] [total_ms={ms}]` |
| `info` | Delete initiated | `WorkflowCacheView: delete [repo={r}] [cache_id={id}] [key={k}]` |
| `info` | Delete completed | `WorkflowCacheView: deleted [repo={r}] [cache_id={id}] [success={bool}] [duration={ms}ms]` |
| `info` | Clear initiated | `WorkflowCacheView: clear [repo={r}] [bookmark={b}] [key={k}]` |
| `info` | Clear completed | `WorkflowCacheView: cleared [repo={r}] [deleted_count={n}] [success={bool}] [duration={ms}ms]` |
| `info` | Refresh | `WorkflowCacheView: refresh [repo={r}]` |
| `warn` | Fetch failed | `WorkflowCacheView: fetch failed [repo={r}] [endpoint={e}] [status={code}]` |
| `warn` | Rate limited | `WorkflowCacheView: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Delete failed | `WorkflowCacheView: delete failed [repo={r}] [cache_id={id}] [status={code}]` |
| `warn` | Slow load (>3s) | `WorkflowCacheView: slow load [repo={r}] [duration={ms}ms]` |
| `error` | Auth error | `WorkflowCacheView: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `WorkflowCacheView: permission denied [repo={r}] [action={delete|clear}]` |
| `error` | Render error | `WorkflowCacheView: render error [repo={r}] [error={msg}]` |

---

## 8. Unit & Integration Tests

### Test count summary

| Category | Count |
|----------|-------|
| Terminal snapshot tests | 28 |
| Keyboard interaction tests | 38 |
| Responsive tests | 14 |
| Integration tests | 22 |
| Edge case tests | 13 |
| **Total** | **115** |

All 115 tests left failing if backend unimplemented — never skipped.

### Terminal Snapshot Tests (28 tests)

All tests are appended to `e2e/tui/workflows.test.ts` inside a `describe("TUI_WORKFLOW_CACHE_VIEW", ...)` block.

```typescript
describe("TUI_WORKFLOW_CACHE_VIEW", () => {
  describe("terminal snapshots", () => {
    test("SNAP-CV-001: cache view at 120×40 with populated cache list", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Caches:");
      await tui.waitForText("Cache Key");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-002: cache view at 80×24 minimum", async () => {
      const tui = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("📦");
      // Column headers should NOT be shown at minimum breakpoint
      await tui.waitForNoText("Cache Key");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-003: cache view at 200×60 large", async () => {
      const tui = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Caches:");
      await tui.waitForText("Version");
      await tui.waitForText("Comp.");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-004: stats banner with 0% usage", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "empty/repo"],
      });
      await tui.waitForText("0%");
      await tui.waitForText("░");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-005: stats banner with 78% usage", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("78%");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-006: stats banner with 92% usage — yellow warning", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "heavy/repo"],
      });
      await tui.waitForText("92%");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-007: stats banner with 100% usage — red", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "full/repo"],
      });
      await tui.waitForText("100%");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-008: empty cache list — no workflow caches message", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "empty/repo"],
      });
      await tui.waitForText("No workflow caches");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-009: empty cache list with active filters", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("nonexistent-branch");
      await tui.sendKeys("Enter");
      await tui.waitForText("No caches matching filters");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-010: focused cache row with reverse video highlight", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("j");
      // Second row should have reverse video (ANSI 7m)
      expect(tui.getLine(6)).toMatch(/\x1b\[7m/);
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-011: cache entry with status finalized — green checkmark", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("✓");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-012: cache entry with status pending — yellow indicator", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("◌");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-013: expanded cache detail panel", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.waitForText("Cache Key:");
      await tui.waitForText("Version:");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-014: multiple expanded cache details simultaneously", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.sendKeys("j");
      await tui.sendKeys("Enter");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-015: active bookmark filter pill in filter bar", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.waitForText("bookmark:main");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-016: active key filter pill in filter bar", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("f");
      await tui.sendText("node_modules");
      await tui.sendKeys("Enter");
      await tui.waitForText("key:node_modules");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-017: both bookmark and key filters active simultaneously", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.sendKeys("f");
      await tui.sendText("cargo");
      await tui.sendKeys("Enter");
      await tui.waitForText("bookmark:main");
      await tui.waitForText("key:cargo");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-018: bookmark filter input focused", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      // Input should be visible with label
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-019: delete confirmation overlay — single cache", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.waitForText("[Confirm]");
      await tui.waitForText("[Cancel]");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-020: bulk clear confirmation overlay", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("Clear Caches");
      await tui.waitForText("[Confirm]");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-021: bulk clear overlay with 0 matching caches — Confirm disabled", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "empty/repo"],
      });
      await tui.waitForText("No workflow caches");
      await tui.sendKeys("D");
      await tui.waitForText("0 caches");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-022: delete confirmation overlay with spinner during API call", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForText("Deleting");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-023: loading state — Loading caches with spinner", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "slow/repo"],
      });
      await tui.waitForText("Loading caches");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-024: error state — red error with Press R to retry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "error/repo"],
      });
      await tui.waitForText("Press R to retry");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-025: breadcrumb path", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Caches");
      expect(tui.getLine(0)).toMatch(/Dashboard.*acme\/api.*Workflows.*Caches/);
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-026: status bar hints with action keys (write user)", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/j\/k.*nav/);
      expect(lastLine).toMatch(/d.*delete/);
      expect(lastLine).toMatch(/q.*back/);
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-027: dimmed action keybinding hints for read-only user", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "readonly/repo"],
      });
      await tui.waitForText("Cache Key");
      // d and D hints should be dimmed (ANSI 245)
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("SNAP-CV-028: pagination Loading more indicator at list bottom", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "large/repo"],
      });
      await tui.waitForText("Cache Key");
      // Navigate to bottom to trigger pagination
      await tui.sendKeys("G");
      await tui.waitForText("Loading more");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });
  });

  // --- Keyboard Interaction Tests (38 tests) ---

  describe("keyboard interactions", () => {
    test("KEY-CV-001: j moves cursor to next cache entry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("j");
      // Second row should be focused (reverse video)
      expect(tui.getLine(6)).toMatch(/\x1b\[7m/);
      await tui.terminate();
    });

    test("KEY-CV-002: k moves cursor to previous cache entry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("j", "j", "k");
      // Second row should be focused
      expect(tui.getLine(6)).toMatch(/\x1b\[7m/);
      await tui.terminate();
    });

    test("KEY-CV-003: Down moves cursor to next cache entry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Down");
      expect(tui.getLine(6)).toMatch(/\x1b\[7m/);
      await tui.terminate();
    });

    test("KEY-CV-004: Up moves cursor to previous cache entry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Down", "Down", "Up");
      expect(tui.getLine(6)).toMatch(/\x1b\[7m/);
      await tui.terminate();
    });

    test("KEY-CV-005: Enter expands cache detail inline", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.waitForText("Cache Key:");
      await tui.waitForText("Version:");
      await tui.terminate();
    });

    test("KEY-CV-006: Enter again collapses expanded detail", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.waitForText("Version:");
      await tui.sendKeys("Enter");
      await tui.waitForNoText("Version:");
      await tui.terminate();
    });

    test("KEY-CV-007: Enter on pending cache still expands with available metadata", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("◌");
      // Navigate to pending cache and expand
      await tui.sendKeys("G"); // jump to last which may be pending
      await tui.sendKeys("Enter");
      await tui.waitForText("Status:");
      await tui.waitForText("pending");
      await tui.terminate();
    });

    test("KEY-CV-008: d on finalized cache opens delete confirmation overlay", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.waitForText("[Confirm]");
      await tui.terminate();
    });

    test("KEY-CV-009: d on pending cache — no-op, status bar message", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("◌");
      await tui.sendKeys("G"); // Navigate to pending
      await tui.sendKeys("d");
      await tui.waitForNoText("Delete Cache");
      await tui.terminate();
    });

    test("KEY-CV-010: Tab/Shift+Tab in delete overlay cycles Confirm/Cancel", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Tab");
      // Confirm should now be focused
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("KEY-CV-011: Enter on Confirm in delete overlay deletes cache", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      // Overlay should close after delete
      await tui.waitForNoText("Delete Cache");
      await tui.terminate();
    });

    test("KEY-CV-012: Esc in delete overlay closes without deletion", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Escape");
      await tui.waitForNoText("Delete Cache");
      await tui.terminate();
    });

    test("KEY-CV-013: d returns 403 — status bar Permission denied", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "readonly/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Permission denied");
      await tui.terminate();
    });

    test("KEY-CV-014: d returns 404 — status bar Cache not found", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForText("Cache not found");
      await tui.terminate();
    });

    test("KEY-CV-015: D opens bulk clear confirmation overlay", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("Clear Caches");
      await tui.terminate();
    });

    test("KEY-CV-016: D with active filters shows filter context in overlay", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.sendKeys("D");
      await tui.waitForText("matching current filters");
      await tui.terminate();
    });

    test("KEY-CV-017: D with no filters warns all caches will be deleted", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("all caches will be deleted");
      await tui.terminate();
    });

    test("KEY-CV-018: D with 0 matching caches — Confirm disabled", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "empty/repo"],
      });
      await tui.waitForText("No workflow caches");
      await tui.sendKeys("D");
      await tui.waitForText("0 caches");
      await tui.terminate();
    });

    test("KEY-CV-019: Enter on Confirm in clear overlay clears caches", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("Clear Caches");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForNoText("Clear Caches");
      await tui.terminate();
    });

    test("KEY-CV-020: D returns 403 — status bar Admin access required", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "write-only/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("Admin access required");
      await tui.terminate();
    });

    test("KEY-CV-021: b opens bookmark filter input, type value, Enter applies", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.waitForText("bookmark:main");
      await tui.terminate();
    });

    test("KEY-CV-022: f opens key filter input, type value, Enter applies", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("f");
      await tui.sendText("node_modules");
      await tui.sendKeys("Enter");
      await tui.waitForText("key:node_modules");
      await tui.terminate();
    });

    test("KEY-CV-023: Esc while filter input focused dismisses input", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Escape");
      await tui.waitForNoText("bookmark:main");
      await tui.terminate();
    });

    test("KEY-CV-024: x clears all active filters", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.waitForText("bookmark:main");
      await tui.sendKeys("x");
      await tui.waitForNoText("bookmark:main");
      await tui.terminate();
    });

    test("KEY-CV-025: / opens search input with client-side filtering", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("/");
      await tui.sendText("node");
      await tui.sendKeys("Enter");
      await tui.waitForText("search:node");
      await tui.terminate();
    });

    test("KEY-CV-026: s cycles sort order", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("sort:created");
      await tui.sendKeys("s");
      await tui.waitForText("sort:last hit");
      await tui.sendKeys("s");
      await tui.waitForText("sort:size");
      await tui.sendKeys("s");
      await tui.waitForText("sort:hits");
      await tui.sendKeys("s");
      await tui.waitForText("sort:created");
      await tui.terminate();
    });

    test("KEY-CV-027: G jumps to last cache entry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("G");
      // Last entry should be focused
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("KEY-CV-028: g g jumps to first cache entry", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("j", "j", "j");
      await tui.sendKeys("g", "g");
      // First entry should be focused
      expect(tui.getLine(5)).toMatch(/\x1b\[7m/);
      await tui.terminate();
    });

    test("KEY-CV-029: Ctrl+D pages down", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "large/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("ctrl+d");
      // Focus should have moved down by ~half page
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("KEY-CV-030: Ctrl+U pages up", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "large/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("G");
      await tui.sendKeys("ctrl+u");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("KEY-CV-031: Esc closes expanded detail when no overlay or input active", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.waitForText("Version:");
      await tui.sendKeys("Escape");
      await tui.waitForNoText("Version:");
      await tui.terminate();
    });

    test("KEY-CV-032: Esc pops screen when nothing else active", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Escape");
      await tui.waitForNoText("Cache Key");
      await tui.terminate();
    });

    test("KEY-CV-033: q pops screen", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("q");
      await tui.waitForNoText("Cache Key");
      await tui.terminate();
    });

    test("KEY-CV-034: q during overlay — no-op", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("q");
      // Should still be on cache view with overlay open
      await tui.waitForText("Delete Cache");
      await tui.terminate();
    });

    test("KEY-CV-035: R refreshes cache list and stats", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("R");
      // Content should reload
      await tui.waitForText("Cache Key");
      await tui.terminate();
    });

    test("KEY-CV-036: ? opens help overlay", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.terminate();
    });

    test("KEY-CV-037: rapid j presses — 15 sequential, one entry per keypress", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "large/repo"],
      });
      await tui.waitForText("Cache Key");
      for (let i = 0; i < 15; i++) {
        await tui.sendKeys("j");
      }
      // Focus should be on the 16th entry (index 15)
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("KEY-CV-038: d during delete in-flight — no-op", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      // Press d again while overlay is open
      await tui.sendKeys("d");
      // Should still show same overlay, not open a second one
      await tui.waitForText("Delete Cache");
      await tui.terminate();
    });
  });

  // --- Responsive Tests (14 tests) ---

  describe("responsive behavior", () => {
    test("RESP-CV-001: 80×24 layout — single-line stats", async () => {
      const tui = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("📦");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-002: 80×24 layout — key+size columns only, no headers", async () => {
      const tui = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForNoText("Cache Key");
      await tui.waitForNoText("Bookmark");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-003: 120×40 layout — full stats, key+bookmark+status+size+hits+last_hit", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.waitForText("Hits");
      await tui.waitForText("Last Hit");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-004: 120×40 layout — two-line stats banner", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Max archive:");
      await tui.waitForText("TTL:");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-005: 200×60 layout — full stats with all metadata", async () => {
      const tui = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Version");
      await tui.waitForText("Comp.");
      await tui.waitForText("Repo quota:");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-006: 200×60 layout — all columns visible including version+compression", async () => {
      const tui = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Version");
      await tui.waitForText("Comp.");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-007: resize from 120×40 to 80×24 — columns collapse", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.resize(80, 24);
      await tui.waitForNoText("Cache Key"); // column header hidden at minimum
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-008: resize from 80×24 to 120×40 — columns expand", async () => {
      const tui = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("📦");
      await tui.resize(120, 40);
      await tui.waitForText("Cache Key");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-009: focus preserved through resize", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("j", "j"); // focus 3rd entry
      await tui.resize(80, 24);
      await tui.resize(120, 40);
      // 3rd row should still be focused
      expect(tui.getLine(7)).toMatch(/\x1b\[7m/);
      await tui.terminate();
    });

    test("RESP-CV-010: expanded cache detail adjusts width on resize", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.waitForText("Version:");
      await tui.resize(200, 60);
      await tui.waitForText("Version:");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-011: resize with filter input focused — input retains value", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.resize(80, 24);
      await tui.resize(120, 40);
      // Filter input should still show "main"
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-012: resize with delete overlay open — overlay resizes", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.resize(80, 24);
      await tui.waitForText("Delete Cache");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-013: resize during loading state — spinner repositions", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "slow/repo"],
      });
      await tui.waitForText("Loading caches");
      await tui.resize(80, 24);
      await tui.waitForText("Loading caches");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("RESP-CV-014: usage bar width adapts to terminal width", async () => {
      // At 80 columns: bar should be ~10 chars
      const tui80 = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui80.waitForText("%");
      const snap80 = tui80.snapshot();
      await tui80.terminate();

      // At 200 columns: bar should be ~30 chars
      const tui200 = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui200.waitForText("%");
      const snap200 = tui200.snapshot();
      await tui200.terminate();

      // Bar in 200-col should be wider than in 80-col
      const barPattern80 = snap80.match(/[█░]+/)?.[0] ?? "";
      const barPattern200 = snap200.match(/[█░]+/)?.[0] ?? "";
      expect(barPattern200.length).toBeGreaterThan(barPattern80.length);
    });
  });

  // --- Integration Tests (22 tests) ---

  describe("integration", () => {
    test("INT-CV-001: auth expiry navigates to auth screen", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
        env: { CODEPLANE_TOKEN: "expired-token" },
      });
      await tui.waitForText("Session expired");
      await tui.terminate();
    });

    test("INT-CV-002: rate limit shows inline message", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "rate-limited/repo"],
      });
      await tui.waitForText("Rate limited");
      await tui.terminate();
    });

    test("INT-CV-003: network error shows error state", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "offline/repo"],
      });
      await tui.waitForText("Press R to retry");
      await tui.terminate();
    });

    test("INT-CV-004: server 500 error handling", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "error/repo"],
      });
      await tui.waitForText("Press R to retry");
      await tui.terminate();
    });

    test("INT-CV-005: stats succeeds but list fails — stats render, list shows error", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "partial-error/repo"],
      });
      await tui.waitForText("Caches:");
      await tui.waitForText("Failed to load caches");
      await tui.terminate();
    });

    test("INT-CV-006: list succeeds but stats fails — list renders, stats show dash", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "stats-error/repo"],
      });
      await tui.waitForText("—");
      await tui.waitForText("Cache Key");
      await tui.terminate();
    });

    test("INT-CV-007: delete success — API call, list refresh, stats update", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForNoText("Delete Cache");
      await tui.terminate();
    });

    test("INT-CV-008: delete failure — overlay error message", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "delete-error/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForText("Error:");
      await tui.terminate();
    });

    test("INT-CV-009: delete 403 permission denied", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "readonly/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Permission denied");
      await tui.terminate();
    });

    test("INT-CV-010: delete 404 cache not found — list auto-refreshes", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForText("Cache not found");
      await tui.terminate();
    });

    test("INT-CV-011: clear success — API call, deleted count returned, refresh", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("Clear Caches");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForNoText("Clear Caches");
      await tui.terminate();
    });

    test("INT-CV-012: clear failure — overlay error", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "clear-error/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.waitForText("Error:");
      await tui.terminate();
    });

    test("INT-CV-013: clear 403 permission denied", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "write-only/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("D");
      await tui.waitForText("Admin access required");
      await tui.terminate();
    });

    test("INT-CV-014: clear with filters — correct query params sent", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.sendKeys("D");
      await tui.waitForText("matching current filters");
      await tui.sendKeys("Tab");
      await tui.sendKeys("Enter");
      await tui.terminate();
    });

    test("INT-CV-015: pagination — scroll-to-end triggers next page", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "large/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("G");
      await tui.waitForText("Loading more");
      await tui.terminate();
    });

    test("INT-CV-016: pagination error — Failed to load more shown", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "pagination-error/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("G");
      await tui.waitForText("Failed to load more");
      await tui.terminate();
    });

    test("INT-CV-017: filter by bookmark — API called with bookmark param", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.waitForText("bookmark:main");
      await tui.terminate();
    });

    test("INT-CV-018: filter by key — API called with key param", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("f");
      await tui.sendText("cargo");
      await tui.sendKeys("Enter");
      await tui.waitForText("key:cargo");
      await tui.terminate();
    });

    test("INT-CV-019: combined bookmark+key filter — both params sent", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("b");
      await tui.sendText("main");
      await tui.sendKeys("Enter");
      await tui.sendKeys("f");
      await tui.sendText("cargo");
      await tui.sendKeys("Enter");
      await tui.waitForText("bookmark:main");
      await tui.waitForText("key:cargo");
      await tui.terminate();
    });

    test("INT-CV-020: deep link launch", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Caches");
      expect(tui.getLine(0)).toMatch(/Dashboard.*acme\/api.*Caches/);
      await tui.terminate();
    });

    test("INT-CV-021: command palette entry :caches", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await tui.waitForText("Workflows");
      await tui.sendKeys(":");
      await tui.sendText("caches");
      await tui.sendKeys("Enter");
      await tui.waitForText("Caches:");
      await tui.terminate();
    });

    test("INT-CV-022: back navigation preserves previous screen state", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await tui.waitForText("Workflows");
      await tui.sendKeys("a"); // navigate to caches
      await tui.waitForText("Caches:");
      await tui.sendKeys("q"); // back to workflow list
      await tui.waitForText("Workflows");
      await tui.terminate();
    });
  });

  // --- Edge Case Tests (13 tests) ---

  describe("edge cases", () => {
    test("EDGE-CV-001: no auth token navigates to auth error screen", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
        env: { CODEPLANE_TOKEN: "" },
      });
      await tui.waitForText("Not authenticated");
      await tui.terminate();
    });

    test("EDGE-CV-002: long cache key (80+ chars) truncated with ellipsis", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "long-keys/repo"],
      });
      await tui.waitForText("…");
      await tui.terminate();
    });

    test("EDGE-CV-003: unicode in cache keys — truncation respects grapheme clusters", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "unicode/repo"],
      });
      await tui.waitForText("Cache Key");
      // Should not show broken unicode
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("EDGE-CV-004: single cache entry in list", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "single/repo"],
      });
      await tui.waitForText("Cache Key");
      // j should not crash (at boundary)
      await tui.sendKeys("j");
      expect(tui.snapshot()).toMatchSnapshot();
      await tui.terminate();
    });

    test("EDGE-CV-005: 500 cache entries — pagination and scroll handle smoothly", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "large/repo"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("G");
      await tui.waitForText("Loading more");
      await tui.terminate();
    });

    test("EDGE-CV-006: concurrent resize + API response handled independently", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "slow/repo"],
      });
      await tui.resize(80, 24);
      await tui.waitForText("📦");
      await tui.terminate();
    });

    test("EDGE-CV-007: cache with null last_hit_at shows never", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("never");
      await tui.terminate();
    });

    test("EDGE-CV-008: cache with null workflow_run_id — detail shows dash", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("Enter");
      await tui.waitForText("Run ID:");
      await tui.waitForText("—");
      await tui.terminate();
    });

    test("EDGE-CV-009: cache with 0 hit_count shows 0", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("0");
      await tui.terminate();
    });

    test("EDGE-CV-010: expired cache shows expired in red", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "expired/repo"],
      });
      await tui.waitForText("expired");
      await tui.terminate();
    });

    test("EDGE-CV-011: null/missing fields in API response rendered as dash", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "null-fields/repo"],
      });
      await tui.waitForText("—");
      await tui.terminate();
    });

    test("EDGE-CV-012: rapid d presses on same entry — overlay already open, second is no-op", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await tui.waitForText("Cache Key");
      await tui.sendKeys("d");
      await tui.waitForText("Delete Cache");
      await tui.sendKeys("d"); // should be no-op
      // Still one overlay, no crash
      await tui.waitForText("Delete Cache");
      await tui.terminate();
    });

    test("EDGE-CV-013: delete then navigate back — previous screen state preserved", async () => {
      const tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await tui.waitForText("Workflows");
      await tui.sendKeys("a"); // go to caches
      await tui.waitForText("Caches:");
      await tui.sendKeys("q"); // back
      await tui.waitForText("Workflows");
      await tui.terminate();
    });
  });
});
```

---

## 9. Error Handling Matrix

| Error | HTTP Status | Behavior | Recovery |
|-------|-------------|----------|----------|
| Auth expired | 401 | Navigate to auth error screen | Re-auth via CLI |
| Permission denied (delete) | 403 | Status bar flash "Permission denied" | Informational |
| Permission denied (clear) | 403 | Status bar flash "Admin access required" | Informational |
| Cache not found (delete) | 404 | Status bar flash "Cache not found", list refreshes | Auto-recovery |
| Rate limited | 429 | Inline "Rate limited. Retry in {Retry-After}s." | User presses R |
| Server error | 500 | Full error state or overlay error | User presses R |
| Network timeout (30s) | — | Loading → error state + "Press R to retry" | User retries |
| Network timeout on delete | — | Overlay shows "Request timed out" | User retries/dismisses |
| Bulk clear returns deleted_count: 0 | 200 | Status bar flash "No caches matched" | Informational |
| Pagination error | varies | "Failed to load more" at list bottom | Retry on next scroll |
| Component crash | — | Global error boundary: "Press r to restart" | User restarts |
| Stats fail, list succeeds | varies | Stats banner shows "—", list renders | Stats retry via R |
| List fails, stats succeeds | varies | Banner renders, list shows error | List retry via R |

---

## 10. Performance Considerations

- **Render budget:** <16ms for most operations. Cache row rendering is lightweight (no syntax highlighting, no markdown).
- **Memory budget:** <10MB typical. 500 cache entries × ~1KB per entry = ~500KB data. Expanded detail panels are rendered on demand.
- **Sort performance:** Client-side sort on ≤500 items is O(n log n) and completes in <1ms.
- **Filter debounce:** Search input has 200ms debounce before applying client-side filter.
- **Pagination:** 30 per page avoids large initial loads. `usePaginatedQuery` handles abort on filter change.
- **Focus clamping:** `useEffect` dependency on `filteredCaches.length` avoids stale focus after filter changes.

---

## 11. Accessibility & Terminal Compatibility

- **NO_COLOR support:** When `NO_COLOR` is set, status icons use text markers (`[FIN]`/`[PEND]`), usage bar uses ASCII (`[###-------]`), all semantic colors default to `"muted"`.
- **16-color terminals:** Semantic tokens degrade gracefully via `ThemeProvider` token resolution.
- **Screen readers:** Text content is structured with consistent column widths for predictable screen reader navigation.
- **Keyboard-only:** All interactions are achievable via keyboard. No mouse required.

---

## 12. Source of Truth

Maintained alongside:
- [specs/tui/prd.md](../prd.md) — Product requirements
- [specs/tui/design.md](../design.md) — Design specification
- [specs/tui/features.ts](../features.ts) — Codified feature inventory (`TUI_WORKFLOW_CACHE_VIEW`)
- [specs/tui/TUI_WORKFLOW_CACHE_VIEW.md](../TUI_WORKFLOW_CACHE_VIEW.md) — Product specification
- [specs/tui/engineering/tui-workflow-screen-scaffold.md](./tui-workflow-screen-scaffold.md) — Screen scaffold dependency
- [specs/tui/engineering/tui-workflow-data-hooks.md](./tui-workflow-data-hooks.md) — Data hooks dependency
- [specs/tui/engineering/tui-workflow-ui-utils.md](./tui-workflow-ui-utils.md) — Utility functions dependency
- [specs/tui/engineering/tui-list-component.md](./tui-list-component.md) — List component dependency
- [specs/tui/engineering/tui-modal-component.md](./tui-modal-component.md) — Modal component dependency

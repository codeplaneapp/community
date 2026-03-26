# Implementation Plan: `tui-workflow-cache-view`

This plan details the implementation of the workflow cache management screen for the Codeplane TUI. Based on current workspace research, several foundational files expected by the spec are currently missing, so this plan incorporates the necessary scaffolding for data hooks and types alongside the screen implementation.

## Phase 1: Foundation & Shared Hooks Scaffold

Since the `Workflows/` directory and shared hooks do not yet exist, we must create them first to ensure the screen compiles.

1. **Create Directories**
   - Run `mkdir -p apps/tui/src/screens/Workflows/components`
   - Run `mkdir -p apps/tui/src/screens/Workflows/hooks`
   - Run `mkdir -p apps/tui/src/hooks`

2. **Create Workflow Types (`apps/tui/src/hooks/workflow-types.ts`)**
   - Define `WorkflowCache`, `WorkflowCacheStats`, `WorkflowCacheFilters`, `RepoIdentifier`.
   - Define `PaginatedQueryResult`, `QueryResult`, `MutationResult`, `HookError`.

3. **Create Shared Utility Functions (`apps/tui/src/screens/Workflows/utils.ts`)**
   - Implement `formatBytes(bytes: number): string` to format cache sizes (e.g., KB, MB, GB).
   - Implement `formatRelativeTime(dateString: string): string` to format timestamps (e.g., "2h ago").

4. **Create Shared Data Hooks**
   - **`apps/tui/src/hooks/useWorkflowCaches.ts`**: Implement `useWorkflowCaches(repo, filters)` and `useWorkflowCacheStats(repo)`. (Stub API calls if `@codeplane/ui-core` integration is pending).
   - **`apps/tui/src/hooks/useWorkflowActions.ts`**: Implement `useDeleteWorkflowCache(repo)`.

## Phase 2: Screen State Hooks

Implement the local state management hooks inside `apps/tui/src/screens/Workflows/hooks/`.

1. **Create `useCacheSort.ts`**
   - Define `CacheSortField` type and `SORT_CYCLE` array (`created`, `last_hit`, `size`, `hits`).
   - Implement `useCacheSort` hook returning `sortField`, `sortLabel`, and `cycleSort` function.

2. **Create `useCacheFilters.ts`**
   - Manage state for `bookmarkFilter`, `keyFilter`, `searchQuery`, and `filterInput`.
   - Expose methods to open inputs (`openBookmarkFilter`, `openKeyFilter`, `openSearch`), update values, apply, and clear filters.
   - Create `toAPIFilters()` mapper.

3. **Create `useCacheDelete.ts`**
   - Manage `DeleteState` (`mode: 'single' | 'bulk'`, `targetCache`, overlay visibility, loading/error states).
   - Consume `useDeleteWorkflowCache` and expose `initSingleDelete`, `initBulkClear`, `confirm`, and `dismiss`.

4. **Create Orchestrator `useCacheViewState.ts`**
   - Compose `useCacheSort`, `useCacheFilters`, `useCacheDelete`, `useWorkflowCaches`, and `useWorkflowCacheStats`.
   - Implement client-side filtering (search query) and client-side sorting.
   - Manage `focusedIndex` and `expandedIds`.
   - Expose navigation methods (`focusNext`, `focusPrev`, `pageDown`, `pageUp`, `toggleExpand`).

5. **Create Barrel Export (`apps/tui/src/screens/Workflows/hooks/index.ts`)**
   - Export all state hooks and associated types.

## Phase 3: UI Components

Implement presentational components in `apps/tui/src/screens/Workflows/components/`.

1. **Create `CacheStatsBanner.tsx`**
   - Consume layout `breakpoint` to render responsive statistics.
   - Render a usage bar calculation based on `usedBytes` and `quota`, conditionally stripping colors if `NO_COLOR` is active.

2. **Create `CacheFilterBar.tsx`**
   - Render active filter pills (`bookmark:main`, `key:node_modules`).
   - Render the OpenTUI `<input>` component conditionally when `isFilterInputActive` is true.
   - Display the current sort indicator.

3. **Create `CacheRow.tsx`**
   - Use `<box>` layout with `truncateRight` to render the status icon, cache key, size, and hits.
   - Conditionally hide columns (bookmark, version, hits) based on `breakpoint`.
   - Apply reverse video formatting when the row is `focused`.

4. **Create `CacheDetailPanel.tsx`**
   - Render full metadata details vertically with a primary-colored left border to indicate row association.

5. **Create `CacheDeleteOverlay.tsx`**
   - Render an absolute positioned `<box>` (center, center) for delete confirmation.
   - Handle specific messaging for `single` vs. `bulk` delete, including matching counts.
   - Implement focus toggle between "Confirm" and "Cancel" using local state.

6. **Create Barrel Export (`apps/tui/src/screens/Workflows/components/index.ts`)**
   - Export all presentation components.

## Phase 4: Screen Integration

Bring the orchestrator and components together.

1. **Implement `WorkflowCacheViewScreen.tsx`**
   - Location: `apps/tui/src/screens/Workflows/WorkflowCacheViewScreen.tsx`
   - Setup `useLayout`, `useNavigation`, and `useCacheViewState`.
   - Implement the `Esc` priority chain (dismiss filter -> close overlay -> collapse details -> pop navigation).
   - Define `bindings` array mapping keys (`j`, `k`, `d`, `D`, `b`, `f`, `/`, `Enter`, etc.) to state actions.
   - Define `statusHints` and register them via `useScreenKeybindings`.
   - Handle Loading / Error States via `FullScreenLoading` and `FullScreenError`.
   - Construct the main view wrapping components in a flex layout, placing the list inside an OpenTUI `<scrollbox>`.

2. **Export Screen (`apps/tui/src/screens/Workflows/index.ts`)**
   - Export the screen component for consumption by the TUI router.

## Phase 5: Testing

Add end-to-end tests for the new screen.

1. **Create `e2e/tui/workflows.test.ts`**
   - Setup `@microsoft/tui-test` runner harness.
   - Add all 115 test specifications documented in the spec covering Snapshots, Keyboard Interactions, Responsive Layout adjustments, Integration states, and Edge cases.

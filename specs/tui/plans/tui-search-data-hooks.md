# Implementation Plan: TUI Search Data Hooks Adapter

This document outlines the step-by-step implementation plan for the `tui-search-data-hooks` ticket. It introduces the `useSearchTabs` hook to manage the state and data orchestration for the TUI's global search functionality across four parallel API endpoints (repositories, issues, users, and code).

## Step 1: Create Type Definitions

**File:** `apps/tui/src/hooks/useSearchTabs.types.ts`

1. Import the `HookError` type from `@codeplane/ui-core`.
2. Define the tab identifiers (`SEARCH_TAB_IDS`, `SearchTabId`).
3. Define the specific result interfaces for each search domain:
   - `RepositorySearchResult`
   - `IssueSearchResult`
   - `UserSearchResult`
   - `CodeSearchResult`
4. Create a union type `SearchResultItem` combining the domain types.
5. Define the API response envelope `SearchResultPage<T>`.
6. Define the per-tab state interface `TabState<T>` (tracks `items`, `totalCount`, `currentPage`, `isLoading`, `error`, `hasMore`, `scrollPosition`, `focusedIndex`).
7. Define the configuration options `UseSearchTabsConfig` (`debounceMs`, `perPage`, `maxItemsPerTab`, `minQueryLength`).
8. Define the return interface `UseSearchTabsReturn` exposing state arrays, mutation methods, pagination methods, and derived states.

## Step 2: Implement the `useSearchTabs` Hook

**File:** `apps/tui/src/hooks/useSearchTabs.ts`

1. **Imports:**
   - React hooks: `useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`.
   - API utilities: `useAPIClient` and `parseResponseError` from `@codeplane/ui-core`.
   - Types from `./useSearchTabs.types.js`.
2. **Internal Utilities:**
   - Implement `useDebouncedValue<T>(value: T, delayMs: number): T` internal hook.
   - Define `TAB_DEFINITIONS` and a `createInitialTabState` factory function to ensure clean state initialization.
3. **Core Hook Initialization:**
   - Initialize `useAPIClient()`.
   - Set up standard configuration defaults (e.g., `debounceMs = 300`, `maxItemsPerTab = 300`).
   - Initialize React state for `query` (raw), `activeTabIndex`, and the four-element `tabs` array.
   - Create refs for `abortControllersRef`, `isMounted`, and `lastDispatchedQuery`.
4. **Query Dispatch Effect (`useEffect`):**
   - Trigger on changes to the `debouncedQuery`.
   - Trim the query; apply `minQueryLength` guard. Reset tabs if too short.
   - Abort all in-flight requests in `abortControllersRef.current`.
   - Reset the 4 tabs to their `isLoading: true` states (clearing items and errors).
   - Create 4 new `AbortController` instances.
   - Dispatch 4 parallel HTTP `GET` requests to `/api/search/{domain}` utilizing `Promise.allSettled()`.
   - Parse responses (handling `X-Total-Count` headers for accurate counts).
   - Upon settlement, independently update each tab in the state array with results or properly formatted `HookError`s. Ignore `AbortError`s entirely.
   - Implement auto-selection logic: if the current active tab yielded 0 results but another yielded results, switch focus to the first successful tab.
5. **Pagination & Retry Logic:**
   - Implement `fetchMore`: Abort only the active tab's controller, request `currentPage + 1`, and safely append items up to `maxItemsPerTab` limit.
   - Implement `retryTab(tabIndex)`: Abort the target tab's controller, reset its state to `isLoading`, and dispatch a page 1 request for that specific endpoint.
6. **State Mutators:**
   - Implement `setActiveTab`, `setScrollPosition`, `setFocusedIndex`, `setQuery`, and `clearSearch` ensuring immutable state updates on the `tabs` array.
7. **Cleanup:**
   - Return a cleanup function from the main initialization `useEffect` to set `isMounted.current = false` and abort all controllers on unmount.

## Step 3: Export the Hook

**File:** `apps/tui/src/hooks/index.ts`

1. Export the hook and its relevant types to make it accessible to the upcoming `SearchScreen` component.
   ```typescript
   export { useSearchTabs } from "./useSearchTabs.js";
   export type { 
     UseSearchTabsReturn, 
     TabState, 
     SearchTabId, 
     SearchResultItem 
   } from "./useSearchTabs.types.js";
   ```

## Step 4: End-to-End Tests

**File:** `e2e/tui/search.test.ts`

1. **Imports:** Import `describe`, `test`, `expect` from `bun:test` and `launchTUI` from `./helpers.js`.
2. **Setup:** Create a test suite block `describe("TUI_SEARCH search data hooks", () => { ... })`.
3. **Query Dispatch Tests:**
   - `HOOK-SEARCH-001`: Typing shows "Searching" after debounce.
   - `HOOK-SEARCH-002`: Search results populate count badges.
   - `HOOK-SEARCH-003`: Empty query does not trigger search.
   - `HOOK-SEARCH-004`: Whitespace-only query does not trigger search.
   - `HOOK-SEARCH-005`: Single character triggers search.
   - `HOOK-SEARCH-006`: All four tabs update independently.
4. **Tab Switching Tests:**
   - `KEY-SEARCH-001`: `Tab` cycles through tabs.
   - `KEY-SEARCH-002`: Number keys `1-4` jump to specific tabs.
5. **State Preservation Tests:**
   - `HOOK-SEARCH-007`: Switching away and back preserves state (scroll position/focus).
6. **Abort / Debounce Tests:**
   - `HOOK-SEARCH-008`: Rapid typing avoids intermediate network fetches.
7. **Error Handling Tests:**
   - `HOOK-SEARCH-009`: Partial failure isolates error to specific tab.
   - `HOOK-SEARCH-010`: `R` retries a failed tab.
8. **Pagination & Navigation Tests:**
   - `HOOK-SEARCH-011`: Scroll-to-bottom fetches next page.
   - `HOOK-SEARCH-012`: `Enter` navigates to detail.
   - `HOOK-SEARCH-013`: `q` back from detail retains search state.
9. **Reset & Edge Cases Tests:**
   - `KEY-SEARCH-003`: `Ctrl+u` clears all.
   - `HOOK-SEARCH-014`: Zero results explicitly handle empty state.
   - `SNAP-SEARCH-001` to `SNAP-SEARCH-004`: Validate UI responsive behavior at `80x24`, `120x40`, and `200x60` sizes.
   - `EDGE-SEARCH-001` to `003`: Resize state resilience and `/` / `Escape` focus management.

## Step 5: Version Control & Polish

1. **Branching:** Create a new jj bookmark for this work: `jj bookmark c tui-search-data-hooks`.
2. **Type Checking:** Run the workspace `tsc` or `bun run typecheck` to verify no type conflicts exist in the newly written hook and its types.
3. **Format & Lint:** Run `bun run lint` / `prettier` across `apps/tui/src/hooks/` to ensure structural alignment with workspace conventions.
4. **Test Run:** Execute `bun test e2e/tui/search.test.ts`. Expect failures related to backend UI endpoints not yet implemented, but verify the tests accurately compile and launch the TUI test harness without generic script errors.
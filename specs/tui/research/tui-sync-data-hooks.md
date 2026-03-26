# Codebase Context: TUI Sync Data Hooks (`tui-sync-data-hooks`)

This document provides an overview of the existing patterns, file locations, and structural context needed to implement the sync data hooks as requested in the engineering specification.

## 1. API Client and Fetching Patterns

The specification mentions `@codeplane/ui-core`, but the `APIClient` context is currently implemented locally within the TUI app.

*   **Provider Location:** `apps/tui/src/providers/APIClientProvider.tsx`
    *   Exports `useAPIClient()` which returns an object containing `{ baseUrl, token }`.
*   **Fetch Wrapper Reference:** `apps/tui/src/hooks/useRepoFetch.ts`
    *   This file provides an excellent reference implementation for authenticated data fetching.
    *   It exports a `useRepoFetch()` hook that constructs an authenticated `get(path, options)` function using the `baseUrl` and `token` from `useAPIClient()`.
    *   It also exports a `FetchError` class to carry HTTP status codes and a `toLoadingError(err)` helper function. The `toLoadingError` utility specifically intercepts `401 Unauthorized` and `429 Too Many Requests` status codes to translate them into TUI-compatible `LoadingError` types (used in error boundaries/status bars).
    *   *Implementation Note:* For mutation hooks (`useSyncForce`, `useConflictResolve`, `useConflictRetry`), you can either build a parallel `post` method inside `useRepoFetch.ts` or implement standalone `fetch` calls utilizing `useAPIClient()`.

## 2. SSE Provider Context

The specification requires extracting the SSE connection state via `useSSEConnectionState`.

*   **Provider Location:** `apps/tui/src/providers/SSEProvider.tsx`
*   **Current State:** The `SSEProvider` and `useSSE` hook are currently implemented as rudimentary stubs (e.g., `useSSE` returns `null` and the context holds `null`).
*   *Implementation Note:* To fulfill the `useSSEConnectionState` requirement, you will need to either update `SSEProvider.tsx` to actually track the connection state (`"connecting"`, `"connected"`, etc.) and provide it via the React context, or create a mock implementation in `apps/tui/src/hooks/useSSEConnectionState.ts` that safely returns `{ connected: false, reconnecting: false, backoffMs: 0 }` until the underlying SSE infrastructure is finalized.

## 3. Pagination and Mutation Patterns

*   **Pagination:** 
    *   **Reference:** `apps/tui/src/hooks/usePaginationLoading.ts`
    *   This file outlines how cursor-based pagination state is handled in the TUI, including tracking `isInFlightRef`, handling `hasMore`, and guarding against duplicate `loadMore` triggers.
    *   **Missing Type:** A global `PaginatedResult` type does not exist in the codebase. You will need to define a local interface (e.g., `export interface PaginatedResult<T> { items: T[]; cursor: string | null; hasMore: boolean; totalCount: number; }`) when building `useSyncConflicts`.
*   **Mutations:**
    *   **Reference:** `apps/tui/src/hooks/useOptimisticMutation.ts`
    *   This hook tracks `isLoadingRef` and interacts with a global `useLoading()` state (from `apps/tui/src/hooks/useLoading.ts`).
    *   For `useConflictResolve` and `useConflictRetry`, using a `Set<string>` wrapped in a React `useState` (e.g., `const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())`) is the ideal approach for item-level loading guards, as specified in the PRD.

## 4. Error Boundary

*   **Location:** `apps/tui/src/components/ErrorBoundary.tsx`
*   The ticket dictates that 401 Unauthorized errors should propagate to the global auth error boundary. The existing `ErrorBoundary` acts as the top-level catch for the TUI app. By throwing unhandled or formatted `FetchError(401)` errors out of the polling intervals, the `ErrorBoundary` will intercept and render the appropriate "Session expired" prompt.

## 5. Missing Data Models

A comprehensive search of the `apps/tui` and `packages/sdk` directories confirms that types like `DaemonStatus` and `SyncQueueItem` are not yet defined. 

*   *Implementation Note:* You will need to declare the TypeScript interfaces for the API responses directly in the hook files (e.g., inside `useDaemonStatus.ts` and `useSyncConflicts.ts`).
    *   `DaemonStatus`: Needs fields like `pid`, `uptime`, `sync_status`, `pending_count`, `conflict_count`, `last_sync_at`, `remote_url`.
    *   `SyncQueueItem`: Needs fields relevant to conflicts (e.g., `id`, `type`, `status`, `message`).

## Summary of Target File Paths to Create

Based on the engineering spec, all files will be placed in the TUI hooks directory:
1.  `apps/tui/src/hooks/useSSEConnectionState.ts`
2.  `apps/tui/src/hooks/useDaemonStatus.ts`
3.  `apps/tui/src/hooks/useSyncConflicts.ts`
4.  `apps/tui/src/hooks/useSyncForce.ts`
5.  `apps/tui/src/hooks/useConflictResolve.ts`
6.  `apps/tui/src/hooks/useConflictRetry.ts`
7.  `apps/tui/src/hooks/useSyncState.ts`

**Testing:**
The E2E tests for these hooks will reside in `e2e/tui/sync.test.ts` as dictated by the existing TUI testing architecture.
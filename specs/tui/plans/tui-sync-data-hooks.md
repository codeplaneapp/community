# Implementation Plan: TUI Sync Data Hooks

This document provides a step-by-step implementation plan for the `tui-sync-data-hooks` ticket. It defines the creation of seven React hooks to manage daemon synchronization state, conflicts, and server-sent events (SSE) connection status, along with the corresponding E2E tests.

## Step 1: Implement `useSSEConnectionState`

**File:** `apps/tui/src/hooks/useSSEConnectionState.ts`

1.  **Create the hook:** Since `SSEProvider` is currently stubbed, create a hook that returns a safe default state but is structured to read from a context eventually.
2.  **Define Return Type:** 
    ```typescript
    export interface SSEConnectionState {
      connected: boolean;
      reconnecting: boolean;
      backoffMs: number;
    }
    ```
3.  **Implementation:** 
    ```typescript
    import { useState, useEffect } from 'react';
    // Import SSEContext when available from apps/tui/src/providers/SSEProvider

    export function useSSEConnectionState(): SSEConnectionState {
      // TODO: Read from SSEContext once fully implemented
      // For now, return a stubbed disconnected state
      return { connected: false, reconnecting: false, backoffMs: 0 };
    }
    ```

## Step 2: Implement `useDaemonStatus`

**File:** `apps/tui/src/hooks/useDaemonStatus.ts`

1.  **Define Interfaces:**
    ```typescript
    export interface DaemonStatus {
      pid: number;
      uptime: number;
      sync_status: 'idle' | 'syncing' | 'error';
      pending_count: number;
      conflict_count: number;
      last_sync_at: string | null;
      remote_url: string;
    }
    ```
2.  **Implement Polling:**
    - Use `useAPIClient` from `apps/tui/src/providers/APIClientProvider`.
    - Maintain `data`, `error`, and `isLoading` state.
    - Create a `fetchStatus` function that calls `GET /api/daemon/status`.
    - Use a `useEffect` to set up a `setInterval` that calls `fetchStatus` every 3000ms.
    - Throw on `401 Unauthorized` to trigger the `ErrorBoundary`.
    - Return `{ data, error, isLoading, refetch: fetchStatus }`.

## Step 3: Implement `useSyncConflicts`

**File:** `apps/tui/src/hooks/useSyncConflicts.ts`

1.  **Define Interfaces:**
    ```typescript
    export interface SyncQueueItem {
      id: string;
      type: string;
      status: string;
      message?: string;
    }
    export interface PaginatedResult<T> {
      items: T[];
      cursor: string | null;
      hasMore: boolean;
      totalCount: number;
    }
    ```
2.  **Implement Pagination & Polling:**
    - Use `useAPIClient`.
    - Maintain state: `items`, `cursor`, `hasMore`, `totalCount`, `isLoading`, `error`.
    - Create a `fetchInitial` function (called on mount and every 3000ms via `setInterval` if cursor hasn't moved).
    - Create a `fetchMore` function that passes the current `cursor` to `GET /api/daemon/conflicts?cursor={cursor}`.
    - Append to `items` on `fetchMore`.
    - Return `{ items, cursor, hasMore, totalCount, isLoading, error, fetchMore }`.

## Step 4: Implement `useSyncForce`

**File:** `apps/tui/src/hooks/useSyncForce.ts`

1.  **Implement Hook:**
    - State: `isSyncing` (boolean), `error` (Error | null).
    - Action `trigger`: 
      - Guard against concurrent calls if `isSyncing` is true.
      - Create `const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 30000);`
      - Call `POST /api/daemon/sync` passing `controller.signal`.
      - Clear timeout and reset `isSyncing` in `finally` block.
    - Return `{ trigger, isSyncing, error }`.

## Step 5: Implement `useConflictResolve`

**File:** `apps/tui/src/hooks/useConflictResolve.ts`

1.  **Implement Hook:**
    - State: `const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());`
    - Action `resolve(id: string, resolutionData: any)`:
      - Update state: `setResolvingIds(prev => new Set(prev).add(id))`.
      - Call `POST /api/daemon/conflicts/${id}/resolve`.
      - Remove `id` from set in `finally` block.
    - Helper `isResolving = useCallback((id: string) => resolvingIds.has(id), [resolvingIds])`.
    - Return `{ resolve, isResolving, error }`.

## Step 6: Implement `useConflictRetry`

**File:** `apps/tui/src/hooks/useConflictRetry.ts`

1.  **Implement Hook:**
    - State: `const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());`
    - Action `retry(id: string)`:
      - Update state: `setRetryingIds(prev => new Set(prev).add(id))`.
      - Call `POST /api/daemon/conflicts/${id}/retry`.
      - Remove `id` from set in `finally` block.
    - Helper `isRetrying = useCallback((id: string) => retryingIds.has(id), [retryingIds])`.
    - Return `{ retry, isRetrying, error }`.

## Step 7: Implement `useSyncState`

**File:** `apps/tui/src/hooks/useSyncState.ts`

1.  **Implement Derived Hook:**
    - Import `useDaemonStatus` and `useSSEConnectionState`.
    - Call both hooks to get `daemon` and `sse` states.
    - Compute derived status string:
      ```typescript
      let status: 'online' | 'syncing' | 'error_conflicts' | 'error_no_conflicts' | 'offline' = 'online';
      if (!sse.connected && daemon.error) status = 'offline';
      else if (daemon.data?.sync_status === 'syncing') status = 'syncing';
      else if ((daemon.data?.conflict_count ?? 0) > 0) status = 'error_conflicts';
      ```
    - Return `{ status, pendingCount: daemon.data?.pending_count || 0, conflictCount: daemon.data?.conflict_count || 0, lastSyncAt: daemon.data?.last_sync_at || null, error: daemon.error }`.

## Step 8: Write E2E Tests

**File:** `e2e/tui/sync.test.ts`

1.  **Setup Test File:** Use `@microsoft/tui-test` to write integration tests for the new sync functionality.
2.  **Add Test Cases:**
    - **`useDaemonStatus` Polling:** Render a dummy component that uses the hook. Assert initial API call. Advance timers by 3000ms. Assert second API call.
    - **`useSyncConflicts` Pagination:** Render list component using the hook. Assert items match fixture length. Call `fetchMore()`. Assert `cursor` parameter is passed in subsequent request.
    - **`useSyncForce` Timeout & Guard:** Call `trigger()`. Assert `isSyncing` becomes true. Assert rapid consecutive calls don't fire multiple API requests. Simulate 30s delay and assert timeout error handling.
    - **`useConflictResolve` & `useConflictRetry` Guards:** Call `resolve("conflict-1")`. Assert `isResolving("conflict-1")` is true. Call `resolve("conflict-2")` simultaneously. Assert both are true independently.
    - **`useSyncState` Derived Logic:** Mock `useDaemonStatus` and `useSSEConnectionState` returns. Assert derived status returns `'online'`, `'error_conflicts'`, and `'offline'` under correct conditions.

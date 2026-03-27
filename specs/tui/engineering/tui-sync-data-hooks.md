# Engineering Specification: TUI Sync Data Hooks

**Ticket:** tui-sync-data-hooks
**Title:** Sync data hooks: useDaemonStatus, useSyncConflicts, useSyncForce, useConflictResolve, useConflictRetry, useSyncState, useSSEConnectionState
**Type:** Engineering
**Description:** Create TUI-side hook adapters for all daemon sync API endpoints. These hooks wrap the `@codeplane/ui-core` data layer for sync state and conflict management, bringing real-time daemon status and synchronization controls into the TUI.

---

## 1. Scope

This specification covers the implementation of seven React hooks required to interface with the Codeplane daemon's synchronization API from the TUI. These hooks handle polling, cursor-based pagination, mutation guarding, and derived state aggregation for the UI layer.

### Features Included
- **`useDaemonStatus()`**: Polls daemon status every 3 seconds, exposing active sync state and metadata.
- **`useSyncConflicts()`**: Paginated, polling-based hook for retrieving sync conflicts.
- **`useSyncForce()`**: Mutation hook to trigger manual sync operations with timeouts.
- **`useConflictResolve()` & `useConflictRetry()`**: Mutation hooks for managing individual conflicts with per-item loading states.
- **`useSSEConnectionState()`**: Bridge hook to expose the underlying SSE connection state.
- **`useSyncState()`**: A facade/derived hook combining daemon status and SSE state for easy UI consumption (e.g., in the Status Bar).

---

## 2. Architecture & Design

### API Client Integration
All HTTP requests will be executed using the shared API client provided by `@codeplane/ui-core`. We assume the existence of a `useAPIClient()` hook (or similar context access) that provides a configured fetch wrapper with authentication headers. 

### Polling Mechanism
The `useDaemonStatus` and `useSyncConflicts` hooks require 3-second polling.
- **Lifecycle:** Polling is initiated via `useEffect` on mount and paused (cleared) on unmount. 
- **Visibility:** If a global `useIsFocused` or screen visibility context exists, it should gate the polling interval to save resources when the screen is obscured. Otherwise, we rely on component mount/unmount.
- **Mutation Re-fetch:** All mutation hooks (`useSyncForce`, `useConflictResolve`, `useConflictRetry`) will trigger immediate invalidation/re-fetches by exposing or calling a shared cache invalidator or accepting an `onSuccess` callback.

### Error Handling
- **401 Unauthorized:** Allowed to propagate up to trigger the global auth error boundary.
- **404 Not Found:** Handled gracefully (e.g., daemon offline or endpoint unavailable).
- **429 Too Many Requests:** Surfaced via the `error` property to display rate limit warnings.
- **Network Errors:** Caught and surfaced via the `error` state.

### State Management
- React `useState` and `useCallback` will be used to manage local loading states and guards.
- Mutation guards (e.g., `isResolving(id)`) will utilize `Set<string>` stored in React state to track in-flight requests per item.

---

## 3. Implementation Plan

### Step 1: `useSSEConnectionState`
**File:** `apps/tui/src/hooks/useSSEConnectionState.ts`
- Extract the SSE context provided by `SSEProvider` (assumed to be available in `@codeplane/ui-core` or local context).
- **Return Type:** `{ connected: boolean, reconnecting: boolean, backoffMs: number }`
- **Implementation:** Simply map the `connectionState` string (`"connecting" | "connected" | "reconnecting" | "disconnected"`) to the boolean flags.

### Step 2: `useDaemonStatus`
**File:** `apps/tui/src/hooks/useDaemonStatus.ts`
- **Inputs:** None (uses API context).
- **State:** `data`, `error`, `isLoading`.
- **Effect:** Sets up a `setInterval` for 3000ms. Calls `GET /api/daemon/status`.
- **Return:** `{ pid, uptime, sync_status, pending_count, conflict_count, last_sync_at, remote_url, error, isLoading, refetch: () => Promise<void> }`
- **Behavior:** On 401, throw to ErrorBoundary. Catch other errors and set local `error` state.

### Step 3: `useSyncConflicts`
**File:** `apps/tui/src/hooks/useSyncConflicts.ts`
- **Inputs:** None (uses API context).
- **State:** `items`, `cursor`, `hasMore`, `totalCount`, `isLoading`, `error`.
- **Effect:** Polling interval (3000ms) to fetch the latest cursor page. 
- **Endpoint:** `GET /api/daemon/conflicts`
- **Pagination:** Handles up to 200 items per fetch. Appends to `items` on `fetchMore()`.
- **Return:** `PaginatedResult<SyncQueueItem>` matching the `@codeplane/ui-core` pattern.

### Step 4: `useSyncForce`
**File:** `apps/tui/src/hooks/useSyncForce.ts`
- **State:** `isSyncing` (boolean), `error` (Error | null).
- **Action:** `trigger = async () => { ... }`
- **Implementation:**
  - Prevent execution if `isSyncing` is true.
  - Create an `AbortController` with a 30,000ms timeout.
  - Call `POST /api/daemon/sync` passing the abort signal.
  - On success, optionally trigger a global refetch of `useDaemonStatus`.
- **Return:** `{ trigger, isSyncing, result, error }`

### Step 5: `useConflictResolve`
**File:** `apps/tui/src/hooks/useConflictResolve.ts`
- **State:** `resolvingIds` (Set of strings), `error` (Error | null).
- **Action:** `resolve = async (id: string, resolutionData: any) => { ... }`
- **Implementation:**
  - Add `id` to `resolvingIds`.
  - Call `POST /api/daemon/conflicts/:id/resolve`.
  - Remove `id` from `resolvingIds` on `finally`.
- **Return:** `{ resolve, isResolving: (id: string) => boolean, error }`

### Step 6: `useConflictRetry`
**File:** `apps/tui/src/hooks/useConflictRetry.ts`
- **State:** `retryingIds` (Set of strings), `error` (Error | null).
- **Action:** `retry = async (id: string) => { ... }`
- **Implementation:**
  - Add `id` to `retryingIds`.
  - Call `POST /api/daemon/conflicts/:id/retry`.
  - Remove `id` on `finally`.
- **Return:** `{ retry, isRetrying: (id: string) => boolean, error }`

### Step 7: `useSyncState`
**File:** `apps/tui/src/hooks/useSyncState.ts`
- **Dependencies:** Imports and calls `useDaemonStatus()` and `useSSEConnectionState()`.
- **Logic:**
  - Derives a unified `status` enum: `"online" | "syncing" | "error_conflicts" | "error_no_conflicts" | "offline"`.
  - If `sse.connected` is false and daemon fails to respond: `"offline"`.
  - If `daemon.sync_status === 'syncing'`: `"syncing"`.
  - If `daemon.conflict_count > 0`: `"error_conflicts"`.
  - Else: `"online"`.
- **Return:** `{ status, pendingCount: daemon.pending_count, conflictCount: daemon.conflict_count, lastSyncAt: daemon.last_sync_at, error: daemon.error }`

---

## 4. Unit & Integration Tests

All tests should be placed in the TUI E2E test suite to verify the hooks behave correctly when consumed by components, adhering to the project's testing philosophy (no mocking of internal implementations, test against real/fixture APIs).

**File:** `e2e/tui/sync.test.ts` (or equivalent hook test file if unit testing hooks directly via `@testing-library/react-hooks` or a custom test wrapper).

### Test Cases

1. **`useDaemonStatus` Polling & Lifecycle**
   - **Test:** Mount a dummy component using `useDaemonStatus`. Verify it makes the initial `GET /api/daemon/status` request.
   - **Test:** Advance timers by 3000ms, verify a second request is made.
   - **Test:** Unmount component, advance timers, verify no further requests are made.

2. **`useSyncConflicts` Pagination**
   - **Test:** Render list using `useSyncConflicts`. Verify `items` matches the fixture length.
   - **Test:** Trigger `fetchMore()`. Verify `cursor` is passed correctly to the next `GET /api/daemon/conflicts` request and items are appended.

3. **`useSyncForce` Mutation & Timeout**
   - **Test:** Call `trigger()`. Verify `isSyncing` becomes `true` immediately.
   - **Test:** Ensure multiple rapid calls to `trigger()` only result in one in-flight HTTP request.
   - **Test:** Simulate a delay > 30s on the server fixture. Verify the hook aborts the request, sets `error` to a timeout error, and resets `isSyncing` to `false`.

4. **`useConflictResolve` & `useConflictRetry` Guards**
   - **Test:** Call `resolve("conflict-1")`. Verify `isResolving("conflict-1")` is `true`.
   - **Test:** Call `resolve("conflict-2")` simultaneously. Verify `isResolving("conflict-2")` is `true` while the first is still processing, and separate requests are made.
   - **Test:** Verify `isResolving("conflict-1")` returns to `false` upon request completion.

5. **`useSyncState` Derived Logic**
   - **Test:** Provide mock daemon status (0 conflicts, online) and SSE connected. Verify status is `"online"`.
   - **Test:** Provide daemon status indicating 1 conflict. Verify status is `"error_conflicts"`.
   - **Test:** Disconnect SSE and simulate daemon network error. Verify status is `"offline"`.
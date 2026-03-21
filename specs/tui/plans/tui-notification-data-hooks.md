# Implementation Plan: TUI Notification Data Hooks

## Objective
Implement the data layer adapter hook for the TUI notification system (`useNotificationsAdapter`) wrapping `@codeplane/ui-core` primitives for pagination and mutation, handling SSE prepends, applying optimistic updates, maintaining a 500-item memory cap, and exposing client-side filtering. Additionally, implement an SSE bridge hook (`useNotificationSSE`) and comprehensive E2E tests.

## Step 1: Define Notification Domain Types
**File:** `apps/tui/src/hooks/notification-types.ts`

1. Define `Notification` interface mapping the API response domain model (using `camelCase` properties like `sourceType`, `readAt`, etc.).
2. Define `NotificationFilterStatus` as `"all" | "unread"`.
3. Define `NotificationFilters` interface holding `status` and `search`.
4. Define the `UseNotificationsResult` interface for the hook's return type including state (`items`, `unreadCount`, `totalCount`, `loading`, `error`, `hasMore`, `mutating`), pagination controls (`loadMore`, `refetch`), mutation handlers (`markRead`, `markAllRead`), filter state/controls (`filters`, `setFilterStatus`, `setSearchQuery`), and the SSE handler (`prepend`).
5. Export `HookError` from `@codeplane/ui-core/src/types/errors.js`.
6. Export constants: `MAX_NOTIFICATIONS = 500`, `DEFAULT_PER_PAGE = 30`, `MAX_PER_PAGE = 50`.

## Step 2: Implement the `useNotificationsAdapter` Hook
**File:** `apps/tui/src/hooks/useNotificationsAdapter.ts`

1. **Imports:** Import `useState`, `useCallback`, `useMemo` from React. Import `usePaginatedQuery` and `useMutation` from `@codeplane/ui-core/src/hooks/internal/`. Import `useAPIClient` and `parseResponseError` from `@codeplane/ui-core/src/client/index.js`. Import domain types and constants from `notification-types.js`.
2. **Data Fetching:**
   - Implement `usePaginatedQuery` mapped to `/api/notifications/list`.
   - Implement the `parseResponse` configuration parameter to handle the `X-Total-Count` header while mapping the flat array using a `parseNotification` function.
3. **Local State:**
   - Add `localOverrides` as `Map<number, Partial<Notification>>` for optimistic mutation state.
   - Add `prependedItems` as `Notification[]` for SSE arrivals.
   - Add `filters` state for `NotificationFilters` initialized to `{ status: "all", search: "" }`.
4. **Helper Functions:**
   - Implement `parseNotification(raw: any): Notification` pure mapping function.
   - Implement `evictOldestRead(items: Notification[], cap: number): Notification[]` to enforce the 500 memory cap with an oldest-read-first eviction strategy.
   - Implement `mergeItems()` to perform deduplication, apply overrides, sort by `createdAt` descending, and execute `evictOldestRead` if necessary.
   - Implement `applyFilters()` to reduce items down to those matching the active status/search configuration.
5. **Mutations:**
   - Implement `markReadMutation` via `useMutation` targeting `PATCH /api/notifications/:id`. Update `localOverrides` optimistically and revert on `onError`.
   - Implement `markAllReadMutation` via `useMutation` targeting `PUT /api/notifications/mark-read`. Push `readAt: new Date().toISOString()` into `localOverrides` for all unread items optimistically. Keep a snapshot on `onOptimistic` to revert on `onError`.
6. **Hook Composition:**
   - Derive `unreadCount` from the pre-filtered `mergedItems`.
   - Construct `refetch` to clear `prependedItems` and `localOverrides` before calling `paginated.refetch()`.
   - Return the full `UseNotificationsResult` shape.

## Step 3: Implement the SSE Bridge Hook
**File:** `apps/tui/src/hooks/useNotificationSSE.ts`

1. **Imports:** Import `useCallback` from React, `useSSE` from `../providers/SSEProvider.js`, `parseNotification` from `./useNotificationsAdapter.js`, and `Notification` from `./notification-types.js`.
2. **Implementation:**
   - Wrap `useSSE("notification", ...)`.
   - Define a `handler` that attempts to parse the `event.data` payload as JSON, process it with `parseNotification()`, and pass it to the provided `onNotification` callback.
   - Wrap the callback in a try-catch to discard malformed SSE events silently.

## Step 4: Export from the Hooks Barrel File
**File:** `apps/tui/src/hooks/index.ts`

1. Append an export block for `./useNotificationsAdapter.js` to expose `useNotificationsAdapter`.
2. Append an export block for `./notification-types.js` to expose `Notification`, `NotificationFilters`, `NotificationFilterStatus`, and `UseNotificationsResult`.
3. Append an export block for `./useNotificationSSE.js` to expose `useNotificationSSE`.

## Step 5: Implement End-to-End Tests
**File:** `e2e/tui/notifications.test.ts`

1. **Setup:** Import `describe`, `test`, `expect` from `bun:test`, and `launchTUI` from `./helpers.js`.
2. **Pagination Suite:** Write tests handling loading to data transitions (001), empty state handling (002), scrolling to trigger the next page load (003), error state (004), and refetching (005).
3. **Sorting Suite:** Write a test verifying newest-first sorting (006).
4. **Filtering Suite:** Write tests toggling to the Unread tab (010), back to All (011), searching by subject (012) and body (013), clearing search (014), and verifying case-insensitivity (015).
5. **Mutation Suites:** 
   - `markRead`: Write tests validating visual updates (020), badge decrements (021), and error reversion (022).
   - `markAllRead`: Write tests validating all items mark read (030), badge zeroing (031), and error reversion (032).
6. **Unread Count Suite:** Write tests verifying proper count extraction (040) independently of filters (041).
7. **SSE Suite:** Write tests validating prepend placement (050), deduplication (051), and badge increments (052).
8. **Memory Cap Suite:** Write a test validating scrolling loads past 500 don't cause infinite item growth (060).
9. **Responsive & Navigation Suites:** Write rendering snapshot tests for breakpoints (80x24, 120x40, 200x60) and navigation keybinding integration (`g n`, `q`).

## Final Steps
1. Ensure all created source code runs without TypeScript compilation errors (`tsc --noEmit`).
2. Execute the E2E tests (`bun run test e2e/tui/notifications.test.ts`) to capture any necessary golden snapshots for UI states or confirm proper failing modes where endpoints are incomplete.
3. Ensure code uses appropriate generic typing for the shared `@codeplane/ui-core` hooks.
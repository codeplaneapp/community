# Research Findings: TUI Notification Data Hooks

## 1. Existing Shared Data Hooks (`@codeplane/ui-core`)
The shared `ui-core` package provides the primitives necessary to build out the `useNotificationsAdapter` hook.
- **`usePaginatedQuery`** (`packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`)
  - Takes `config`: `client`, `path`, `cacheKey`, `perPage`, `enabled`, `maxItems`, `autoPaginate`, and a `parseResponse` function.
  - The `parseResponse` function receives raw `data` and `headers: Headers`. This matches the requirement for notifications where `X-Total-Count` needs to be extracted from headers to determine `totalCount`.
  - Provides state: `items`, `totalCount`, `isLoading`, `error`, `hasMore`.
  - Provides methods: `fetchMore()`, `refetch()`.
- **`useMutation`** (`packages/ui-core/src/hooks/internal/useMutation.ts`)
  - Takes `config`: `mutationFn`, `onOptimistic`, `onSuccess`, `onError`, `onSettled`.
  - The `onOptimistic` hook will be essential for optimistic `markRead(id)` and `markAllRead()`. By managing a `Map<number, Partial<Notification>>` local state inside `useNotificationsAdapter`, we can apply overrides and revert them using `onError` if the mutation fails.
  - Provides state: `isLoading` (maps directly to `mutating` in the spec), `error`.
  - Provides methods: `mutate(input)`.

## 2. Shared API Client
- **`APIClient`** (`packages/ui-core/src/client/types.ts`)
  - Provides a `request(path: string, options?: APIRequestOptions): Promise<Response>` method.
  - `mutationFn` will call `client.request` to perform `PATCH /api/notifications/:id` and `PUT /api/notifications/mark-read`.
  - It successfully bubbles up `parseResponseError(response)` to properly catch errors in the mutation.

## 3. SSE Provider Integration
- **`useSSE`** (`apps/tui/src/providers/index.ts`)
  - The `SSEProvider` context allows components to listen to streams. 
  - Building `useNotificationSSE.ts` as a thin wrapper around `useSSE("notification", handler)` is standard pattern and bridges real-time events to the adapter's `prepend()` function without polluting the main adapter hook with SSE logic.

## 4. Hook Patterns (`apps/tui/src/hooks`)
- **Type Definitions** (`apps/tui/src/hooks/workflow-types.ts` reference)
  - Existing domain types combine interface definitions for API response shapes, filter interfaces, and hook return types in one cohesive file.
  - Hook error types are aliased from `@codeplane/ui-core/src/types/errors.js` (`export type { HookError }`).
  - Contains constants for limits (`MAX_RUNS = 500`). The new `notification-types.ts` should follow this exact pattern with `MAX_NOTIFICATIONS = 500`, `DEFAULT_PER_PAGE = 30`, and `MAX_PER_PAGE = 50`.
- **Barrel File** (`apps/tui/src/hooks/index.ts`)
  - Central export hub for all hooks. `useNotificationsAdapter` and types will be added here to match standard conventions.

## 5. Architectural Alignment with Engineering Spec
- **Mapping Responses**: The `parseNotification` function is needed because the backend API returns `snake_case` (`source_type`, `read_at`) while the React TUI domain relies on `camelCase` properties.
- **Eviction Strategy**: The memory cap (`MAX_NOTIFICATIONS = 500`) with oldest-read-first eviction will intercept `combinedItems` via a local compute check post-merge, guaranteeing stability during high-volume sessions.
- **Optimistic Merges & Client-side Filtering**: `search` and `status` filtering run fully locally after optimistic overrides (`localOverrides`) are applied and the unread count (`unreadCount`) is evaluated. This guarantees that `unreadCount` corresponds to the actual raw payload memory cap prior to display hiding.

Everything outlined in the engineering spec is fully supported by the current `@codeplane/ui-core` components and established hook patterns found in `apps/tui/src/hooks/`.
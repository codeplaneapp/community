# Implementation Plan: TUI_NOTIFICATION_DETAIL_NAV

This plan details the implementation of source-type routing for the TUI Notification List, incorporating findings from the initial research phase.

## Phase 1: SDK and API Updates

### 1. Update Notification Types
**File:** `packages/sdk/src/services/notification.ts`
*Note: Research identified the interface resides in the `services` directory, not `types`.*
- Extend the `NotificationResponse` interface with denormalized navigation fields:
  ```typescript
  repo_owner?: string | null;
  repo_name?: string | null;
  resource_number?: number | null;
  ```
- Export a new `NotificationSourceResolveResponse` interface:
  ```typescript
  export interface NotificationSourceResolveResponse {
    screen: string;
    repo_owner: string | null;
    repo_name: string | null;
    resource_number: number | null;
  }
  ```

### 2. Implement Server Endpoints
**File:** `apps/server/src/routes/notifications.ts`
- Implement `GET /api/notifications/:id/source` to handle fallback resolution for legacy notifications, returning a `NotificationSourceResolveResponse`.
- Ensure `PATCH /api/notifications/:id` is fully implemented to support updating the `status` to `'read'`.

## Phase 2: UI-Core Data Layer

### 1. Extend `useNotifications` Hook
**File:** `packages/ui-core/src/hooks/useNotifications.ts` *(Create if missing)*
- Add `markRead(id: number)` to the returned payload.
- Implement optimistic local cache updates within `markRead`:
  - Locate the notification in the infinite query cache.
  - Set `status = 'read'` and decrement the global `unreadCount`.
  - Execute `PATCH /api/notifications/:id` with `{ status: 'read' }`.
  - Revert the optimistic update if the request fails (non-404, non-429), or remove it from the cache if a 404 is returned.

### 2. Create Resolution Hook
**File:** `packages/ui-core/src/hooks/useNotificationSourceResolve.ts`
- Create an imperative function `resolveSource(notificationId: number, signal?: AbortSignal)` that fetches `GET /api/notifications/:id/source`.
- Implement error transformations (e.g., 404 -> `NotFoundError`, 403 -> `AccessDeniedError`) for consumption by the TUI layer.

## Phase 3: TUI Screen Routing and Logic

### 1. Create Routing Mapper
**File:** `apps/tui/src/util/notification-routing.ts`
*Note: Adhering to the existing `util/` directory convention.*
- Create the `getNavigationTarget(notif: NotificationResponse)` pure function to map `source_type` to screen parameters (e.g., `IssueDetail`, `LandingDetail`, `WorkflowRunDetail`, `WorkspaceDetail`).
- Return `null` if required fields (`repo`, `resource_number`) are missing, indicating fallback resolution is required.

### 2. Update Notification Screen & Row Rendering
**File:** `apps/tui/src/screens/NotificationScreen.tsx` *(Create if it is currently just a placeholder)*
- **State Management:** Add `resolvingId` state and `abortControllerRef`.
- **Row Rendering:** Pass an `isResolving` boolean to rows. Use OpenTUI's `useTimeline` to create a `useResolutionSpinner` hook that cycles spinner frames after a 200ms delay. Update the unread indicator column to display the spinner or the unread dot (`●`).
- **Selection Logic (`onSelect`):**
  - Check `source_id` and `source_type`. Display status bar errors if invalid.
  - Optimistically call `markRead(notif.id)` if `status === 'unread'`.
  - Attempt synchronous routing via `getNavigationTarget`. If successful, push immediately.
  - If fallback is needed: Set up `AbortController`, set `resolvingId`, show "Resolving…" in the status bar, and call `resolveSource` with a 10s timeout. Handle success and specific error cases (404, 403, 429, timeout) with flash messages.
- **Cancellations:**
  - Bind the `Esc` key (when `resolvingId !== null`) to abort the active controller.
  - Intercept focus changes (e.g., `j`/`k` presses) to abort resolution.
  - Return a cleanup function in `useEffect` to abort the controller on screen unmount.

## Phase 4: E2E Testing

### 1. Create Notification Tests
**File:** `e2e/tui/notifications.test.ts`
- Use `@microsoft/tui-test` to configure mock HTTP handlers for enriched data, legacy data, and error states.
- **Snapshot Tests:** Cover synchronous routing for all supported target types (Issue, Landing, Workflow, Workspace), null sources, unknown types, resolving state spinners, and timeout errors.
- **Keyboard Interaction Tests:** Verify routing matrix, optimistic read behavior, `Esc` cancellations, `j`/`k` cancellations, detail return flows (`q`), state preservation, and triage loops.
- **Integration Tests:** Cover legacy API resolution (200, 404, 403) and 500 error reverts for `markRead`.
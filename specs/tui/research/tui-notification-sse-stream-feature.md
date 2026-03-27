# Research Document: TUI_NOTIFICATION_SSE_STREAM

## Codebase Context & Existing Artifacts

1. **SSE Provider Stub (`apps/tui/src/providers/SSEProvider.tsx`)**
   - The current provider in the TUI application is a minimal stub. It creates an `SSEContext` with a value of `null` and provides a `useSSE` hook that returns `null`.
   - Another reference implementation exists under `specs/tui/apps/tui/src/providers/SSEProvider.tsx`, which implements an event pub-sub system (using a `Map` of subscribers) and simulates SSE via file-polling for testing. 
   - To implement the new feature, `apps/tui/src/providers/SSEProvider.tsx` must be upgraded to manage real `EventSource` (or `fetch`-based) connections, maintain connection state (`connected`, `reconnecting`, etc.), handle exponential backoff, and manage `Last-Event-ID` replay.

2. **SSE Reader & Ticket Auth (`specs/tui/packages/ui-core/src/sse/`)**
   - **`createSSEReader.ts`**: The codebase already has an advanced fetch-based SSE reader utilizing `eventsource-parser`. It was built because the native browser/Node `EventSource` lacks custom header support (such as `Authorization` or `Last-Event-ID`). This directly satisfies the spec's requirement for a wrapper around `EventSource`.
   - **`getSSETicket.ts`**: This implements the `POST /api/auth/sse-ticket` API call, exchanging a bearer token for a short-lived ticket and falling back gracefully on failures.
   - *Note*: These implementations need to be made available/ported to the active UI core or integrated properly within the TUI data access layer as they currently reside in the `specs/` reference path.

3. **Status Bar & UI (`apps/tui/src/components/StatusBar.tsx`)**
   - The `StatusBar` currently has a stubbed sync and connection state (`const syncState = "connected";`).
   - It needs to be updated to integrate `useSSEConnectionState()` to map the current state to the specified ANSI indicators (Green `●` for Connected, Red `●` for Reconnecting/Failed).

4. **Data Hooks (`useNotificationStream`)**
   - A `useNotificationStream` hook does not currently exist. It must be created to implement the notification logic: managing the `user_notifications_{userId}` channel subscription, deduplicating IDs via an in-memory 1000-ID window, maintaining a 500-item caching window, and returning state parameters like `{ latestEvent, connectionHealth, unreadCount, lastEventId }`.

5. **Notification Screens**
   - The `NotificationBadge.tsx` and `NotificationListScreen.tsx` components do not exist yet in `apps/tui/src/`.
   - They will need to be created and wired up to consume the `useNotificationStream` hook, use `@opentui/react`'s `useTimeline` for the 2-second flash/bold render, and intelligently update `<scrollbox>` elements to preserve scroll positions.

## Implementation Action Plan

1. **Phase 1 (SSE Core)**: Rewrite `apps/tui/src/providers/SSEProvider.tsx` to handle ticket acquisition, `createSSEReader` connection, exponential backoff (up to 30s cap/20 attempts), and 45s keep-alive monitoring.
2. **Phase 2 (Hooks)**: Create `useNotificationStream` to consume the raw `useSSE` events, apply deduplication logic, and handle local item eviction.
3. **Phase 3 (TUI Integration)**: Upgrade `StatusBar.tsx` to reflect live SSE status. Create `NotificationBadge.tsx` and `NotificationListScreen.tsx` (or update if stubbed elsewhere) to render the new streaming data.
4. **Phase 4 (Tests)**: Add unit tests for deduplication and backoff logic, and E2E tests matching the specified criteria.
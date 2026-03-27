# Engineering Specification: TUI_NOTIFICATION_SSE_STREAM

## Overview

This specification details the implementation of the `TUI_NOTIFICATION_SSE_STREAM` feature. It provides a robust, singleton Server-Sent Events (SSE) connection that pipes real-time notification updates to the TUI. The feature includes ticket-based authentication, exponential backoff for reconnection, `Last-Event-ID` replay, keep-alive tracking, local cache deduplication (1000-ID window), and seamless UI integration for status badges and the notification inbox.

## Architecture / Design

The SSE pipeline relies on a `<SSEProvider>` mounted in the global React tree (after `<APIClientProvider>` and before `<NavigationProvider>`). 

1.  **Ticket Authentication**: Rather than exposing the long-lived user token, the provider requests a short-lived ticket via `POST /api/auth/sse-ticket`. If the endpoint fails or is missing, it gracefully falls back to a bearer token approach.
2.  **State Machine**: The connection cycles through `connected`, `reconnecting`, `disconnected`, and `failed`. 
    - **Keep-alive**: Validated every 45s (expecting server pings every 15s). 
    - **Backoff**: 1s, 2s, 4s, 8s, 16s, capped at 30s. Stops retrying after 20 consecutive failures (enters `failed` state).
3.  **Data Hooks**: Components interact with the stream via `@codeplane/ui-core` hooks, primarily `useNotificationStream()`, which deduplicates incoming events and manages a local cache of up to 500 items.
4.  **UI Updates**: The Header Bar, Status Bar, and Notification List Screen dynamically re-render based on stream state without blocking user interaction or requiring manual refreshes.

## Implementation Plan

### Phase 1: Core SSE Connection & Provider

1.  **`packages/ui-core/src/sse/sseClient.ts`**
    - Create a wrapper around standard browser/Node `EventSource` to support custom headers (for bearer fallback and `Last-Event-ID`).
    - Implement keep-alive liveness timer. Expose `onMessage`, `onError`, `onOpen` callbacks.

2.  **`packages/ui-core/src/api/auth.ts`**
    - Add `createSSETicket(apiClient: APIClient): Promise<string>` to perform the `POST /api/auth/sse-ticket` request.
    - Handle rate limit (`429`) headers, propagating the `Retry-After` value up to the caller.

3.  **`apps/tui/src/providers/SSEProvider.tsx`**
    - Create the `<SSEProvider>` component.
    - **State**: `connectionState` (`connected`, `reconnecting`, `disconnected`, `failed`), `backoffMs`, `reconnectAttempts`, `lastEventId`.
    - **Logic**:
        - **Connect**: Call `createSSETicket`. Open `EventSource` against `GET /api/notifications`. On 401 ticket failure, fallback to bearer token.
        - **Retry logic**: Exponential backoff (`Math.min(30000, 1000 * Math.pow(2, attempts))`). Abort after 20 failures.
        - **Keep-alive**: Reset a 45-second timeout on every received event or `: keep-alive` comment. If it fires, close connection and trigger reconnect.
    - **Dispatch**: Maintain a registry of channel subscribers (e.g., `user_notifications_${user.id}`). Parse incoming JSON and dispatch to subscribers.
    - Expose React context with `subscribe`, `connectionState`, `backoffMs`, etc.

4.  **`apps/tui/src/providers/index.tsx` (or `AppShell.tsx`)**
    - Insert `<SSEProvider>` into the provider stack immediately below `<APIClientProvider>`.

### Phase 2: Core Data Hooks & Caching

1.  **`packages/ui-core/src/hooks/useNotificationStream.ts`**
    - Implement hook to consume the `user_notifications_{userId}` SSE channel.
    - Maintain an in-memory deduplication window of the last 1,000 processed `notification.id` values.
    - Maintain a sliding window of max 500 notification items (evicting oldest read items first).
    - Export state: `{ latestEvent, connectionHealth, unreadCount, lastEventId }`.
    - Handle updating the cache inline if a replayed event matches an existing notification ID.

2.  **`packages/ui-core/src/hooks/useSSE.ts`**
    - Implement low-level hook `useSSE(channel)` to subscribe a component to raw events from the `<SSEProvider>` context.

### Phase 3: TUI Integration

1.  **`apps/tui/src/components/StatusBar.tsx`**
    - Integrate `useSSEConnectionState()`.
    - Map `connectionState` to visual indicators:
        - `connected`: ANSI 34 Green `●`, "Connected".
        - `reconnecting`: ANSI 196 Red `●`, "Disconnected (retry Xs)".
        - `failed`/`disconnected`: ANSI 196 Red `●`, "Connection failed".

2.  **`apps/tui/src/components/NotificationBadge.tsx`**
    - Consume `useNotificationStream()` to get `unreadCount`.
    - Add `useTimeline()` from `@opentui/react` to trigger a 2-second bold render whenever `unreadCount` increments.
    - Render `[99+]` if count > 99. Render muted style if 0.

3.  **`apps/tui/src/screens/NotificationListScreen.tsx`**
    - Integrate `useNotificationStream()` and merge incoming events into the pagination cache from `useNotifications()`.
    - Implement the prepended reverse-video flash: track newly arrived IDs in a ref, render with reverse-video for one render cycle, then clear.
    - Preserve scroll position when items are prepended (using OpenTUI's `<scrollbox>` ref / scroll position APIs).
    - Display `⚠ No live updates` (or size-appropriate equivalent) in the header when stream health is not `healthy`.

### Phase 4: Telemetry & Error Handling

1.  **`apps/tui/src/utils/telemetry.ts`** (or relevant telemetry module)
    - Fire `tui.notification.sse.connected`, `tui.notification.sse.disconnected`, and `tui.notification.sse.reconnected` based on `<SSEProvider>` state transitions.

2.  **`apps/tui/src/utils/logger.ts`**
    - Add debug, info, warn, and error logs per the observability matrix (e.g., logging deduplicated events, ticket acquisition times).

## Unit & Integration Tests

### `@codeplane/ui-core` Tests
1.  **`useNotificationStream.test.ts`**
    - Verify deduplication logic: processing the same ID twice only yields one item.
    - Verify cache eviction: pushing 501 items correctly evicts the oldest read item.
    - Verify unread count increments correctly.
2.  **`SSEProvider.test.tsx`**
    - Verify exponential backoff intervals (mocking timers to check 1s, 2s, 4s logic).
    - Verify that 45s without data triggers a reconnect.
    - Verify that receiving a `: keep-alive` resets the 45s timeout.
    - Verify fallback to bearer token if ticket fetch rejects with a 404 or 500.

### TUI E2E Tests (`e2e/tui/notifications.test.ts`)

All tests utilize `@microsoft/tui-test` matching the acceptance criteria:

**Connection Lifecycle**
- `SSE-NOTIF-001`: establishes SSE connection on TUI mount for authenticated user.
- `SSE-NOTIF-002`: uses ticket-based authentication for SSE connection.
- `SSE-NOTIF-003`: does not establish SSE connection without auth token.
- `SSE-NOTIF-004`: cleans up SSE connection on TUI quit.
- `SSE-NOTIF-007`: reconnects with exponential backoff on disconnect.
- `SSE-NOTIF-009`: sends `Last-Event-ID` on reconnection.
- `SSE-NOTIF-010`: stops reconnection after 20 attempts.

**Badge Integration**
- `SSE-BADGE-001`: badge count increments on new notification SSE event.
- `SSE-BADGE-002`: badge flashes bold for 2 seconds on new notification.
- `SSE-BADGE-004`: badge updates after reconnection replay.
- `SSE-BADGE-008`: badge at zero shows muted style, transitions on first event.

**List Screen Integration**
- `SSE-LIST-001`: new SSE event prepended to active notification list.
- `SSE-LIST-002`: prepended notification has reverse-video highlight.
- `SSE-LIST-004`: scroll position preserved when SSE event arrives during scroll.
- `SSE-LIST-007`: disconnection indicator appears on list screen after 5s.

**Replay & Edge Cases**
- `SSE-REPLAY-002`: deduplicates replayed events against local cache.
- `SSE-ERR-001`: shows auth message on 401 ticket response.
- `SSE-ERR-003`: discards malformed SSE events gracefully.
- `SSE-ERR-006`: survives terminal resize during active SSE.
- `SNAP-SSE-NOTIF-001` through `008`: Validate snapshot renders of the badge states and list UI at `120x40` and `80x24`.

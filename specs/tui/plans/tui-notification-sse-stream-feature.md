# Implementation Plan: TUI_NOTIFICATION_SSE_STREAM

This document outlines the step-by-step implementation plan for the real-time notification streaming feature in the Codeplane TUI using Server-Sent Events (SSE).

## Phase 1: Core SSE Client and Authentication

**1. Implement SSE Client Wrapper**
- **File:** `packages/ui-core/src/sse/sseClient.ts`
- **Action:** Create a robust SSE client using `fetch` and `eventsource-parser` (or similar) to overcome native `EventSource` limitations regarding custom headers (specifically `Authorization` and `Last-Event-ID`).
- **Details:**
  - Implement connection lifecycle management (connect, disconnect, abort).
  - Expose event callbacks: `onMessage`, `onError`, `onOpen`, `onClose`.
  - Handle standard SSE parsing, including event types, data payloads, and IDs.

**2. Implement SSE Ticket API Client Method**
- **File:** `packages/ui-core/src/api/auth.ts`
- **Action:** Add a method to request short-lived SSE tickets.
- **Code Changes:**
  - Add `export async function createSSETicket(apiClient: APIClient): Promise<string>`.
  - Make a `POST` request to `/api/auth/sse-ticket`.
  - Implement error handling to gracefully fall back or propagate `429 Too Many Requests` (`Retry-After`).

## Phase 2: Global SSE Provider

**1. Create the SSE Provider Component**
- **File:** `apps/tui/src/providers/SSEProvider.tsx`
- **Action:** Replace the existing stub with a fully functional state machine for the SSE connection.
- **Details:**
  - **State:** `connectionState` (`connected`, `reconnecting`, `disconnected`, `failed`), `backoffMs`, `reconnectAttempts`, `lastEventId`.
  - **Connection Logic:** Try to acquire a ticket via `createSSETicket`. Connect the `sseClient` to `GET /api/notifications` using the ticket. If the ticket fails (e.g., `401`, `404`), fall back to using the standard bearer token.
  - **Resilience:**
    - Implement exponential backoff for reconnections: 1s, 2s, 4s, 8s, 16s, capped at 30s.
    - Stop retrying and enter `failed` state after 20 consecutive failures.
  - **Keep-alive:**
    - Implement a 45-second liveness timer.
    - Reset the timer upon receiving any message or a `: keep-alive` comment.
    - If the timer expires, forcefully close the connection and trigger a reconnect.
  - **Pub/Sub Registry:** Maintain a `Map` of active channels to subscriber callbacks. Parse incoming SSE data and dispatch based on the channel (e.g., `user_notifications_${user.id}`).
  - **Context:** Expose `useSSEContext()` yielding the subscription method and connection state.

**2. Inject Provider into the App Tree**
- **File:** `apps/tui/src/app.tsx` (or `apps/tui/src/providers/index.tsx`)
- **Action:** Wrap the application tree with `<SSEProvider>`.
- **Details:** Place it immediately below the `<APIClientProvider>` but above the `<NavigationProvider>` so that routing and screens can access the stream.

## Phase 3: Data Hooks and State Management

**1. Implement the Low-Level `useSSE` Hook**
- **File:** `packages/ui-core/src/hooks/useSSE.ts`
- **Action:** Create a hook to subscribe to a specific channel.
- **Details:**
  - `export function useSSE<T>(channel: string): T | null`
  - Register with the `<SSEProvider>` context on mount, unregister on unmount.

**2. Implement `useNotificationStream` Hook**
- **File:** `packages/ui-core/src/hooks/useNotificationStream.ts`
- **Action:** Create the domain-specific hook for notifications with caching and deduplication.
- **Details:**
  - Use `useSSE("user_notifications_" + userId)` to receive raw events.
  - **Deduplication:** Maintain an in-memory `Set` or `LRUCache` of the last 1,000 processed `notification.id` values to ignore replays.
  - **Caching:** Maintain a sliding window array of up to 500 notification items. Evict the oldest *read* items when the limit is reached.
  - **State Output:** Return `{ latestEvent, connectionHealth, unreadCount, lastEventId, notifications }`.

## Phase 4: TUI Component Integration

**1. Update the Status Bar**
- **File:** `apps/tui/src/components/StatusBar.tsx`
- **Action:** Display real-time SSE connection health.
- **Details:**
  - Consume the connection state from the SSE context.
  - Map states to UI: `connected` (Green `●`, "Connected"), `reconnecting` (Red `●`, "Disconnected (retry Xs)"), `failed`/`disconnected` (Red `●`, "Connection failed").

**2. Create/Update the Notification Badge**
- **File:** `apps/tui/src/components/NotificationBadge.tsx` (or update within Header/Sidebar)
- **Action:** Render the live unread count with a visual flash on new items.
- **Details:**
  - Consume `useNotificationStream()` for `unreadCount`.
  - Use `@opentui/react`'s `useTimeline` to trigger a 2-second bold/highlighted render when `unreadCount` increments.
  - Display `[99+]` for counts over 99. Use muted styling when the count is 0.

**3. Update the Notification List Screen**
- **File:** `apps/tui/src/screens/NotificationListScreen.tsx`
- **Action:** Integrate the streaming hook and handle dynamic list updates.
- **Details:**
  - Merge incoming stream items with the paginated historical cache.
  - **Highlighting:** Use a `useRef` to track newly arrived IDs. Apply a reverse-video highlight to these rows for one render cycle, then clear it.
  - **Scroll Preservation:** Ensure the `<scrollbox>` maintains its visual scroll position when items are prepended to the top of the list so the user's view doesn't abruptly jump.
  - **Warning:** Display a UI warning (e.g., `⚠ No live updates`) if the stream health is not connected.

## Phase 5: Telemetry and Logging

**1. Add Telemetry Events**
- **File:** `apps/tui/src/utils/telemetry.ts`
- **Action:** Hook into the SSE provider's state transitions.
- **Details:** Emit `tui.notification.sse.connected`, `tui.notification.sse.disconnected`, and `tui.notification.sse.reconnected` events.

**2. Add Debug Logging**
- **File:** `apps/tui/src/utils/logger.ts`
- **Action:** Add structured logs for observability.
- **Details:** Log ticket acquisition times, keep-alive failures, reconnection attempts, and deduplicated event IDs (at debug level).

## Phase 6: Testing

**1. Unit Tests (`@codeplane/ui-core`)**
- **File:** `packages/ui-core/src/hooks/useNotificationStream.test.ts`
  - Test deduplication logic (processing the same ID twice yields one item).
  - Test cache eviction (pushing 501 items evicts the oldest read item).
  - Test unread count increments.
- **File:** `apps/tui/src/providers/SSEProvider.test.tsx`
  - Mock timers to verify exponential backoff intervals.
  - Verify 45s keep-alive timeout triggers a reconnect.
  - Verify `: keep-alive` comments reset the timeout.
  - Verify fallback to bearer token on 401/404 ticket failure.

**2. End-to-End Tests (`e2e/tui/notifications.test.ts`)**
- **Action:** Implement the specified `@microsoft/tui-test` scenarios.
- **Details:**
  - Connection Lifecycle: `SSE-NOTIF-001` to `010` (connection on mount, ticket auth, backoff, Last-Event-ID, max attempts).
  - Badge Integration: `SSE-BADGE-001` to `008` (increment, 2s flash, replay updates, zero state).
  - List Screen: `SSE-LIST-001` to `007` (prepend, reverse-video, scroll preservation, disconnect indicator).
  - Edge Cases: `SSE-REPLAY-002` (deduping), `SSE-ERR-001`, `003`, `006` (auth errors, malformed events, resize survival).
  - Snapshot Tests: `SNAP-SSE-NOTIF-001` through `008` at `120x40` and `80x24`.
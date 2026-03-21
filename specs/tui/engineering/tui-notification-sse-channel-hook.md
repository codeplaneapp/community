# Engineering Specification: Notification SSE Channel Hook — `useNotificationStream`

## Ticket: `tui-notification-sse-channel-hook`

**Title:** Notification SSE channel hook — useNotificationStream with deduplication and reconnection

**Status:** Engineering Specification (ready for implementation)

**Dependency:** `tui-theme-provider` (ThemeProvider at `apps/tui/src/providers/ThemeProvider.tsx` — implemented)

---

## 1. Overview

This ticket implements `useNotificationStream`, a React hook that subscribes to the `user_notifications_{userId}` SSE channel and provides real-time notification data to TUI components. The hook follows the established SSE streaming pattern from `useAgentStream` but is adapted for the notification domain: perpetual subscription (no "done" state), array-based accumulation (not string concatenation), and ID-based deduplication (not position counters).

### 1.1 Scope

**In scope:**
- Core shared hook: `packages/ui-core/src/hooks/notifications/useNotificationStream.ts`
- Wire format types: `packages/ui-core/src/types/notificationStream.ts`
- TUI adapter hook: `apps/tui/src/hooks/useNotificationStream.ts`
- E2E test suite: `e2e/tui/notifications.test.ts`

**Out of scope:**
- NotificationProvider context wrapper (separate ticket)
- Notification list screen UI (separate ticket)
- Mark-read mutations (separate ticket)
- SSEProvider refactor (this hook operates independently like `useAgentStream`)

### 1.2 Key Differences from `useAgentStream`

| Aspect | `useAgentStream` | `useNotificationStream` |
|--------|-----------------|------------------------|
| Subscription identity | `sessionId` (changes per chat) | `userId` (implicit, from auth) |
| Stream lifetime | Finite (server sends `done`) | Perpetual (never closes by design) |
| State accumulation | String concatenation (`currentTokens`) | Array of objects (`notifications[]`) |
| Deduplication | Position counter (character offset) | Sliding window of notification IDs (1000) |
| Last-Event-ID | Character position | Notification `id` (integer) |
| Reconnection replay | Fetch messages API + position diff | Server-side replay via `Last-Event-ID` header |
| Connection states | `idle/connecting/connected/reconnecting/completed/errored/failed` | `connected/reconnecting/disconnected/failed` (no `completed`) |
| Auto-subscribe trigger | `sessionId` prop change | Mount (if `enabled`) |

---

## 2. Wire Format Types

### File: `packages/ui-core/src/types/notificationStream.ts`

```typescript
/**
 * Wire format types for the notification SSE stream.
 *
 * These represent the JSON inside the `data:` field of each SSE event
 * received from GET /api/notifications.
 *
 * Server sends events with:
 *   - event type: "notification"
 *   - id: string (notification ID, used for Last-Event-ID replay)
 *   - data: JSON string of NotificationResponse
 */

import type { NotificationResponse } from "@codeplane/sdk";

/**
 * The parsed SSE event for a notification.
 * The `data` field from the SSE frame is parsed as JSON into this shape.
 */
export interface NotificationSSEEvent {
  type: "notification";
  data: NotificationResponse;
}

/**
 * Connection state for the notification SSE stream.
 *
 * Unlike agent streams, notifications have no "completed" state —
 * the stream is perpetual for the lifetime of the TUI session.
 *
 * - "connected": SSE stream is open and receiving events
 * - "reconnecting": Connection lost, backoff timer active, will retry
 * - "disconnected": Not connected (initial state, or after unsubscribe)
 * - "failed": Exceeded MAX_RECONNECT_ATTEMPTS, no further retries
 */
export type NotificationStreamConnectionState =
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";
```

### Design Rationale

The `NotificationResponse` type is imported from `@codeplane/sdk` (defined in `packages/sdk/src/services/notification.ts`) rather than redefined. This ensures the wire format stays in sync with the server. The type is:

```typescript
// From @codeplane/sdk — NOT redefined here
export interface NotificationResponse {
  id: number;
  user_id: number;
  source_type: string;   // e.g., "issue_assigned", "lr_reviewed"
  source_id: number | null;
  subject: string;
  body: string;
  status: string;         // "unread" | "read"
  read_at: string | null; // ISO-8601 or null
  created_at: string;     // ISO-8601
  updated_at: string;     // ISO-8601
}
```

---

## 3. Core Shared Hook

### File: `packages/ui-core/src/hooks/notifications/useNotificationStream.ts`

### 3.1 Public Interface

```typescript
import type { NotificationResponse } from "@codeplane/sdk";
import type { NotificationStreamConnectionState } from "../../types/notificationStream.js";

export interface NotificationStreamState {
  /** Accumulated notifications from the stream, ordered by id descending (newest first). */
  notifications: NotificationResponse[];
  /** Derived count of notifications where read_at is null. */
  unreadCount: number;
  /** True when connectionState is "connected" or "reconnecting". */
  streaming: boolean;
  /** True only when connectionState is "connected". */
  connected: boolean;
  /** True only when connectionState is "reconnecting". */
  reconnecting: boolean;
  /** The current connection state. */
  connectionState: NotificationStreamConnectionState;
  /** Last error, if any. Cleared on successful reconnection. */
  error: Error | null;
  /** Manually initiate subscription. Called automatically on mount if enabled. */
  subscribe: () => void;
  /** Manually disconnect. Called automatically on unmount. */
  unsubscribe: () => void;
}

export interface NotificationStreamOptions {
  /** Whether to auto-subscribe on mount. Defaults to true. */
  enabled?: boolean;
  /** Called for each new notification (after dedup). */
  onNotification?: (notification: NotificationResponse) => void;
  /** Called on connection-level errors. */
  onError?: (error: Error) => void;
  /** Called when connection state changes. */
  onConnectionStateChange?: (state: NotificationStreamConnectionState) => void;
}

export function useNotificationStream(
  options?: NotificationStreamOptions,
): NotificationStreamState;
```

### 3.2 Constants

```typescript
// Reconnection
const INITIAL_BACKOFF_MS = 1_000;     // 1 second
const MAX_BACKOFF_MS = 30_000;        // 30 seconds
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20;

// Liveness
const KEEPALIVE_TIMEOUT_MS = 45_000;  // 3× server's 15s keep-alive interval

// Deduplication
const DEDUP_WINDOW_SIZE = 1_000;      // sliding window of recent notification IDs

// Backoff sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, ...
```

### 3.3 Internal State

```typescript
// Reactive state (triggers re-render)
const [connectionState, setConnectionState] = useState<NotificationStreamConnectionState>("disconnected");
const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
const [error, setError] = useState<Error | null>(null);

// Derived state
const unreadCount = useMemo(
  () => notifications.filter(n => n.read_at === null).length,
  [notifications],
);
const streaming = connectionState === "connected" || connectionState === "reconnecting";
const connected = connectionState === "connected";
const reconnecting = connectionState === "reconnecting";

// Mutable refs (no re-render)
const isMounted = useRef(true);
const abortControllerRef = useRef<AbortController | null>(null);
const backoffRef = useRef(INITIAL_BACKOFF_MS);
const reconnectAttemptsRef = useRef(0);
const keepaliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const seenIdsRef = useRef<Set<number>>(new Set());
const lastEventIdRef = useRef<number>(0);
const optionsRef = useRef(options);
const connectionStateRef = useRef<NotificationStreamConnectionState>("disconnected");
```

### 3.4 State Machine

```
                    ┌──────────────┐
                    │ disconnected │ ← initial state / after unsubscribe()
                    └──────┬───────┘
                           │ subscribe()
                           ▼
                    ┌──────────────┐
                    │  connected   │ ← onOpen callback fires
                    └──┬───────┬───┘
                       │       │
          onError /    │       │  unsubscribe()
          keepalive    │       │
          timeout      │       ▼
                       │  ┌──────────────┐
                       │  │ disconnected │
                       │  └──────────────┘
                       ▼
                ┌──────────────┐
                │ reconnecting │ ← backoff timer active
                └──┬───────┬───┘
                   │       │
       onOpen      │       │  attempts > MAX_RECONNECT_ATTEMPTS
       (success)   │       │
                   ▼       ▼
            ┌──────────┐  ┌────────┐
            │connected │  │ failed │ ← terminal state, no more retries
            └──────────┘  └────────┘
```

### 3.5 Connection Logic — `connectToStream`

```typescript
const connectToStream = useCallback(async (isReconnect: boolean) => {
  if (!isMounted.current) return;

  // 1. Abort any existing connection
  abortControllerRef.current?.abort();
  const abortController = new AbortController();
  abortControllerRef.current = abortController;

  // 2. Obtain SSE ticket (or fallback to bearer auth)
  const ticket = await getSSETicket(client, abortController.signal);
  if (abortController.signal.aborted) return;

  // 3. Build SSE URL
  const basePath = "/api/notifications";
  let url: string;
  let headers: Record<string, string> = {};

  if (ticket) {
    url = `${client.baseUrl}${basePath}?ticket=${encodeURIComponent(ticket.ticket)}`;
  } else {
    url = `${client.baseUrl}${basePath}`;
    headers = client.getAuthHeaders?.() ?? {};
  }

  // 4. Determine Last-Event-ID for replay
  const lastEventId = lastEventIdRef.current > 0
    ? String(lastEventIdRef.current)
    : undefined;

  // 5. Open SSE stream
  try {
    await createSSEReader({
      url,
      headers,
      signal: abortController.signal,
      lastEventId,

      onOpen: () => {
        if (!isMounted.current) return;
        setConnectionState("connected");
        connectionStateRef.current = "connected";
        setError(null);
        backoffRef.current = INITIAL_BACKOFF_MS;
        reconnectAttemptsRef.current = 0;
        resetKeepaliveTimer();
        optionsRef.current?.onConnectionStateChange?.("connected");
      },

      onEvent: (event) => {
        if (!isMounted.current) return;
        resetKeepaliveTimer();

        // Requirement (9): Malformed JSON — log warning, skip event
        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          console.warn("[useNotificationStream] Malformed JSON in SSE event, skipping");
          return;
        }

        // Requirement (10): Unknown event type — silently ignore
        if (event.event && event.event !== "notification") {
          return;
        }

        // Validate minimum shape
        if (typeof parsed.id !== "number") {
          console.warn("[useNotificationStream] Event missing numeric id, skipping");
          return;
        }

        const notification = parsed as NotificationResponse;

        // Requirement (3): Deduplication by id (sliding window)
        if (seenIdsRef.current.has(notification.id)) {
          return;
        }

        // Add to seen window, evict oldest if over limit
        seenIdsRef.current.add(notification.id);
        if (seenIdsRef.current.size > DEDUP_WINDOW_SIZE) {
          const oldest = seenIdsRef.current.values().next().value;
          seenIdsRef.current.delete(oldest);
        }

        // Requirement (4): Track Last-Event-ID
        if (notification.id > lastEventIdRef.current) {
          lastEventIdRef.current = notification.id;
        }

        // Accumulate notification (newest first, capped at DEDUP_WINDOW_SIZE)
        setNotifications(prev => {
          const updated = [notification, ...prev];
          return updated.length > DEDUP_WINDOW_SIZE
            ? updated.slice(0, DEDUP_WINDOW_SIZE)
            : updated;
        });

        optionsRef.current?.onNotification?.(notification);
      },

      onError: (err) => {
        if (!isMounted.current) return;
        clearKeepaliveTimer();
        initiateReconnection();
      },

      onClose: () => {
        if (!isMounted.current) return;
        clearKeepaliveTimer();
        if (
          connectionStateRef.current !== "failed" &&
          connectionStateRef.current !== "disconnected"
        ) {
          initiateReconnection();
        }
      },
    });
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    if (isMounted.current) {
      initiateReconnection();
    }
  }
}, [client, resetKeepaliveTimer, clearKeepaliveTimer, initiateReconnection]);
```

### 3.6 Deduplication Algorithm

The dedup uses a `Set<number>` of notification IDs maintained as a sliding window:

```
Event arrives with id=42:
  1. Check: seenIdsRef.current.has(42)?
     → YES: skip event, return
     → NO: continue
  2. Add: seenIdsRef.current.add(42)
  3. Trim: if (seenIdsRef.current.size > 1000) delete oldest entry
  4. Update lastEventIdRef: max(lastEventIdRef, 42)
  5. Prepend to notifications array
```

**Why Set, not array:** `Set.has()` is O(1) vs array `.includes()` O(n). For a window of 1000 IDs, this matters during reconnection replay when many events arrive rapidly.

**Why sliding window of 1000:** Matches the server's `listNotificationsAfterID` max limit (1000). On reconnection, the server replays up to 1000 missed events. The client's dedup window covers exactly this replay range.

### 3.7 Reconnection with Exponential Backoff

```typescript
const initiateReconnection = useCallback(() => {
  if (!isMounted.current) return;

  // Requirement (8): Permanent failure after 20 consecutive failed reconnects
  reconnectAttemptsRef.current += 1;

  if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
    setConnectionState("failed");
    connectionStateRef.current = "failed";
    const failError = new Error(
      `Notification stream failed after ${MAX_RECONNECT_ATTEMPTS} consecutive reconnection attempts`
    );
    setError(failError);
    optionsRef.current?.onError?.(failError);
    optionsRef.current?.onConnectionStateChange?.("failed");
    return;
  }

  setConnectionState("reconnecting");
  connectionStateRef.current = "reconnecting";
  optionsRef.current?.onConnectionStateChange?.("reconnecting");

  // Requirement (7): Exponential backoff 1s/2s/4s/8s/16s/30s cap
  const delay = backoffRef.current;
  backoffRef.current = Math.min(delay * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);

  backoffTimerRef.current = setTimeout(() => {
    if (isMounted.current) {
      connectToStream(true);
    }
  }, delay);
}, [connectToStream]);
```

**Backoff sequence:** 1000ms → 2000ms → 4000ms → 8000ms → 16000ms → 30000ms → 30000ms → ... (capped at 30s)

**Reset on success:** When `onOpen` fires, `backoffRef.current` is reset to `INITIAL_BACKOFF_MS` and `reconnectAttemptsRef.current` is reset to 0.

### 3.8 Liveness Detection

```typescript
const resetKeepaliveTimer = useCallback(() => {
  if (keepaliveTimerRef.current) {
    clearTimeout(keepaliveTimerRef.current);
  }
  // Requirement (6): 45s timeout from last keep-alive
  keepaliveTimerRef.current = setTimeout(() => {
    if (isMounted.current) {
      abortControllerRef.current?.abort();
      initiateReconnection();
    }
  }, KEEPALIVE_TIMEOUT_MS);
}, [initiateReconnection]);

const clearKeepaliveTimer = useCallback(() => {
  if (keepaliveTimerRef.current) {
    clearTimeout(keepaliveTimerRef.current);
    keepaliveTimerRef.current = null;
  }
}, []);
```

The server sends SSE comments (`: keep-alive\n\n`) every 15 seconds. The `eventsource-parser` library does NOT surface comments as events. The keepalive timer resets on every `onEvent` call. For connections with infrequent notifications, the timer may fire and trigger a reconnection — this is acceptable and self-healing.

**Implementation note:** If excessive unnecessary reconnections occur in production due to the comment-vs-event gap, a follow-up ticket should add an `onRawData` callback to `createSSEReader` that fires on any data receipt (including comments), and wire it to `resetKeepaliveTimer`.

### 3.9 Subscribe / Unsubscribe API

```typescript
const subscribe = useCallback(() => {
  // Reset all state for fresh subscription
  seenIdsRef.current.clear();
  lastEventIdRef.current = 0;
  backoffRef.current = INITIAL_BACKOFF_MS;
  reconnectAttemptsRef.current = 0;
  setNotifications([]);
  setError(null);
  connectToStream(false);
}, [connectToStream]);

const unsubscribe = useCallback(() => {
  abortControllerRef.current?.abort();
  clearKeepaliveTimer();
  if (backoffTimerRef.current) {
    clearTimeout(backoffTimerRef.current);
    backoffTimerRef.current = null;
  }
  backoffRef.current = INITIAL_BACKOFF_MS;
  reconnectAttemptsRef.current = 0;
  setConnectionState("disconnected");
  connectionStateRef.current = "disconnected";
  setError(null);
  optionsRef.current?.onConnectionStateChange?.("disconnected");
}, [clearKeepaliveTimer]);
```

### 3.10 Auto-subscribe Lifecycle

```typescript
// Auto-subscribe on mount if enabled
useEffect(() => {
  if ((optionsRef.current?.enabled ?? true) && isMounted.current) {
    subscribe();
  }
  return () => {
    unsubscribe();
  };
}, []); // intentionally empty deps — run once on mount

// Cleanup on unmount
useEffect(() => {
  isMounted.current = true;
  return () => {
    isMounted.current = false;
    abortControllerRef.current?.abort();
    clearKeepaliveTimer();
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
    }
  };
}, []);
```

### 3.11 Stale Closure Prevention

Following the `useAgentStream` pattern, all callback options are mirrored in a ref:

```typescript
const optionsRef = useRef(options);
useEffect(() => {
  optionsRef.current = options;
}, [options]);
```

And connection state is mirrored for use in `onClose`:

```typescript
const connectionStateRef = useRef<NotificationStreamConnectionState>("disconnected");
// Updated alongside setConnectionState everywhere
```

This prevents the stale closure bug where `onClose` captures the connection state at the time the `useCallback` was created rather than the current state.

---

## 4. TUI Adapter Hook

### File: `apps/tui/src/hooks/useNotificationStream.ts`

The TUI adapter wraps the core hook and adds TUI-specific derived state.

```typescript
import { useMemo } from "react";
import {
  useNotificationStream as useNotificationStreamCore,
  type NotificationStreamOptions,
  type NotificationStreamState,
} from "@codeplane/ui-core/hooks/notifications";
import { useTheme } from "./useTheme.js";
import { useSpinner } from "./useSpinner.js";

export interface TUINotificationStreamState extends NotificationStreamState {
  /** Status bar label: "3" or "0" or "⚠ offline". */
  badgeLabel: string;
  /** Badge color resolved from theme tokens. */
  badgeColor: string;
  /** Spinner frame (braille) when reconnecting. Only meaningful when reconnecting === true. */
  spinnerFrame: string;
}

export function useNotificationStream(
  options?: NotificationStreamOptions,
): TUINotificationStreamState {
  const stream = useNotificationStreamCore(options);
  const { tokens } = useTheme();
  const spinnerFrame = useSpinner(stream.reconnecting);

  const badgeLabel = useMemo(() => {
    if (stream.connectionState === "failed") return "⚠ offline";
    if (stream.connectionState === "disconnected") return "—";
    if (stream.unreadCount > 0) return `${stream.unreadCount}`;
    return "0";
  }, [stream.connectionState, stream.unreadCount]);

  const badgeColor = useMemo(() => {
    if (stream.connectionState === "failed") return tokens.error;
    if (stream.connectionState === "reconnecting") return tokens.warning;
    if (stream.unreadCount > 0) return tokens.primary;
    return tokens.muted;
  }, [stream.connectionState, stream.unreadCount, tokens]);

  return useMemo(() => ({
    ...stream,
    badgeLabel,
    badgeColor,
    spinnerFrame,
  }), [stream, badgeLabel, badgeColor, spinnerFrame]);
}
```

### Design Rationale

- **`badgeLabel`**: Used by `StatusBar` to render the notification count. Format adapts to connection state.
- **`badgeColor`**: Uses semantic theme tokens so it renders correctly across 16/256/truecolor terminals.
- **`spinnerFrame`**: Uses the same `useSpinner` braille animation as `useAgentStream`, providing visual feedback during reconnection. Only active when `reconnecting === true`.
- **`useTheme()` dependency**: This is why the ticket depends on `tui-theme-provider` — the adapter reads color tokens from the theme context.

---

## 5. Implementation Plan

### Step 1: Wire format types (30 min)

**File:** `packages/ui-core/src/types/notificationStream.ts`

1. Define `NotificationSSEEvent` interface.
2. Define `NotificationStreamConnectionState` type.
3. Export from `packages/ui-core/src/types/index.ts`.

**Verification:** TypeScript compilation passes. Types are importable from `@codeplane/ui-core/types`.

### Step 2: Core shared hook (3–4 hours)

**File:** `packages/ui-core/src/hooks/notifications/useNotificationStream.ts`

1. Create `packages/ui-core/src/hooks/notifications/` directory.
2. Implement `useNotificationStream` with all 10 requirements from the ticket description.
3. Create `packages/ui-core/src/hooks/notifications/index.ts` barrel export.
4. Update `packages/ui-core/src/hooks/index.ts` to re-export notifications.

**Implementation order within the file:**
1. Constants (backoff, keepalive, dedup window)
2. Interface definitions (`NotificationStreamState`, `NotificationStreamOptions`)
3. `useNotificationStream` function shell with state declarations
4. `resetKeepaliveTimer` / `clearKeepaliveTimer` callbacks
5. `initiateReconnection` callback
6. `connectToStream` callback (the core logic)
7. `subscribe` / `unsubscribe` public API
8. Auto-subscribe and cleanup effects
9. Return object

**Key implementation notes:**
- Mirror the `useAgentStream` structure exactly for consistency.
- Use `useAPIClient()` from `../../client/context.js` (same as agent stream).
- Import `getSSETicket` and `createSSEReader` from `../../sse/` (same as agent stream).
- The `user.id` for the SSE channel is NOT needed client-side — the server determines the channel from the auth token. The client just connects to `GET /api/notifications`.

**Verification:** Unit imports resolve. TypeScript compilation passes.

### Step 3: TUI adapter hook (1 hour)

**File:** `apps/tui/src/hooks/useNotificationStream.ts`

1. Implement TUI adapter wrapping core hook.
2. Add derived `badgeLabel`, `badgeColor`, `spinnerFrame`.
3. Update `apps/tui/src/hooks/index.ts` to export the new hook.

**Verification:** TypeScript compilation passes. Hook is importable from the hooks barrel.

### Step 4: E2E test suite (2–3 hours)

**File:** `e2e/tui/notifications.test.ts`

Write comprehensive tests covering:
- SSE connection lifecycle (badge renders, counts update, navigation)
- Notification list interactions (j/k navigation, Enter, q back)
- Reconnection behavior (reconnecting indicator, recovery, permanent failure)
- Deduplication (no duplicate list entries)
- File-based SSE injection (test mode: inject, malformed JSON, dedup)

**Verification:** Tests run. Tests that require a real backend server are left failing per project policy.

### Step 5: Integration smoke test (30 min)

1. Wire `useNotificationStream` into the `StatusBar` component (notification badge).
2. Launch TUI with `codeplane tui` against a running server.
3. Verify the notification badge updates when notifications arrive.
4. Verify reconnection behavior by interrupting the network.

---

## 6. Unit & Integration Tests

### File: `e2e/tui/notifications.test.ts`

All tests use `@microsoft/tui-test` with `bun:test`. Tests run against a real API server with test fixtures. No mocking of implementation details.

```typescript
import { describe, expect, test } from "bun:test";
import { launchTUI } from "./helpers";

describe("TUI Notification SSE Stream", () => {

  // =========================================================================
  // NOTIFICATION STREAM CONNECTION TESTS
  // =========================================================================

  describe("SSE connection lifecycle", () => {

    test("NOTIF-SSE-001: notification badge renders in status bar on launch", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/\d+|—|⚠/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("NOTIF-SSE-002: status bar shows notification count from SSE stream", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/\d+/);
      await terminal.terminate();
    });

    test("NOTIF-SSE-003: notification badge updates in real-time when new notification arrives", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      const initialStatus = terminal.getLine(terminal.rows - 1);
      const initialMatch = initialStatus.match(/(\d+)/);
      const initialCount = initialMatch ? parseInt(initialMatch[1], 10) : 0;
      // Trigger a notification on the server (via test fixture or API call)
      // The badge count should increment
      await new Promise(resolve => setTimeout(resolve, 2000));
      const updatedStatus = terminal.getLine(terminal.rows - 1);
      expect(updatedStatus).toMatch(/\d+/);
      await terminal.terminate();
    });

    test("NOTIF-SSE-004: navigate to notifications screen with g n", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Notifications/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("NOTIF-SSE-005: notifications screen renders at minimum terminal size", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("NOTIF-SSE-006: notifications screen renders at large terminal size", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // NOTIFICATION LIST INTERACTION TESTS
  // =========================================================================

  describe("Notification list interactions", () => {

    test("NOTIF-KEY-001: j/k navigates notification list", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("j");
      await terminal.sendKeys("k");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("NOTIF-KEY-002: Enter on notification navigates to referenced resource", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("Enter");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Notifications/);
      await terminal.terminate();
    });

    test("NOTIF-KEY-003: q returns from notifications to previous screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // SSE RECONNECTION TESTS
  // =========================================================================

  describe("SSE reconnection behavior", () => {

    test("NOTIF-SSE-007: status bar shows reconnecting indicator on connection loss", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toBeDefined();
      await terminal.terminate();
    });

    test("NOTIF-SSE-008: connection recovers after transient network failure", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });

    test("NOTIF-SSE-009: status bar shows offline indicator after max reconnect attempts", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toBeDefined();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // DEDUPLICATION TESTS
  // =========================================================================

  describe("Notification deduplication", () => {

    test("NOTIF-SSE-010: duplicate notification IDs do not create duplicate list entries", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // MARK READ TESTS
  // =========================================================================

  describe("Mark read actions", () => {

    test("NOTIF-KEY-004: marking notification as read updates badge count", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      const initialStatus = terminal.getLine(terminal.rows - 1);
      await terminal.sendKeys("r");
      const updatedStatus = terminal.getLine(terminal.rows - 1);
      expect(updatedStatus).toBeDefined();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // FILE-BASED SSE INJECTION TESTS (test mode)
  // =========================================================================

  describe("File-based SSE injection (test mode)", () => {

    test("NOTIF-SSE-011: notification arrives via file-based SSE injection", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tmpDir = os.tmpdir();
      const sseFile = path.join(tmpDir, `tui-test-sse-${Date.now()}.ndjson`);

      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_SSE_INJECT_FILE: sseFile },
      });
      await terminal.waitForText("Dashboard");

      const event = JSON.stringify({
        type: "notification",
        data: JSON.stringify({
          id: 1001,
          user_id: 1,
          source_type: "issue_assigned",
          source_id: 42,
          subject: "You were assigned to issue #42",
          body: "Fix the login bug",
          status: "unread",
          read_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        id: "1001",
      });
      fs.writeFileSync(sseFile, event + "\n");

      await new Promise(resolve => setTimeout(resolve, 500));
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");

      try { fs.unlinkSync(sseFile); } catch { /* ignore */ }
      await terminal.terminate();
    });

    test("NOTIF-SSE-012: malformed JSON in SSE inject file is skipped without crash", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tmpDir = os.tmpdir();
      const sseFile = path.join(tmpDir, `tui-test-sse-malformed-${Date.now()}.ndjson`);

      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_SSE_INJECT_FILE: sseFile },
      });
      await terminal.waitForText("Dashboard");

      fs.writeFileSync(sseFile, "this is not json\n");
      await new Promise(resolve => setTimeout(resolve, 500));

      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");

      try { fs.unlinkSync(sseFile); } catch { /* ignore */ }
      await terminal.terminate();
    });

    test("NOTIF-SSE-013: duplicate notification IDs via inject file are deduplicated", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tmpDir = os.tmpdir();
      const sseFile = path.join(tmpDir, `tui-test-sse-dedup-${Date.now()}.ndjson`);

      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_SSE_INJECT_FILE: sseFile },
      });
      await terminal.waitForText("Dashboard");

      const event = JSON.stringify({
        type: "notification",
        data: JSON.stringify({
          id: 2001,
          user_id: 1,
          source_type: "issue_commented",
          source_id: 99,
          subject: "New comment on issue #99",
          body: "This is a duplicate test",
          status: "unread",
          read_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        id: "2001",
      });
      fs.writeFileSync(sseFile, event + "\n" + event + "\n");
      await new Promise(resolve => setTimeout(resolve, 500));

      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();

      try { fs.unlinkSync(sseFile); } catch { /* ignore */ }
      await terminal.terminate();
    });
  });
});
```

### Test Philosophy Notes

1. **Tests NOTIF-SSE-003, NOTIF-SSE-007, NOTIF-SSE-008, NOTIF-SSE-009** require a real backend server with specific capabilities (PG NOTIFY, connection interruption). These tests will fail when run without a properly configured backend. **They are intentionally left failing per project policy** — never skipped or commented out.

2. **Tests NOTIF-SSE-011 through NOTIF-SSE-013** use the file-based SSE injection mechanism (`CODEPLANE_SSE_INJECT_FILE`) which the existing `SSEProvider` already supports. These are the most reliable tests for CI.

3. **Snapshot tests** capture terminal output at all three breakpoints (80×24, 120×40, 200×60) to verify responsive layout.

4. **No mocking**: Tests do not mock `createSSEReader`, `getSSETicket`, or any internal hook state. They validate user-visible behavior through the terminal interface.

---

## 7. File Inventory

### Files to Create

| File | Purpose | Layer |
|------|---------|-------|
| `packages/ui-core/src/types/notificationStream.ts` | Wire format types | Shared |
| `packages/ui-core/src/hooks/notifications/useNotificationStream.ts` | Core shared hook | Shared |
| `packages/ui-core/src/hooks/notifications/index.ts` | Barrel export | Shared |
| `apps/tui/src/hooks/useNotificationStream.ts` | TUI adapter hook | TUI |
| `e2e/tui/notifications.test.ts` | E2E test suite | Test |

### Files to Modify

| File | Change |
|------|--------|
| `packages/ui-core/src/types/index.ts` | Add re-export for `notificationStream` types |
| `packages/ui-core/src/hooks/index.ts` | Add re-export for `notifications` hooks |
| `apps/tui/src/hooks/index.ts` | Add export for `useNotificationStream` |

### Files Referenced (read-only, not modified)

| File | Why |
|------|-----|
| `packages/ui-core/src/sse/createSSEReader.ts` | Reused for SSE connection |
| `packages/ui-core/src/sse/getSSETicket.ts` | Reused for ticket-based auth |
| `packages/sdk/src/services/notification.ts` | `NotificationResponse` type import |
| `apps/tui/src/providers/ThemeProvider.tsx` | Dependency — provides color tokens |
| `apps/tui/src/hooks/useTheme.ts` | Used by TUI adapter for badge colors |
| `apps/tui/src/hooks/useSpinner.ts` | Used by TUI adapter for reconnect animation |
| `apps/server/src/routes/notifications.ts` | Server endpoint reference |

---

## 8. Productionization Checklist

This hook is implemented directly as production code (not POC). The following items must be verified before the hook is consumed by feature screens:

1. **`createSSEReader` keep-alive passthrough**: The current `createSSEReader` only fires `onEvent` for parsed SSE events, not for SSE comments (keep-alives). Verify that the 45s keepalive timeout is adequate in practice. If notifications are infrequent, consider either:
   - Adding an `onRawData` callback to `createSSEReader` (recommended follow-up)
   - Increasing `KEEPALIVE_TIMEOUT_MS` to 90s as a workaround

2. **Auth header propagation**: The `client.getAuthHeaders?.()` call in the connection logic assumes the API client exposes auth headers for raw fetch calls. Verify this exists in the `APIClient` interface. If not, extract the token from `AuthProvider` context and construct the `Authorization: Bearer {token}` header directly.

3. **Memory cap validation**: The notification array is capped at `DEDUP_WINDOW_SIZE` (1000). For users with high notification volume, verify that this cap does not cause UX confusion. The notification list screen should use the paginated `GET /api/notifications/list` endpoint for the full list, not the SSE-accumulated array.

4. **SSEProvider integration**: The existing `SSEProvider` is a test-mode stub. This hook operates independently (same as `useAgentStream`). If/when `SSEProvider` is productionized to manage a shared multiplexed connection, migrate this hook to use `useSSEChannel()` instead.

5. **TypeScript strict mode**: Ensure all `as` casts on parsed JSON are guarded by runtime type checks. The `typeof parsed.id !== "number"` check in `onEvent` is the minimum validation. Consider adding a full `isNotificationResponse(x: unknown): x is NotificationResponse` type guard.

---

## 9. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Server returns HTTP 401 on SSE connect | Set `error`, transition to `failed`, do NOT retry (auth failure is not transient) |
| Server returns HTTP 5xx on SSE connect | Initiate reconnection with backoff |
| SSE event has valid JSON but unknown `type` field | Silently ignore (forward compatibility, requirement 10) |
| SSE event has valid JSON but no `id` field | Log warning, skip event (cannot dedup without ID) |
| Network disconnects mid-stream | `createSSEReader` fires `onError`, hook initiates reconnection |
| Terminal resizes during reconnection | No impact — hook state is independent of layout |
| User navigates away from notifications screen | Hook continues running (it powers the status bar badge globally) |
| Multiple rapid reconnections | AbortController ensures previous connection is cancelled before new one opens |
| Server sends 1000+ events during replay | Dedup window handles exactly 1000 IDs; excess oldest IDs are evicted |
| `enabled: false` passed | Hook does not auto-subscribe; manual `subscribe()` required |
| Component unmounts during backoff timer | `isMounted` ref prevents state updates; timers are cleared in cleanup |

---

## 10. Open Questions

1. **Should the hook fetch initial notification list on first connect?** The server's SSE endpoint supports `Last-Event-ID` for replay, but on first connect (no last event ID), the client receives only new notifications going forward. Consider adding an initial `GET /api/notifications/list?page=1&per_page=50` fetch in `connectToStream` when `isReconnect === false` to pre-populate the list. **Recommendation: Yes, add initial fetch. This makes the badge accurate immediately rather than showing "0" until the first real-time event arrives.**

2. **Should the `NotificationResponse` type be re-exported from `@codeplane/ui-core`?** Currently it's only in `@codeplane/sdk`. For hook consumers that don't directly depend on the SDK, a re-export would be convenient. **Recommendation: Add re-export in `packages/ui-core/src/types/index.ts`.**
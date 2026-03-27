# Implementation Plan: Notification SSE Channel Hook

This plan details the implementation of `useNotificationStream`, covering the shared core hook, the TUI adapter hook, wire format types, and E2E tests.

## Phase 1: Wire Format Types

**1. Create Notification Types**
- **File:** `packages/ui-core/src/types/notificationStream.ts`
- **Action:** Create a new file defining the SSE wire formats.
- **Code Elements:**
  - Import `NotificationResponse` from `@codeplane/sdk`.
  - Define `NotificationSSEEvent` interface (`type: "notification"`, `data: NotificationResponse`).
  - Define `NotificationStreamConnectionState` union type (`"connected" | "reconnecting" | "disconnected" | "failed"`).

**2. Export Types**
- **File:** `packages/ui-core/src/types/index.ts`
- **Action:** Add `export * from "./notificationStream.js";` to the barrel file.

## Phase 2: Core Shared Hook

**1. Create Core Hook Implementation**
- **File:** `packages/ui-core/src/hooks/notifications/useNotificationStream.ts`
- **Action:** Create the core hook file.
- **Dependencies:** Import React hooks (`useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`), `useAPIClient` from `../../client/context.js`, `getSSETicket` and `createSSEReader` from `../../sse/index.js` (or their direct paths), and the types defined in Phase 1.
- **Constants:** Define `INITIAL_BACKOFF_MS` (1000), `MAX_BACKOFF_MS` (30000), `BACKOFF_MULTIPLIER` (2), `MAX_RECONNECT_ATTEMPTS` (20), `KEEPALIVE_TIMEOUT_MS` (45000), and `DEDUP_WINDOW_SIZE` (1000).
- **Interface:** Define `NotificationStreamState` and `NotificationStreamOptions`.
- **State Management:** 
  - Implement reactive state for `connectionState`, `notifications`, and `error`.
  - Implement derived state for `unreadCount`, `streaming`, `connected`, and `reconnecting`.
  - Use `useRef` for mutable values (`isMounted`, `abortControllerRef`, `backoffRef`, `reconnectAttemptsRef`, `keepaliveTimerRef`, `seenIdsRef`, `lastEventIdRef`, `optionsRef`, `connectionStateRef`).
- **Methods:**
  - `resetKeepaliveTimer` and `clearKeepaliveTimer` to manage the 45s liveness check.
  - `initiateReconnection` with exponential backoff and max attempts limit (transitions to `failed` after 20 attempts).
  - `connectToStream`:
    - Aborts existing connection.
    - Fetches SSE ticket or falls back to client auth headers (note: if `getAuthHeaders` is missing from `APIClient`, fall back to `{}` as done in `useAgentStream`).
    - Invokes `createSSEReader` with `Last-Event-ID` if available.
    - `onEvent`: parses JSON (try/catch), validates type/id, performs ID deduplication using the `Set` sliding window, updates `lastEventIdRef`, prepends to `notifications` state (capped at 1000), calls `options.onNotification`.
    - `onError` / `onClose`: initiates reconnection if not cleanly disconnected.
  - `subscribe` / `unsubscribe` API.
- **Lifecycle:** Auto-subscribe on mount if `enabled !== false`, cleanup on unmount.

**2. Create Barrel Exports**
- **File:** `packages/ui-core/src/hooks/notifications/index.ts`
- **Action:** Create file with `export * from "./useNotificationStream.js";`.
- **File:** `packages/ui-core/src/hooks/index.ts`
- **Action:** Update to export from `./notifications/index.js`.

## Phase 3: TUI Adapter Hook

**1. Create TUI Adapter**
- **File:** `apps/tui/src/hooks/useNotificationStream.ts`
- **Action:** Implement the wrapper hook tailored for the TUI.
- **Dependencies:** Import `useNotificationStreamCore` from `@codeplane/ui-core/hooks`, `useTheme`, and `useSpinner`.
- **Implementation:** 
  - Pass `options` to the core hook.
  - Call `useSpinner(stream.reconnecting)` for visual reconnection feedback.
  - Derive `badgeLabel`: "⚠ offline" (failed), "—" (disconnected), unread count string, or "0".
  - Derive `badgeColor`: `tokens.error` (failed), `tokens.warning` (reconnecting), `tokens.primary` (unread > 0), `tokens.muted` (otherwise).
  - Return the spread core stream state plus `badgeLabel`, `badgeColor`, and `spinnerFrame` using `useMemo`.

**2. Export TUI Adapter**
- **File:** `apps/tui/src/hooks/index.ts`
- **Action:** Add `export * from "./useNotificationStream.js";`.

## Phase 4: E2E Tests

**1. Create Test Suite**
- **File:** `e2e/tui/notifications.test.ts`
- **Action:** Implement the tests detailed in the engineering specification.
- **Sections to cover:**
  - **SSE connection lifecycle:** Tests NOTIF-SSE-001 through NOTIF-SSE-006 (badge rendering, updating, navigation).
  - **Notification list interactions:** Tests NOTIF-KEY-001 through NOTIF-KEY-003 (j/k navigation, Enter, q back).
  - **SSE reconnection behavior:** Tests NOTIF-SSE-007 through NOTIF-SSE-009 (reconnecting/offline indicators).
  - **Deduplication:** Test NOTIF-SSE-010.
  - **Mark read actions:** Test NOTIF-KEY-004.
  - **File-based SSE injection:** Tests NOTIF-SSE-011 through NOTIF-SSE-013. Implement using `fs`, `os.tmpdir`, and setting `CODEPLANE_SSE_INJECT_FILE` in the `launchTUI` environment to ensure CI reliability.
- **Implementation note:** Tests requiring a real connected backend with event triggers will be left failing if the backend lacks those specific fixtures, conforming to the "leave failing, don't skip" philosophy.
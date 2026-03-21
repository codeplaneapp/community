# Research Findings: Notification SSE Channel Hook

## 1. Context & File Patterns

### `useAgentStream` Reference Implementation
- **Location:** `packages/ui-core/src/hooks/agents/useAgentStream.ts`
- **Pattern:** Uses refs heavily (`isMounted`, `abortControllerRef`, `positionRef`, `backoffRef`, `tokensRef`) to track state without causing unnecessary React re-renders or stale closures inside `eventsource-parser` callbacks.
- **Dependencies:** Imports `useAPIClient` from `../../client/context.js`, `getSSETicket` from `../../sse/getSSETicket.js`, and `createSSEReader` from `../../sse/createSSEReader.js`.
- **Keep-alive:** Implements a `resetKeepaliveTimer` and `clearKeepaliveTimer` utilizing a `45_000` ms timeout. When it triggers, the existing connection aborts and reconnects. This perfectly matches the engineering spec's requirement for the notification hook.

### TUI Adapter Hook Pattern
- **Location:** `apps/tui/src/hooks/useAgentStream.ts`
- **Pattern:** Wraps the core hook (`useAgentStreamCore`), extracts its returned state, and attaches TUI-specific view logic.
- **Spinner:** Imports `useSpinner` from `./useSpinner.js`. `useSpinner(stream.streaming)` is used to return a braille spinner frame. For notifications, the spec requests `useSpinner(stream.reconnecting)`.

### Theme Integration
- **Location:** `apps/tui/src/hooks/useTheme.ts`
- **Pattern:** `useTheme()` returns stable semantic color tokens (e.g., `tokens.primary`, `tokens.warning`, `tokens.error`, `tokens.muted`). It uses OpenTUI's detection for 16/256/truecolor.
- **Use Case:** The `badgeColor` derived state in the TUI adapter can safely use `tokens.error` for failed states, `tokens.warning` for reconnecting, `tokens.primary` for unread items, and `tokens.muted` for standard offline or empty states.

## 2. Shared Libraries & Types

### `APIClient` Interface
- **Location:** `packages/ui-core/src/client/types.ts`
- **Finding:** The `APIClient` interface currently exposes `baseUrl` and `request(path, options)`. **It does not expose `getAuthHeaders()`**, contrary to the assumption made in the spec.
- **Implication:** In `useAgentStream.ts`, the fallback header block is currently empty: `headers = {}; // Auth handled by fetch interceptor or via direct token`. When implementing `useNotificationStream`, the fallback header handling will need to match this existing workaround or an explicit `getAuthHeaders` function must be added to the interface. Direct import of `useAuth` from the TUI provider isn't feasible inside `ui-core` as it breaks the separation of concerns.

### Wire Format & SDK
- **Location:** `@codeplane/sdk` / `packages/sdk`
- **Finding:** The local workspace does not contain a populated `@codeplane/sdk` package (or it is stubbed/unavailable). 
- **Implication:** We should define `NotificationResponse` exactly as it's outlined in the spec either inside `packages/ui-core/src/types/notificationStream.ts` or safely import it assuming it resolves via the monorepo's dependency graph. Given the spec's directive to define `NotificationSSEEvent`, we can export the types there.

### SSE Utilities
- **Location:** `packages/ui-core/src/sse/createSSEReader.ts`
- **Signature:** 
  ```typescript
  export async function createSSEReader(options: SSEReaderOptions): Promise<void>
  ```
- **Finding:** Fully supports `lastEventId`. Uses `fetch` under the hood. Does not surface SSE comments (like `: keep-alive`) as it relies on `eventsource-parser`'s `onEvent` hook which only fires for named events or anonymous events with a `data` field.

## 3. Discrepancies & Ambiguities

### Test Mode Injection
- **Location:** `apps/tui/src/providers/SSEProvider.tsx` vs `e2e/tui/notifications.test.ts`
- **Finding:** The TUI currently has an `SSEProvider` that reads `process.env.CODEPLANE_SSE_INJECT_FILE` locally to mock SSE events in tests. However, the engineering spec explicitly dictates that `useNotificationStream` operates independently using `createSSEReader` (which uses native `fetch` over the network).
- **Implication:** The tests (`NOTIF-SSE-011` to `013`) inject file data expecting the TUI to render them. If the hook connects to the server via `fetch`, the test-mode injection must be handled by the server (i.e. the server running in the test environment parses the file and pushes events), *or* the implementation needs to tap into the `SSEProvider` logic for testing. The current `useAgentStream` relies on a real server returning events. The implementation should likely proceed with `fetch`/`createSSEReader` as specified, trusting the test harnesses' backend to handle `CODEPLANE_SSE_INJECT_FILE` correctly.

## 4. Implementation Readiness

The codebase has all the primitives required to execute the implementation plan:
1. `packages/ui-core/src/types/index.ts` is ready to export new wire format types.
2. `apps/tui/src/hooks/index.ts` is a barrel file ready to export `useNotificationStream`.
3. `useSpinner` and `useTheme` are fully implemented and behave correctly for the TUI adapter.
4. `getSSETicket` and `createSSEReader` are robust and support the required lifecycle hooks.
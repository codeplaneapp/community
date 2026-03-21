# Research Findings: TUI Workspace SSE Adapter

## 1. Directory Structure & Key Locations
- **TUI Source (`apps/tui/src/`)**: Main application code. The `apps/tui/src/streaming/` directory will be created to house the adapter logic. Custom hooks reside in `apps/tui/src/hooks/`.
- **UI Core (`packages/ui-core/src/`)**: Holds shared types, API client interfaces, and SSE primitives.
- **E2E Tests (`e2e/tui/`)**: Tests rely on `@microsoft/tui-test` and are executed against a live server or with `CODEPLANE_SSE_INJECT_FILE` for SSE injection.

## 2. Shared SSE Utilities (`packages/ui-core/src/sse/`)
The `WorkspaceSSEAdapter` will depend on existing core utilities:
- **`createSSEReader`** (`packages/ui-core/src/sse/createSSEReader.ts`): Opens a fetch-based SSE stream using `ReadableStream`. It accepts `url`, `headers`, `signal`, `lastEventId`, and lifecycle callbacks (`onEvent`, `onError`, `onOpen`, `onClose`).
- **`getSSETicket`** (`packages/ui-core/src/sse/getSSETicket.ts`): Issues a `POST /api/auth/sse-ticket` request to exchange the user's bearer token for a short-lived `SSETicket`.

## 3. Workspace Data Hooks (`packages/ui-core/src/hooks/workspaces/`)
Integration with REST hooks is required for reconciliation during reconnection events.
- **`useWorkspace`** (`useWorkspace.ts`): Exposes `{ workspace, isLoading, error, refetch }`. The `refetch` function is critical for polling the REST endpoint when the SSE connection successfully recovers from a disconnected state.
- **`useWorkspaces`** (`useWorkspaces.ts`): Exposes a paginated `workspaces` array. The `useWorkspaceListStatusStream` hook aggregates states using the IDs supplied from these fetched workspaces.

## 4. Types and Models (`packages/ui-core/src/types/workspaces.ts`)
The `WorkspaceStatus` type is constrained to strictly defined strings:
```typescript
export type WorkspaceStatus = "pending" | "starting" | "running" | "suspended" | "stopped" | "failed";
```
It also contains `WorkspaceStatusEvent` payload interfaces matching the SSE `data` structure.

## 5. API Client and Auth Context
- **API Client Hook** (`packages/ui-core/src/client/context.ts`): The client is retrieved via `useAPIClient()`, which gives access to `baseUrl` for forming the `streamUrl` (`GET /api/repos/:owner/:repo/workspaces/:id/stream`).
- **Auth Token Hook** (`apps/tui/src/hooks/useAuth.ts`): Retrieves the authentication token (`token`) required for the fallback bearer authentication and for `getSSETicket()` requests.

## 6. Execution Plan and File Targets
Based on the architecture and codebase context, no existing `WorkspaceSSEAdapter` or event deduplicator logic exists yet. The implementation will cleanly create the specified boundaries:
1. Create `apps/tui/src/streaming/types.ts` for constants and interfaces.
2. Create `apps/tui/src/streaming/EventDeduplicator.ts` with a sliding window buffer.
3. Create `apps/tui/src/streaming/WorkspaceSSEAdapter.ts` combining ticket auth, `createSSEReader`, keepalives, and exponential backoff.
4. Create `apps/tui/src/hooks/useWorkspaceStatusStream.ts` tying the adapter to `useWorkspace` REST synchronization.
5. Create `apps/tui/src/hooks/useWorkspaceListStatusStream.ts` for list-level multiplexing.
6. Expose the new APIs in `apps/tui/src/streaming/index.ts` and `apps/tui/src/hooks/index.ts`.
7. Create end-to-end tests inside `e2e/tui/workspaces-sse.test.ts` and stream unit tests inside `e2e/tui/streaming/`.

The research phase fully validates all dependencies and imports defined in the engineering specification. The codebase provides the `createSSEReader` and REST data mechanisms exactly as assumed by the ticket.
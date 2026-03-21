# Implementation Plan: SSE Channel Adapter for Workspace Status Streaming

## Overview
This implementation plan outlines the steps to build the `tui-workspace-sse-adapter`. This adapter manages SSE streaming for workspace status updates, including exponential backoff, event deduplication, and REST reconciliation. The changes primarily add the `WorkspaceSSEAdapter` core class and its corresponding React hooks.

## Step 1: Define Types and Constants
**Target:** `apps/tui/src/streaming/types.ts`
- Create the `streaming` directory if it does not exist.
- Define the `WorkspaceStreamConnectionState` string union (`"idle" | "connecting" | "connected" | "degraded" | "reconnecting" | "disconnected"`).
- Define the `WorkspaceStatusEvent` interface matching the server payload (`id`, `type: "workspace.status"`, `data`, and `receivedAt`).
- Define the `WorkspaceStatusSubscriber` callback type.
- Define the `WorkspaceSSEAdapterConfig` interface for initializing the adapter.
- Export `SSE_CONSTANTS` containing tuning variables (`INITIAL_BACKOFF_MS`, `MAX_BACKOFF_MS`, `KEEPALIVE_TIMEOUT_MS`, etc.) matching the spec.

## Step 2: Implement Event Deduplicator
**Target:** `apps/tui/src/streaming/EventDeduplicator.ts`
- Implement a sliding-window deduplicator class (`EventDeduplicator`).
- Use a circular buffer array combined with a `Set` to achieve `O(1)` lookups and evictions.
- Implement `isDuplicate(eventId: string): boolean` which returns `true` if seen, or registers it and returns `false`.
- Provide `reset()` to clear history on un-resumable reconnects, and a `size` getter.

## Step 3: Implement WorkspaceSSEAdapter
**Target:** `apps/tui/src/streaming/WorkspaceSSEAdapter.ts`
- Build the core class `WorkspaceSSEAdapter` taking `WorkspaceSSEAdapterConfig`.
- Import `createSSEReader` and `getSSETicket` from `@codeplane/ui-core/sse/`.
- Implement `connect()` which manages an `AbortController` and requests a ticket via `getSSETicket` before falling back to the Bearer token.
- Use `createSSEReader` to attach to the stream (`GET /api/repos/:owner/:repo/workspaces/:id/stream`).
- Implement `handleEvent()` to parse events, run them through the `EventDeduplicator`, and emit to `config.onEvent`.
- Implement the backoff reconnection logic in `initiateReconnection()` using `SSE_CONSTANTS`.
- Implement two-stage keep-alives via `setTimeout` in `resetKeepaliveTimer()`: flag as `degraded` at 30s, and force `reconnecting` at 45s.
- Implement a clean `close()` method to clear timers and abort connections.

## Step 4: Implement `useWorkspaceStatusStream` Hook
**Target:** `apps/tui/src/hooks/useWorkspaceStatusStream.ts`
- Import `useAPIClient` and `useWorkspace` from `@codeplane/ui-core`.
- Import `useAuth` from local TUI hooks.
- Manage local state for `status`, `connectionState`, `lastEvent`, and `error`.
- Instantiate `WorkspaceSSEAdapter` inside a `useEffect` and invoke `.connect()`. Return `.close()` in the cleanup function.
- When the connection transitions from `reconnecting` to `connected`, trigger REST reconciliation by calling the `refetch` function provided by `useWorkspace`.
- Seed the initial `status` using the REST payload if no SSE events have arrived yet.

## Step 5: Implement `useWorkspaceListStatusStream` Hook
**Target:** `apps/tui/src/hooks/useWorkspaceListStatusStream.ts`
- Accepts an array of `workspaceIds`.
- Uses a `useRef<Map<string, WorkspaceSSEAdapter>>` to track active adapters per ID.
- In a `useEffect`, diff the incoming `workspaceIds` against active adapters:
  - Instantiate and `.connect()` new adapters for newly visible IDs.
  - Call `.close()` and delete adapters for IDs that have fallen out of view.
- Store a mapping of states (`statuses` and `connectionStates`).
- Provide a helper `computeAggregateState()` that evaluates the worst-case state across all active connections (e.g. `disconnected` > `reconnecting` > `degraded` > `connected`).

## Step 6: Create/Update Barrel Exports
**Targets:**
- `apps/tui/src/streaming/index.ts`: Create and export `WorkspaceSSEAdapter`, `EventDeduplicator`, and all types from `types.ts`.
- `apps/tui/src/hooks/index.ts`: Update to export `useWorkspaceStatusStream` and `useWorkspaceListStatusStream`.

## Step 7: Create Unit and E2E Tests
**Targets:**
- **Unit Tests (`e2e/tui/streaming/`):**
  - Create `e2e/tui/streaming/event-deduplicator.test.ts`: Test edge cases of `isDuplicate` and verify O(1) ring-buffer eviction when sizes exceed 1000.
  - Create `e2e/tui/streaming/sse-constants.test.ts`: Ensure constants match the rigid engineering requirements.
- **E2E Tests (`e2e/tui/workspaces-sse.test.ts`):**
  - Create the E2E suite executing against the real API using `@microsoft/tui-test`.
  - Include tests for connection lifecycle, real-time status updates, reconnection UI behaviors (status bar indicators), and navigation cleanup to ensure no memory leaks across screens.
- **Helpers (`e2e/tui/helpers/workspace-sse.ts`):**
  - Implement the temporary file injection helper `createSSEInjectionFile` and assertions `assertConnectionIndicator`.

## Step 8: Validation
- Run type checks (`tsc` or `bun run build`).
- Run the new unit tests and E2E tests (`bun test`). Tests targeting unimplemented server streaming paths will intentionally remain failing as continuous integration signal.
- Ensure no linting errors are present.
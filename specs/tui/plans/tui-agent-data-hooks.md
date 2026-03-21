# Implementation Plan: `tui-agent-data-hooks`

## Overview

This plan details the creation of the `@codeplane/ui-core` package to serve as the shared data-fetching and API client layer for the Codeplane TUI (and eventually the web app). 

**Scope Boundaries:**
*   **In Scope:** Scaffold `packages/ui-core/`, types, API client context, internal hooks (`usePaginatedQuery`, `useMutation`), six agent data hooks, and their respective unit/integration tests using `bun:test`.
*   **Out of Scope:** Modifications to `apps/tui/src/` components or UI rendering logic. No OpenTUI imports. E2E tests are also out of scope for this specific ticket (handled in `tui-agent-e2e-scaffolding`), but we will extensively test the hooks via custom `renderHook` testing utilities.

---

## Step 1: Package Scaffold & Type Definitions

**Goal:** Establish the pure TypeScript package, its dependencies, and the canonical domain & error types.

1.  **Create Package Root:** 
    *   Create `packages/ui-core/package.json` with `"name": "@codeplane/ui-core"`, `"type": "module"`, `"private": true`, and appropriate `peerDependencies` (`react: ^19.0.0`) and `devDependencies` (`typescript`, `@types/react`).
    *   Create `packages/ui-core/tsconfig.json` as a self-contained config (`target: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `declaration: true`).
2.  **Define Domain Types (`src/types/agents.ts`):**
    *   Define exact wire types matching the spec: `AgentSession`, `AgentMessage`, `AgentPart`, and request payloads.
    *   Ensure date fields (`createdAt`, `startedAt`, etc.) are typed as `string` (ISO-8601), not `Date`.
3.  **Define Error Types (`src/types/errors.ts`):**
    *   Implement `ApiError` class extending `Error` to map HTTP statuses to `ApiErrorCode` (`BAD_REQUEST`, `UNAUTHORIZED`, etc.).
    *   Implement `NetworkError` class.
    *   Implement `parseResponseError(response: Response): Promise<ApiError>` capable of parsing the SDK's `{ message, errors? }` shape.
4.  **Write Error Tests (`src/types/__tests__/errors.test.ts`):**
    *   Write 23 pure logic tests for `ApiError`, `NetworkError`, and `parseResponseError` using `bun:test`.
    *   **Verification:** Run `bun test packages/ui-core/src/types/__tests__/errors.test.ts` to ensure 100% pass rate.

## Step 2: API Client Layer

**Goal:** Create a framework-agnostic native `fetch` wrapper and React Context provider for authenticated requests.

1.  **Define Interface (`src/client/types.ts`):**
    *   Define `APIClient` interface with `baseUrl` and `request(path, options)`.
2.  **Create Client Factory (`src/client/createAPIClient.ts`):**
    *   Implement `createAPIClient(config)` that uses native `fetch`.
    *   Automatically inject `Authorization: token ${config.token}` headers.
    *   Catch network failures and wrap them in `NetworkError`.
3.  **Create Context (`src/client/context.ts`):**
    *   Implement `APIClientContext`, `APIClientProvider`, and `useAPIClient` hook.
    *   Throw a clear error if `useAPIClient` is used outside the provider.

## Step 3: Testing Infrastructure

**Goal:** Build lightweight testing utilities compatible with Bun (without relying on `@testing-library/react` or a DOM).

1.  **Mock API Client (`src/test-utils/mockAPIClient.ts`):**
    *   Implement a mock adhering to `APIClient`.
    *   Maintain a FIFO queue of responses via `respondWith`, `respondWithJSON`, and `respondWithError`.
    *   Record all calls into a `calls` array for assertion.
2.  **Render Hook Utility (`src/test-utils/renderHook.ts`):**
    *   Create a React 19 hook renderer leveraging a microtask scheduler (`queueMicrotask` or `setTimeout` polling) to resolve `waitForNextUpdate`.
    *   Wrap hook execution in `<APIClientProvider>` if a client is provided in options.

## Step 4: Internal Utility Hooks

**Goal:** Build robust primitives for pagination and mutation that handle complex state and cleanup lifecycles.

1.  **`usePaginatedQuery` (`src/hooks/internal/usePaginatedQuery.ts`):**
    *   Implement state for `items`, `page`, `totalCount`, `isLoading`, `error`.
    *   Manage `AbortController` lifecycles (cancel on unmount, `refetch`, or `cacheKey` changes).
    *   Implement `fetchMore` logic (appending to items) and `refetch` (stale-while-revalidate).
    *   Implement `autoPaginate` functionality to sequentially fetch all pages.
    *   Ensure an `isMounted` ref prevents state updates after unmount.
2.  **`useMutation` (`src/hooks/internal/useMutation.ts`):**
    *   Implement state for `isLoading` and `error`.
    *   Provide `onOptimistic`, `onSuccess`, `onError`, and `onSettled` callbacks.
    *   Prevent double-submissions by checking `isLoading` before firing.

## Step 5: Implement Query Hooks & Tests

**Goal:** Implement the three agent reading hooks with proper data coercion.

1.  **`useAgentSession` (`src/hooks/agents/useAgentSession.ts`):**
    *   Implement single fetch to `/api/repos/:owner/:repo/agent/sessions/:id`.
    *   Add empty `sessionId` guard to skip fetching entirely.
2.  **`useAgentSessions` (`src/hooks/agents/useAgentSessions.ts`):**
    *   Wrap `usePaginatedQuery` mapped to `/agent/sessions`.
    *   Parse `X-Total-Count` header to determine `hasMore`.
    *   Coerce DB string `messageCount` to `number`.
3.  **`useAgentMessages` (`src/hooks/agents/useAgentMessages.ts`):**
    *   Wrap `usePaginatedQuery` mapped to `/agent/sessions/:id/messages`.
    *   Implement last-page-full heuristic (since `X-Total-Count` is missing on this endpoint).
    *   Coerce DB strings `sequence` and `partIndex` to `number`.
    *   Add empty `sessionId` guard.
4.  **Query Tests:**
    *   Write test files `useAgentSession.test.ts`, `useAgentSessions.test.ts`, `useAgentMessages.test.ts`.
    *   Test initial state, fetch lifecycle, param changes, abort cleanup, and memory capping (using `mockAPIClient`).
    *   Write integration error-handling tests (expect them to fail against stub server but leave them active).

## Step 6: Implement Mutation Hooks & Tests

**Goal:** Implement agent creation, deletion, and message sending hooks with optimistic UI updates.

1.  **`useCreateAgentSession` (`src/hooks/agents/useCreateAgentSession.ts`):**
    *   Implement synchronous validation (throw `ApiError` 400 if title is empty or whitespace).
    *   Wrap `useMutation` targeting `POST /agent/sessions`.
2.  **`useDeleteAgentSession` (`src/hooks/agents/useDeleteAgentSession.ts`):**
    *   Implement custom mutation wrapper utilizing a `Map<string, Promise<void>>` ref to deduplicate concurrent delete requests for the same `sessionId`.
    *   Trigger `onOptimistic` immediately and clear cleanly on success/error.
3.  **`useSendAgentMessage` (`src/hooks/agents/useSendAgentMessage.ts`):**
    *   Implement robust synchronous validation matching server rules (role types, part content shape).
    *   Generate a temporary optimistic message object (e.g. `id: "tmp_...", sequence: -1`) and fire `onOptimistic` callback before the network request.
    *   Wrap `useMutation` targeting `POST /agent/sessions/:id/messages`.
4.  **Mutation Tests:**
    *   Write `useCreateAgentSession.test.ts`, `useDeleteAgentSession.test.ts`, `useSendAgentMessage.test.ts`.
    *   Ensure synchronous validation throws without making network calls.
    *   Verify optimistic updates and deduplication maps fire exactly as expected.

## Step 7: Barrel Exports & Verification

**Goal:** Finalize the package API surface and verify it is consumable by the rest of the workspace.

1.  **Exports:**
    *   Create `src/hooks/agents/index.ts` to export all hooks and callback types.
    *   Create `src/index.ts` as the primary barrel export (Types, Client, Hooks).
2.  **Compilation & Integrity Check:**
    *   Run `pnpm tsc --noEmit` within `packages/ui-core/` to verify types.
    *   Run `bun test packages/ui-core/src/` to ensure all pure logic and mock client tests pass.
    *   Verify that `import { useAgentSessions } from "@codeplane/ui-core"` correctly resolves in the workspace.

*(Note: End-to-End UI testing and reconciliation with OpenTUI display component types will be handled in subsequent tickets, specifically `tui-agent-e2e-scaffolding` and the dedicated screen tickets, strictly adhering to the scope boundaries set in the Engineering Spec).* 

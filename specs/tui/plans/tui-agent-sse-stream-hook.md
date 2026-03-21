# Implementation Plan: `tui-agent-sse-stream-hook`

## Overview
This plan details the implementation of the `useAgentStream` hook for the Codeplane TUI. This hook manages real-time SSE connections for agent chat sessions, providing token-by-token response rendering, auto-reconnection, and token deduplication. It includes a framework-agnostic shared hook in `packages/ui-core` and a TUI-specific adapter in `apps/tui`.

## Phase 1: Core Types & Interfaces

**1. Create SSE Event Types**
- **File:** `packages/ui-core/src/types/agentStream.ts`
- **Action:** Define and export `AgentTokenEvent`, `AgentDoneEvent`, `AgentErrorEvent`, `AgentStreamEvent`, and `AgentStreamConnectionState` as specified in the engineering spec.

**2. Export Types**
- **File:** `packages/ui-core/src/types/index.ts`
- **Action:** Re-export all types from `./agentStream.js`.

## Phase 2: Shared SSE Utilities

**1. Implement Ticket Exchange**
- **File:** `packages/ui-core/src/sse/getSSETicket.ts`
- **Action:** Implement `getSSETicket(client, signal)` to call `POST /api/auth/sse-ticket`. Handle non-200 responses and network errors by returning `null` (which allows the system to gracefully fallback to bearer auth).

**2. Implement SSE Reader**
- **File:** `packages/ui-core/src/sse/createSSEReader.ts`
- **Action:** Implement `createSSEReader(options)` using `fetch` and `ReadableStream`. Use the `eventsource-parser` package to parse chunks. Pass headers (including `Last-Event-ID` if provided) and handle `AbortSignal` gracefully.

**3. Create SSE Barrel Export**
- **File:** `packages/ui-core/src/sse/index.ts`
- **Action:** Export `getSSETicket`, `SSETicket`, `createSSEReader`, and `SSEReaderOptions`.

## Phase 3: Core Hook Implementation

**1. Implement `useAgentStream`**
- **File:** `packages/ui-core/src/hooks/agents/useAgentStream.ts`
- **Action:** Implement the core state machine for the SSE stream.
  - Manage `streaming`, `currentTokens`, `connected`, `reconnecting`, and `error` states.
  - Implement `subscribe` and `unsubscribe` methods.
  - Manage exponential backoff reconnection logic (1s to 30s) using timeouts.
  - Implement `replayMissedTokens` using `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` to prevent token duplication upon reconnect.
  - Utilize `positionRef` to track accumulated text length for deduplication.
  - Track a 45s keep-alive timeout that aborts the current connection and reconnects if no data is received.

**2. Update Agents Hook Barrel**
- **File:** `packages/ui-core/src/hooks/agents/index.ts`
- **Action:** Re-export `useAgentStream`, `AgentStreamState`, and `AgentStreamOptions`.

## Phase 4: Unit Testing Core Logic

**1. Test Ticket Exchange Utility**
- **File:** `packages/ui-core/src/sse/__tests__/getSSETicket.test.ts`
- **Action:** Write tests to verify successful ticket fetching, returning `null` on 500 errors, network errors, and abort signal behavior.

**2. Test Agent Stream Hook**
- **File:** `packages/ui-core/src/hooks/agents/__tests__/useAgentStream.test.ts`
- **Action:** Write exhaustive tests covering:
  - Initial state and auto-subscribe behavior.
  - SSE ticket exchange execution.
  - Token accumulation and exact preservation of strings (newlines, unicode).
  - Proper handling of `done` and `error` events.
  - Reconnection execution and exponential backoff timing logic.
  - Keepalive timeout triggering after 45s.
  - The replay mechanism ensuring `currentTokens` updates effectively without duplication.
  - Cleanup on unmount.

## Phase 5: TUI Adapter Implementation

**1. Implement TUI Adapter Hook**
- **File:** `apps/tui/src/hooks/useAgentStream.ts`
- **Action:** Implement a thin wrapper around `@codeplane/ui-core/hooks/agents`'s `useAgentStream`.
  - *Critical fix identified during research:* `useTimeline` in OpenTUI does not behave as described in the engineering spec. Instead of using `useTimeline({ active: true, interval: 80, frames: 10 })`, use a simple `useEffect` with `setInterval` to cycle through the braille spinner frames (`["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]`) every 80ms while `stream.streaming` is true. Store the current frame in local state.
  - Return the spread core hook state alongside the `spinnerFrame`.

**2. Export TUI Adapter Hook**
- **File:** `apps/tui/src/hooks/index.ts`
- **Action:** Export `useAgentStream` and `TUIAgentStreamState`.

## Phase 6: E2E Test Stubs

**1. Update Agent E2E Tests**
- **File:** `e2e/tui/agents.test.ts`
- **Action:** Add the `TUI_AGENT_SSE_STREAM` test suite outlined in the engineering spec.
  - Add snapshot tests (`SNAP-STREAM-001` through `006`).
  - Add keyboard interaction tests (`KEY-STREAM-001` through `004`).
  - Add reconnection tests (`RECONN-001` through `004`).
  - Add edge case tests (`EDGE-STREAM-001` through `003`).
  - *Note:* These tests are expected to fail currently as the backend endpoint (`GET /api/repos/:owner/:repo/agent/sessions/:id/stream`) returns a 501. Per constraints, these must be left failing and not skipped or commented out.
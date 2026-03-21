# Implementation Plan: TUI Agent Message Send

This implementation plan details the steps to fully realize the `tui-agent-message-send` ticket for the Codeplane TUI, ensuring optimistic UI rendering, streaming agent responses, robust error handling, and terminal-native keybindings.

## Phase 0: Setup & Version Control

**Step 0: Create Bookmark**
- **Action:** Run `jj bookmark create tui-agent-message-send` to scope all work under a tracked bookmark.

## Phase 1: Types and Hooks Foundation

**Step 1: Normalize Type Definitions**
- **File:** `apps/tui/src/screens/Agents/types.ts`
- **Action:** Add the `SendErrorCode` union type (`"UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED" | "UNPROCESSABLE" | "SERVER_ERROR" | "NETWORK_ERROR"`). Update `ChatMessage` to use `createdAt: string` consistently instead of `timestamp`, aligning with `@codeplane/ui-core`, and add an `errorCode?: SendErrorCode` property for precise failure states.

**Step 2: Update Hooks & State Management**
- **File:** `apps/tui/src/screens/Agents/useAgentSession.ts`
- **Action:** Enhance the hook to expose a `sendMessage` function. This function must immediately append an optimistic user message to the state, trigger the `@codeplane/ui-core` backend request, and establish the SSE listener for the agent's response stream. Ensure it robustly handles disconnections by reverting optimistic states or marking messages with the appropriate `SendErrorCode`.

## Phase 2: UI Component Implementation

**Step 3: Build Message Input Component**
- **File:** `apps/tui/src/screens/Agents/components/MessageInput.tsx`
- **Action:** Implement a stateful input component using OpenTUI's `<input>`. Map `Enter` to submit the message and `Shift+Enter` to insert a newline. Ensure the component auto-resizes its height gracefully up to a maximum defined threshold (e.g., 30% of screen height).

**Step 4: Update Message List Component**
- **File:** `apps/tui/src/screens/Agents/components/MessageList.tsx`
- **Action:** Render the growing list of messages inside a `<scrollbox>`. Render individual messages using the OpenTUI `<markdown>` component to support rich text and code blocks. Add local state to track whether auto-scroll is enabled, mapping the `f` key to toggle this behavior.

## Phase 3: Integration

**Step 5: Integrate into Session View**
- **File:** `apps/tui/src/screens/Agents/SessionScreen.tsx`
- **Action:** Assemble the components. Pass the `sendMessage` callback down to the `MessageInput`. Handle edge cases where the SSE stream finishes, explicitly invoking `session.finalizeStreamingMessage()`.

## Phase 4: Testing & E2E Validation

**Step 12: Implement Automated Tests**
- **File:** `e2e/tui/agents.test.ts`
- **Action:** Insert the full `describe("TUI_AGENT_MESSAGE_SEND", ...)` block directly underneath the existing `TUI_AGENT_SESSION_REPLAY` suite.
  - **Snapshots:** Add `SNAP-MSG-SEND-001` through `025` targeting empty views, maximum text expansions, responsive breakpoints, and specific error screens (401, 403, 429).
  - **Key Interactions:** Add `KEY-MSG-SEND-001` through `040` using `@microsoft/tui-test` APIs (`sendKeys`, `sendText`) ensuring accurate validation of Enter vs Shift+Enter, scroll bindings, retry mechanics (`r`), and auto-scroll behaviors (`f`).
  - **Resiliency:** Add `RESIZE-MSG-SEND-001` through `016` testing rapid terminal resizes mid-flight.
  - *Note:* Leave tests failing that rely on incomplete backend/SSE stream implementations as per the strict `feedback_failing_tests.md` policy (no mocks, no skips).
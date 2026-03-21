# Research Document: TUI Agent Message Send

## 1. Overview
I investigated the codebase to gather context for implementing the `tui-agent-message-send` ticket. I searched within the local `apps/tui/` and `packages/ui-core/` directories. (Note: `context/opentui/` and `apps/ui/src/` were not found in the current workspace, so I relied on the shared core and the current TUI implementations).

## 2. Existing Architecture & Types
- **Types (`apps/tui/src/screens/Agents/types.ts`)**: The required types for message tracking are already established. 
  - `MessageSendStatus` is defined (`"pending" | "sent" | "failed"`).
  - `ChatMessage` extends `AgentMessage` with `sendStatus` and `clientId` fields for optimistic UI deduplication.
  - `ChatMode` (`"active" | "replay"`) is implemented.

## 3. Shared Data Layer (`packages/ui-core/`)
- **`useSendAgentMessage`**: Located at `packages/ui-core/src/hooks/agents/useSendAgentMessage.ts`. It correctly accepts optimistic UI callbacks (`onOptimistic`, `onSettled`, `onRevert`, `onError`) and enforces validation for message parts.
- **`useAgentStream`**: Located at `packages/ui-core/src/hooks/agents/useAgentStream.ts`. Handles SSE subscriptions, reconnection, and yields `currentTokens` and `streaming` state to the client. The implementation includes logic to fetch missed tokens on reconnect.

## 4. TUI Screen Hooks
Several hooks specified in the engineering plan have already been scaffolded or partially implemented in `apps/tui/src/screens/Agents/hooks/`:
- **`useChatInput.ts`**: Tracks input state, handles multiline logic, and correctly calculates dynamic `inputHeight` based on OpenTUI breakpoint specifications.
- **`useChatSend.ts`**: Wraps the core `useSendAgentMessage` hook. It handles generating a unique `clientId` for optimistic inserts, manages cooldown/rate-limiting (2000ms), and exposes a `retry` function.
- **`useAutoScroll.ts`**: Implements the required interface for managing scroll modes (`enabled`, `hasNewMessages`) and reacting to user scroll events.
- **`useChatPagination.ts`**: Merges server responses with local optimistic state. Enforces a 500-message memory cap. Uses `appendStreamingTokens` to update the most recent streaming assistant message or create a temporary one.
- **`useChatKeybindings.ts`**: Maps keys to the UI actions. It separates behaviors based on `isInputFocused` and handles standard vim navigation (`j`/`k`, `g`), but it needs refinement to fully meet the spec's requirements for modal isolation and transient "go-to" states.

## 5. UI Components
Currently, `AgentChatScreen.tsx` renders the input area and the messages inline. To match the engineering specification, we need to extract and implement these dedicated components:
- **`MessageInput.tsx`**: A responsive, bordered text input with visual hints for "Sending..." and errors.
- **`MessageBubble.tsx`**: A cleaner wrapper around the existing `MessageBlock` logic to display sender attribution, relative timestamps, and pending/failed icons.
- **`ThinkingIndicator.tsx`**: A simple animated braille spinner shown when a message is sent but before stream tokens start arriving.
- **`NewMessagesIndicator.tsx`**: An overlay badge shown when new content arrives while the user is scrolled up.

## 6. Implementation Strategy
The primary work required for this ticket will be building the missing visual components (`MessageInput`, `MessageBubble`, `ThinkingIndicator`, `NewMessagesIndicator`), refining the existing hooks to ensure strict adherence to the spec (especially around edge-case error handling and focus traps), and refactoring `AgentChatScreen.tsx` to orchestrate them cleanly. Tests in `e2e/tui/agents.test.ts` will then be able to pass successfully against this modular structure.
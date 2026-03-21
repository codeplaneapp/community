# Research Findings: TUI Agent Chat Screen

## 1. Current `AgentChatScreen` Stub
- Located at `apps/tui/src/screens/Agents/AgentChatScreen.tsx`.
- It is currently a placeholder that only extracts `sessionId` via the `useNavigation` hook and renders a generic `<box>` with "Not yet implemented."

## 2. Navigation & Routing
- **Router Context:** `apps/tui/src/router/screens.ts` maintains `SCREEN_IDS` and `screenRegistry` (frozen objects).
- **Session List Wiring:** `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` currently contains commented-out stubs for navigation:
  - `handleOpen`: `// push("agent-chat", { owner, repo, sessionId: focusedSession.id })`
  - `handleReplay`: `// push("agent-session-replay", { owner, repo, sessionId: focusedSession.id })`

## 3. Existing Types
- **`apps/tui/src/screens/Agents/types.ts`** includes:
  - `MessageRole` (`"user" | "assistant" | "system" | "tool"`)
  - `MessagePart` (handling `text`, `tool_call`, and `tool_result` variants)
  - `AgentMessage` (contains `streaming?: boolean`)
  - Breakpoint exports used for responsive layouts.

## 4. UI Components (`apps/tui/src/screens/Agents/components/`)
- **`MessageBlock.tsx`**:
  - Fully implemented to render `AgentMessage` objects.
  - Handles different roles with custom labels (e.g., "You", "Agent", "Y:", "A:") and responsive padding based on the active `Breakpoint`.
  - Automatically handles the streaming state via an internal `useSpinner` hook that renders braille spinner frames next to the "Agent" label when `message.streaming` is true.
  - Renders text parts via OpenTUI's `<markdown>` and automatically integrates `ToolBlock` components for tool calls and results.
- **`ToolBlock.tsx`**:
  - Manages collapsed/expanded states for tool arguments and results.
  - Renders input JSON via `<code filetype="json">` and tool outputs via `<markdown>`.
  - Uses `generateSummary()` for rendering abbreviated information when collapsed.

## 5. Core Hooks
- **`useAgentStream` (TUI wrapper)**: Located in `apps/tui/src/hooks/useAgentStream.ts`. Wraps `@codeplane/ui-core`'s `useAgentStreamCore` to add TUI-specific `spinnerFrame` logic. Yields `currentTokens`, `streaming`, and `subscribe`/`unsubscribe` methods.
- **`useAgentMessages` (Core)**: Located in `packages/ui-core/src/hooks/agents/useAgentMessages.ts`. Uses a `usePaginatedQuery` implementation to fetch messages in pages of 30, up to a max of 10,000, and returns `messages`, `totalCount`, `hasMore`, `fetchMore`, etc.
- **Keybindings Pattern**: `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts` demonstrates the exact pattern required for chat keybindings—receiving a record of action callbacks and a status bar hint string.

## 6. Testing Infrastructure (`e2e/tui/`)
- **Test Environment**: `e2e/tui/helpers.ts` provides the `launchTUI()` helper that boots up a virtual terminal process using `@microsoft/tui-test`. Exposes `TUITestInstance` with methods like `sendKeys()`, `sendText()`, `snapshot()`, `resize()`, and `waitForText()`.
- **Test Organization**: `e2e/tui/agents.test.ts` currently houses test suites for `TUI_AGENT_MESSAGE_BLOCK`, `TUI_AGENT_SSE_STREAM`, and `TUI_AGENT_SESSION_LIST`. The spec requires appending 124 new tests in a `TUI_AGENT_CHAT_SCREEN` describe block directly into this existing file.
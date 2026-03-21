# Implementation Plan: TUI Agent Chat Screen

## Phase 1: Routing, Navigation, and Types

**1. Update Screen Registry (`apps/tui/src/router/screens.ts`)**
- Add `AgentChat: "AgentChat"` to the `SCREEN_IDS` object.
- Register the screen in `screenRegistry` mapping `SCREEN_IDS.AgentChat` to the `AgentChatScreen` component with `requiresRepo: true` and title `"Agent Chat"`.

**2. Wire Navigation (`apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`)**
- Import `useNavigation` from `../../hooks/useNavigation.js`.
- Update `handleOpen()` to call `navigation.push("AgentChat", { owner, repo, sessionId: focusedSession.id })` instead of the stubbed comment.
- Update `handleReplay()` to also route to `AgentChat`.

**3. Define Chat Types (`apps/tui/src/screens/Agents/types.ts`)**
- Export `MessageSendStatus` type (`"pending" | "sent" | "failed"`).
- Export `ChatMessage` interface extending `AgentMessage` with `sendStatus` and `clientId`.
- Export `ChatMode` type (`"active" | "replay"`).

## Phase 2: State Management & Hooks Implementation
*All files in `apps/tui/src/screens/Agents/hooks/`*

**1. Search Hook (`useChatSearch.ts`)**
- Implement literal substring search across message text parts.
- Track `isActive`, `query`, `matchCount`, `currentMatchIndex`, and `matchedMessageIds`.
- Provide `activate`, `deactivate`, `nextMatch`, `prevMatch` actions.

**2. Auto-Scroll Hook (`useAutoScroll.ts`)**
- Manage sticky-scroll behavior for the `<scrollbox>`.
- Disable on upward scroll (`k`, `Up`, `Ctrl+U`); enable on bottom jump (`G`) or toggle (`f`).
- Track `hasNewMessages` when auto-scroll is disabled and new tokens arrive.

**3. Input Management Hook (`useChatInput.ts`)**
- Manage `text`, `isFocused`, `isMultiline` state.
- Enforce `maxLength` of 4000 characters.
- Calculate `inputHeight` based on terminal `Breakpoint` (1 for minimum, up to 4 for standard, up to 8 for large).

**4. Pagination & Memory Hook (`useChatPagination.ts`)**
- Fetch message pages (size 30, max 50) using `useAgentMessages`.
- Enforce 500-message memory cap in state (drop oldest on overflow).
- Provide methods: `insertOptimistic`, `updateMessage`, `appendStreamingTokens`, and `finalizeStreamingMessage`.

**5. Polling Fallback Hook (`useChatPollingFallback.ts`)**
- Implement 3-second REST polling fallback logic for when SSE returns 501 (Not Implemented).
- Compare message IDs to avoid duplicates.

**6. Message Send Hook (`useChatSend.ts`)**
- Wrap `useSendAgentMessage` from `@codeplane/ui-core`.
- Implement optimistic UI insertion via UUID client IDs.
- Handle rate limit (429) revert logic, retry capability, and 2-second cooldowns.
- Block execution if `isStreaming` is true.

**7. Keybindings Hook (`useChatKeybindings.ts`)**
- Implement keyboard dispatch taking a `ChatKeybindingHandlers` dictionary.
- When `isInputFocused` is true: Printable keys go to input. Only `Esc`, `Enter`, `Ctrl+Enter`, `Shift+Enter`, `Ctrl+C` propagate.
- When `isInputFocused` is false: Map `j/k/G/gg` to scroll actions, `i` to focus input, `q` to pop screen, `/` to search, etc.

## Phase 3: Screen UI Component

**1. Main View (`apps/tui/src/screens/Agents/AgentChatScreen.tsx`)**
- Replace the 15-line stub with the full implementation outlined in the spec.
- Integrate terminal sizing (`useTerminalDimensions`) and layout adjustments based on `Breakpoint`.
- Fetch session data using `useAgentSession(owner, repo, sessionId)`.
- Integrate streaming tokens via `useAgentStream` and hook into `pagination.appendStreamingTokens`.
- Build the layout:
  - **Header:** Session title and status badge.
  - **Content Area:** `<scrollbox>` with `MessageBlock` iteration. Render search overlay conditionally above input.
  - **Footer:** Render input form (active mode) or replay banner (replay mode).
- Implement error boundaries for 404 (Session Not Found) and 401 (Auth Expired).

**2. SSE Session Timeout Subscription**
- Add SSE listener `useSSEChannel("agent.session.${sessionId}", ...)` to watch for `status_changed`.
- Automatically shift `chatMode` to `"replay"` if session transitions to `timed_out`, `completed`, or `failed`.

## Phase 4: Integration and E2E Tests

**1. Test Helpers (`e2e/tui/helpers.ts`)**
- Add `navigateToAgentChat(terminal, sessionIndex)`.
- Add `waitForChatReady(terminal)` parsing snapshots for specific ready states.

**2. E2E Tests (`e2e/tui/agents.test.ts`)**
- Append the `describe("TUI_AGENT_CHAT_SCREEN")` block with all 124 tests described in the spec.
- Include snapshot validations (28 tests) targeting 80x24, 120x40, and 200x60 dimensions.
- Include keyboard interaction tests (42 tests) targeting scroll, input focusing, message sending, and shortcuts.
- Include responsive tests (14 tests) handling live resizing and reflow validation.
- Include integration & edge case tests (40 tests) verifying error UI (401, 404, 429), memory caps, unicode parsing, and rapid interaction.

## Phase 5: Verification
- Run `bun run test:e2e e2e/tui/agents.test.ts` to ensure scaffolding works.
- Intentional failures for unimplemented backend features will remain unskipped per engineering directives.
- Final check on memory cleanup, 500-message cap, and input length bounds.
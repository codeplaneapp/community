Not LGTM.

Critical findings:
1. Step 2 and Step 5 target non-existent integration files (`apps/tui/src/screens/Agents/useAgentSession.ts`, `apps/tui/src/screens/Agents/SessionScreen.tsx`). The current chat integration lives in `AgentChatScreen` + hooks, so the plan is not executable as written.
2. The plan misuses `@codeplane/ui-core` responsibilities by pushing send/stream orchestration into `useAgentSession`. In current contracts, session fetch, send mutation, message pagination, and stream are separate hooks; collapsing them will create coupling and regress maintainability.
3. Step 2’s “establish SSE listener in sendMessage” is architecturally wrong. SSE must be session-scoped (or provider-scoped), not per-send, or you risk duplicate listeners, duplicate tokens, and leak-prone reconnect behavior.
4. Step 5 calls `session.finalizeStreamingMessage()`, but `session` has no such API; finalize currently belongs to pagination state.

Major findings:
5. Keyboard behavior is under-specified and does not match the design-level interaction model. The plan only calls out `Enter`, `Shift+Enter`, `f`, and `r`, but misses required focus-mode semantics and global/chat bindings (`i`, `Esc` dual behavior, `q` empty-input behavior, `j/k`, `gg/G`, `Ctrl+U/Ctrl+D`, `?`, `:`, `Ctrl+C`).
6. Step 4 says to render messages via `<markdown>` only; that would regress non-text parts (`tool_call`, `tool_result`), role/timestamp metadata, and failed/pending send affordances.
7. Type migration is incomplete: changing `timestamp` -> `createdAt` without explicit downstream updates (formatting/rendering/search/sort paths) is likely to introduce breakage.
8. Error handling is not specific enough for required UX/state transitions (401/403/429/422/network, retry eligibility gating, and disconnection indicator behavior).
9. Test placement is wrong: adding `TUI_AGENT_MESSAGE_SEND` directly under replay is mismatched with existing chat-focused coverage structure; this should be aligned with the chat screen suite and feature mapping.
10. Plan quality issue: step numbering jumps from 5 to 12, signaling missing implementation steps and insufficient end-to-end sequencing.

Relevant code references:
- [AgentChatScreen.tsx](/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:22)
- [useChatSend.ts](/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatSend.ts:15)
- [useChatPagination.ts](/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatPagination.ts:120)
- [useAgentSession.ts](/Users/williamcory/codeplane/specs/tui/packages/ui-core/src/hooks/agents/useAgentSession.ts:7)
- [useSendAgentMessage.ts](/Users/williamcory/codeplane/specs/tui/packages/ui-core/src/hooks/agents/useSendAgentMessage.ts:17)
- [SSEProvider.tsx](/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/SSEProvider.tsx:86)
- [agents.test.ts (chat suite)](/Users/williamcory/codeplane/specs/tui/e2e/tui/agents.test.ts:597)
- [agents.test.ts (replay suite)](/Users/williamcory/codeplane/specs/tui/e2e/tui/agents.test.ts:1704)
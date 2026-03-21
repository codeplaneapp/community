Reject.

Test runs:
1. `cd /Users/williamcory/codeplane/specs/tui/apps/tui && bun run check` fails with TypeScript errors, including ticket files.
2. `cd /Users/williamcory/codeplane/specs/tui/apps/tui && bun test ../../e2e/tui/agents.test.ts -t 'SNAP-CHAT-001' --timeout 30000` fails: `waitForText("Agent Sessions")` timeout from `/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:261`.

Critical findings:
1. Build-breaking `@codeplane/ui-core` API misuse.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatPagination.ts:32` calls `useAgentMessages(sessionId, ...)`, but hook signature is `(owner, repo, sessionId, ...)` at `/Users/williamcory/codeplane/specs/tui/packages/ui-core/src/hooks/agents/useAgentMessages.ts:17`.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatPollingFallback.ts:13` repeats the same wrong call shape.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatSend.ts:30` destructures `sendMessage` from `useSendAgentMessage`, but the hook returns `send` at `/Users/williamcory/codeplane/specs/tui/packages/ui-core/src/hooks/agents/useSendAgentMessage.ts:23`.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:55` references `stream.finalMessage`, which does not exist in `/Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useAgentStream.ts:8`.

2. OpenTUI API usage is incorrect in the chat screen (compile-time incompatible).
- Invalid `text` props like `color`/`bold` used throughout `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx` (for example:152, :169, :190, :247).
- Invalid `box` prop `borderTop` used at :254, :272, :293.
- Invalid `scrollbox` prop `onScrollTop` at :202.
- Invalid `input` props `disabled` and `multiline` at :280 and :282.
- These are incompatible with installed OpenTUI typings (`TextProps`, `BoxProps`, `ScrollBoxProps`, `InputProps`) in `/Users/williamcory/codeplane/specs/tui/apps/tui/node_modules/@opentui/react/src/types/components.d.ts`.

3. Keyboard behavior diverges from the design spec and has broken key parsing.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts:102-109` uses `key.char` (not part of OpenTUI `KeyEvent`), so `/`, `n/N`, and retry handling are broken.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts:82-88` maps plain `g` directly to top instead of `g g` sequence behavior.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts:33-35` uses `process.exit(0)` in a screen hook instead of app-level quit handling.

4. Claimed streaming/polling behavior is effectively stubbed or disabled.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:19-20` defines `useSSEChannel` as a no-op.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:103` calls polling fallback with `sseAvailable=true` and noop callback, so fallback never activates.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useAutoScroll.ts:43-47` requires `onNewContent()` calls, but `AgentChatScreen` never invokes it, so "new messages" indicator logic cannot work.

5. Session list to chat navigation is not actually wired through keyboard handling.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts:43-64` is a no-op stub.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionListScreen.tsx:133-160` relies on that stub for Enter/j/k/replay/delete.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionListScreen.tsx:155` has `popScreen` as a comment no-op.

6. Routing is inconsistent for agents.
- `/Users/williamcory/codeplane/specs/tui/apps/tui/src/router/screens.ts:110-113` still maps `Agents` to `PlaceholderScreen`, while navigation registry maps `Agents` to `AgentSessionListScreen` in `/Users/williamcory/codeplane/specs/tui/apps/tui/src/navigation/screenRegistry.ts:151-153`.

7. E2E additions are largely non-verifying and can pass despite broken behavior.
- `/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:6` imports `createTestTui` but never uses it.
- `/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:231-235` writes literal strings like `"Ctrl+Enter"` to stdin, not real key events.
- `/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:31-41` `waitForSessionListReady` never throws on timeout.
- `/Users/williamcory/codeplane/specs/tui/e2e/tui/agents.test.ts` frequently swallows assertions with `.catch(() => {})` (for example:634, :641, :648, :919, :930, :1506).
- Many keyboard tests have no assertion after interaction (for example `/Users/williamcory/codeplane/specs/tui/e2e/tui/agents.test.ts:841-911`).

8. Data-access check.
- I did not find direct fetch/API calls in these ticket files; they attempt to use `@codeplane/ui-core` hooks.
- However, hook usage and local message types are inconsistent/broken (`timestamp` vs `createdAt`, e.g. `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/types.ts:20` vs `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useChatSend.ts:48`, and render path uses `timestamp` in `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/components/MessageBlock.tsx:67`).

Result: not close to LGTM. The implementation and tests are both failing against stated requirements.
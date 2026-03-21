Not LGTM.
1. Test status is not acceptable:
- `packages/ui-core`: `bun test src/` => 94 pass / 26 fail (fails in all six agent hook suites).
- `packages/ui-core` typecheck is not clean: `bun x tsc --noEmit -p tsconfig.json` fails because `bun:test` types are unresolved.
- `e2e/tui`: `bun test e2e/tui` => 177 pass / 137 fail / 10 skip (stub harness + unresolved deps).
2. The custom hook test runtime is fundamentally broken, so hook behavior results are not trustworthy:
- `packages/ui-core/src/test-utils/renderHook.ts:30-33` resets `state.hooks` and `state.effects` every render, which destroys React state continuity.
- `packages/ui-core/src/test-utils/react-mock.ts:35-47` does not run prior effect cleanup on dependency change, diverging from React semantics and causing stale effects.
3. Functional bug in hook logic:
- `packages/ui-core/src/hooks/agents/useAgentSession.ts:93-111` triggers duplicate fetches on param changes (param-change effect calls `fetchSession`, then refetch effect runs again because `fetchSession` identity changed).
- `packages/ui-core/src/hooks/internal/useMutation.ts:45-47` double-submit prevention depends on captured `isLoading`; rapid back-to-back calls can race before rerender.
4. Contract / API quality issues:
- `packages/ui-core/src/hooks/agents/useCreateAgentSession.ts:42-49` and `useSendAgentMessage.ts:84-97` throw synchronously while typed as Promise-returning APIs.
- `packages/ui-core/src/hooks/agents/useAgentSessions.ts:28-33` and `useAgentMessages.ts:32-38` define `page` in options types but never use it.
- `packages/ui-core/tsconfig.json:15` includes tests but package lacks Bun test types (`packages/ui-core/package.json:15-18` has no `bun-types`), so `check` is unreliable.
5. TUI integration requirements in this review are not met:
- No `@codeplane/ui-core` hook usage in `apps/tui/src` (no imports found).
- Agent screens are placeholders only (`apps/tui/src/screens/Agents/AgentSessionListScreen.tsx:3-8`, `AgentChatScreen.tsx:4-13`, `AgentSessionCreateScreen.tsx:3-8`, `AgentSessionReplayScreen.tsx:4-13`).
- Required keyboard behaviors from the design spec (list navigation, chat input/send flow, replay controls) are not implemented on these screens.
6. OpenTUI usage check:
- `MessageBlock`/`ToolBlock` use valid OpenTUI primitives (`<box>`, `<text>`, `<markdown>`, `<code>`), but interaction wiring is incomplete (no screen-level keyboard handling for tool expand/collapse flow).
- `useTimeline` is not used in runtime code despite being a stated TUI hook requirement (only imported in `verify-imports.ts`).
7. QA gap:
- `e2e/tui/agents.test.ts` currently contains comment-only test bodies (no assertions), so it can pass without validating behavior.

Assumption: the engineering spec for `tui-agent-data-hooks` says `apps/tui/src` changes are out of scope, but under the explicit checks in this review request, this still fails.
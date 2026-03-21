Not LGTM.

1) Scope mismatch with your explicit constraints: the plan puts primary implementation in `packages/ui-core/...` and unit tests in `packages/ui-core/.../__tests__`, but your stated rule says implementation should target `apps/tui/src/` and tests should target `e2e/tui/`.

2) Auth fallback is underspecified/likely broken: `getSSETicket()` returning `null` and “fallback to bearer auth” cannot be implemented cleanly with current `APIClient` surface (`request()` only, no exposed token/header builder) when `createSSEReader` uses raw `fetch`.

3) Import/export path inconsistency: plan references `@codeplane/ui-core/hooks/agents`, but current codebase imports from `@codeplane/ui-core/src/...` and `packages/ui-core/package.json` has no `exports` map for that subpath. This will likely fail resolution unless extra steps are added.

4) Missing dependency step: `eventsource-parser` usage is planned but no package dependency update is included for `packages/ui-core/package.json`.

5) Keyboard behavior is not fully aligned/specified against the TUI interaction model: stream tests add `f` and `q` semantics without defining focus-mode gating (input-focused vs scroll-focused), which is required for consistent keyboard behavior.

6) Spinner ownership is unclear: plan adds spinner frame logic in `apps/tui/src/hooks/useAgentStream.ts`, but current agent rendering (`MessageBlock`) already owns spinner animation. The plan does not resolve duplicate/conflicting spinner sources (including interval mismatch).

7) E2E “expected failing” requirement is not operationally specific: current `e2e/tui/agents.test.ts` style contains comment stubs that pass; plan does not specify converting these to executable failing assertions.

8) Reconnect dedup protocol is not sufficiently tight: using position/length with `Last-Event-ID` is not guaranteed to match SSE server event-id semantics. Without explicit server contract, this risks duplicate or dropped token replay.
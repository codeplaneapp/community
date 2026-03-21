Not LGTM.

Tests run:
- `bun test apps/tui/src/hooks/__tests__/useSpinner.test.ts --timeout 30000` -> FAILED (3 pass, 1 fail). Failing assertion expects braille frame but got `-`.
- `bun test e2e/tui/agents.test.ts -t "SNAP-MSG-005|SNAP-STREAM-003|SNAP-CHAT-018|INT-CHAT-013" --timeout 30000` -> FAILED (2 pass, 2 fail), timed out waiting for "Agent Sessions".

Findings (highest severity first):
1. HIGH: `useSpinner(active=false)` can still return a spinner frame when any other component is active, because snapshot is global (`activeCount > 0`) and not gated per caller. This violates the hook contract and can display spinners on non-streaming assistant messages.
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useSpinner.ts:51
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useSpinner.ts:137
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/components/MessageBlock.tsx:62
2. HIGH: Frame-change detection is flawed. Timeline writes float values into `state.frameIndex` before `onUpdate`; comparing `newIndex !== state.frameIndex` then evaluates true almost every tick, so `emitChange()` fires at engine tick frequency instead of spinner frame cadence.
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useSpinner.ts:74
3. HIGH: New unit test is terminal-dependent and currently failing; it hardcodes braille expectation instead of honoring ASCII fallback when Unicode is unavailable.
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/__tests__/useSpinner.test.ts:55
4. MEDIUM: Multi-subscriber behavior is not actually validated in the test. The second consumer never executes its own effect callback/cleanup, so active-count synchronization is only partially simulated.
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/__tests__/useSpinner.test.ts:58
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/__tests__/useSpinner.test.ts:63
5. MEDIUM/NIT: `useAgentStream` memoization is brittle: spread includes all upstream fields, but dependencies are manually enumerated. Any upstream field addition risks stale returned state.
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useAgentStream.ts:29
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useAgentStream.ts:32
6. NIT: Global timeline is registered but never unregistered, which can leak state across hot reload/tests.
   - /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useSpinner.ts:88

Other checks:
- No direct API calls were added in these modified files; data access remains via `@codeplane/ui-core` hook usage.
- No keyboard-binding logic changed in this ticket.
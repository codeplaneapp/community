Findings (highest severity first):
1. High: Inactive consumers still subscribe to the global spinner store and will re-render on every frame when any spinner is active, which is a performance regression. Evidence: unconditional useSyncExternalStore at /Users/williamcory/codeplane/apps/tui/src/hooks/useSpinner.ts:173, unconditional subscribe at :57, global frame snapshot at :69, and only post-read gating at :176. This violates the ticket goal of avoiding unnecessary CPU usage.
2. Medium: Timeline lifecycle is not fully cleaned up. The hook registers once with engine.register at /Users/williamcory/codeplane/apps/tui/src/hooks/useSpinner.ts:117 but never calls engine.unregister anywhere. Even when inactive, the timeline/listener remains retained for process lifetime.
3. Medium: Added E2E coverage is mostly module-shape checks, not user-facing TUI behavior. The new block at /Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1238-1331 validates exports/types/imports via bunEval, which conflicts with the PRD E2E philosophy (user-visible behavior + terminal interaction/snapshots).
4. Medium: Unicode-vs-ASCII behavior is not actually validated end-to-end. Unit tests accept either frame set (ALL_FRAMES) at /Users/williamcory/codeplane/apps/tui/src/hooks/__tests__/useSpinner.test.ts:56-57 and :103-110, and the E2E test only checks that isUnicodeSupported returns a boolean at /Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1320-1329.
5. Low (nits): Test hygiene issues in the new unit test file: unused import beforeEach at /Users/williamcory/codeplane/apps/tui/src/hooks/__tests__/useSpinner.test.ts:1, unused local result at :40, and top-level React spies at :12-21 that are never restored.

Verification notes:
- No direct API calls were introduced in the changed apps/tui source files (no fetch/axios/ui-core bypass).
- No keyboard interaction logic was changed in this ticket.

Tests run:
- Pass: bun run check (apps/tui)
- Pass: bun test src/hooks/__tests__/useSpinner.test.ts (apps/tui)
- Pass: bun test ../../e2e/tui/app-shell.test.ts -t useSpinner hook scaffold --timeout 30000 (apps/tui)
- Fails in this environment: bun test e2e/tui/app-shell.test.ts --timeout 30000 (non-TTY constraints and duplicate specs/tui mirror tests also executed from root).
Findings (ordered by severity):
1. HIGH: `formatBytes()` is incorrect for fractional byte values in (0,1). `exp` becomes `-1`, so unit lookup is `undefined`, producing invalid output (reproduced: `formatBytes(0.5) -> "512 undefined"`). Location: `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Workflows/utils.ts:136`.
2. HIGH: `getStepStatusIcon()` is not runtime-safe; it calls `status.toLowerCase()` without guarding non-string input. Reproduced throw for `undefined`. `getStepStatusIconNoColor()` inherits this failure path. Locations: `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Workflows/utils.ts:39` and `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Workflows/utils.ts:52`.
3. MEDIUM: `formatRunCount()` does not handle non-finite/invalid numeric input despite the “robust edge cases” claim. Reproduced: `NaN -> "NaNK"`, `Infinity -> "InfinityK"`, `-1 -> "-1"`. Location: `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Workflows/utils.ts:149`.
4. MEDIUM: `formatRelativeTime()` does not validate `now` when provided; invalid `Date` yields `"NaNy"` instead of fallback. Location: `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Workflows/utils.ts:86`.
5. MEDIUM: The 88-case suite misses the above real edge cases (`<1` bytes, non-string step status, non-finite run count, invalid `now` date), so coverage is broad but not robust enough. Location: `/Users/williamcory/codeplane/specs/tui/e2e/tui/workflow-utils.test.ts`.
6. LOW: Test-framework consistency issue: `/Users/williamcory/codeplane/specs/tui/e2e/tui/workflow-utils.test.ts:1` uses `bun:test`, while the provided TUI test constraint says tests in `e2e/tui/` should use `@microsoft/tui-test`.

Verification performed:
- PASS: `bun test e2e/tui/workflow-utils.test.ts --timeout 30000` (88 pass, 0 fail).
- FAIL (broader regression/environment): `bun test e2e/tui/workflows.test.ts --timeout 30000` -> cannot resolve `@codeplane/ui-core` (first error from `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`).

Scope checks requested:
- OpenTUI components/hooks: none are used in the changed files, so no direct misuse detected there.
- Keyboard interactions: none implemented in the touched files, so this ticket does not provide behavior to validate against keybinding spec.
- Data access: no direct API calls introduced; changed code is pure utility logic only.
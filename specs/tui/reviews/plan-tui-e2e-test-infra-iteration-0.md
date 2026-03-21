Not LGTM.

Critical
1) Function-name mismatch in the plan: it says to implement `spawnTUI`, but the current suite calls `launchTUI` (`/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:14`, `/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts:4`). If `launchTUI` compatibility is not explicitly preserved, tests break immediately.
2) The proposed infra verification test is too weak: it only checks symbol existence (`createTestCredentialStore`, `createMockAPIEnv`) and never launches a TUI, sends keys, resizes, snapshots, or terminates. That does not validate OpenTUI integration, keyboard pipeline, or process lifecycle.

High
3) Keyboard behavior is underspecified for the design contract: no canonical mapping rules are defined for `g` sequences, `g g`, `Tab`/`Shift+Tab`, `Esc`, `Ctrl+B/C/S/U/D`, or sequence timing. This is required to verify keyboard-first behavior from the TUI design spec.
4) `@codeplane/ui-core` data access is not concretely covered. The plan mentions `createMockAPIEnv` but does not define required API/SSE fixtures, auth-ticket flow, token/credential injection, base URL env wiring, or cleanup/isolation. So hook-level data behavior remains unverifiable.
5) The plan does not define one real smoke test that proves the harness works end-to-end (spawn app, wait for text, keypress, resize, snapshot, teardown). A symbol-resolution test can pass while infra is still broken.

Medium
6) Step 3 asks to import `readFileSync` but the provided test block does not use it; this is dead import noise.
7) File targeting is mostly correct (changes are in `apps/tui/package.json` and `e2e/tui/*`), but this is the only requirement area that is adequately scoped.

Evidence from repo state
- `launchTUI` is currently a hard stub (`/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:20`).
- Running `bun test e2e/tui/app-shell.test.ts --timeout 30000` fails broadly due stubbed infra, confirming the proposed symbol-only validation would not catch actual harness failures.

Required to approve
- Keep `launchTUI` as the stable exported API (optional alias is fine).
- Specify exact `@microsoft/tui-test` adapter method mapping and key normalization rules.
- Define deterministic mock API + SSE + auth fixture contract used by `@codeplane/ui-core` hooks.
- Add at least one true infra smoke E2E test that exercises launch, keyboard, resize, snapshot, and teardown.
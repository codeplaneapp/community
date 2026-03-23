Findings (ordered by severity):
1. BLOCKER: E2E infra is not functional. `launchTUI()` imports `@microsoft/tui-test/lib/terminal/term.js` and `shell.js` from `/Users/williamcory/codeplane/e2e/tui/helpers.ts:288-291`, but `@microsoft/tui-test` is only installed in `/Users/williamcory/codeplane/apps/tui/package.json:19`. Since tests live in `/Users/williamcory/codeplane/e2e/tui`, module resolution fails from that directory. Repro: `cd apps/tui && bun run test:e2e` => `72 pass / 518 fail`, all with `Cannot find module '@microsoft/tui-test/lib/terminal/term.js'`.
2. HIGH: Infra verification tests miss the real failure path. `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:278-280` only checks `typeof launchTUI === "function"`; it never invokes `launchTUI()`. `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:282-288` imports `@microsoft/tui-test` via `bunEval` in `apps/tui` cwd, so it gives a false green while actual E2E files still cannot resolve the package.
3. HIGH: Keyboard mapping does not match design-spec key notation robustness. `/Users/williamcory/codeplane/e2e/tui/helpers.ts:226,243,248-257` supports lowercase tokens like `shift+Tab` and `ctrl+c` only. Canonical design keys (`Shift+Tab`, `Ctrl+B`, `Ctrl+S`) fall through to raw string handling at `/Users/williamcory/codeplane/e2e/tui/helpers.ts:264`, which can emit invalid input sequences.
4. MEDIUM: Launch timeout API is dead code. `DEFAULT_LAUNCH_TIMEOUT_MS` (`/Users/williamcory/codeplane/e2e/tui/helpers.ts:36`) and `launchTimeoutMs` (`:76`) are never used; startup uses fixed sleep (`:446`). This is flaky and ignores caller timeout intent.
5. MEDIUM: `diff.test.ts` remains non-validating. `/Users/williamcory/codeplane/e2e/tui/diff.test.ts:4-216` contains comment-only test bodies (31 passing tests with zero assertions), so the infra does not verify diff behavior.
6. LOW: `e2e/tui/bunfig.toml` is likely ineffective with current invocation (`/Users/williamcory/codeplane/apps/tui/package.json:10` runs tests from `apps/tui` with explicit `--timeout`). It adds little/no runtime value in this setup.

Requested audit checks:
- `apps/tui/src` read: yes. Current code is mostly scaffold/stubs; no OpenTUI component tree to validate yet beyond import/type wiring.
- OpenTUI hooks/components correctness: no concrete screen usage present to validate interaction behavior.
- Data access: no direct `fetch`/raw HTTP calls found in `apps/tui/src`; also no `@codeplane/ui-core` hooks are used yet (app surface still stubbed).

Commands run:
- `cd apps/tui && bun run test:e2e` (fails: 518)
- `cd apps/tui && bun test ../../e2e/tui/app-shell.test.ts --timeout 30000` (passes: 41)
- `cd apps/tui && bun test ../../e2e/tui/diff.test.ts --timeout 30000` (passes: 31, but no-op)
- `cd apps/tui && bun run check` (passes)
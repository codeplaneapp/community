Tests run:
- `bun run check` in `apps/tui`: pass.
- `bun test e2e/tui/app-shell.test.ts -t "PROVIDER-(FILE|RENDER|HOOK|TIER|IMPORT|TSC|GUARD)"`: 25 pass.
- `bun test e2e/tui/app-shell.test.ts -t "PROVIDER-SNAP"`: 3 fail.

Findings (highest severity first):
1. HIGH: New snapshot tests are currently non-runnable in this repo setup because `launchTUI()` imports `@microsoft/tui-test/lib/terminal/term.js`, which is not resolvable from `e2e/tui/helpers.ts` during root-level test execution. References: `/Users/williamcory/codeplane/e2e/tui/helpers.ts:288`, `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1188`.
2. HIGH: `PROVIDER-SNAP-003` claims to validate ansi16, but test env sets `NO_COLOR: ""` (empty string), which does not trigger ansi16 in `detectColorCapability()`. With `TERM: "xterm"`, this falls back to ansi256, so the test intent is incorrect. Reference: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1223`.
3. HIGH: Multiple new tests are brittle false positives (source-text inspection instead of runtime behavior), so they can pass while behavior is wrong:
- Hook throw test just reads file text (`includes('throw')`) instead of invoking hook: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1065`.
- Provider render test checks function arity, not rendered node structure: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1024`.
- `useMemo.*[]` regex can match comments, not implementation semantics: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1181`.
4. MEDIUM: Encapsulation contract is inconsistent. `ThemeProvider.tsx` says context is “never exposed directly,” but barrel re-exports `ThemeContext`, allowing bypass of guard hooks. References: `/Users/williamcory/codeplane/apps/tui/src/providers/ThemeProvider.tsx:9`, `/Users/williamcory/codeplane/apps/tui/src/providers/index.ts:6`.
5. MEDIUM: Provider is defined but not mounted anywhere in `apps/tui/src`, so “available across the component tree” is not yet true in implementation. Reference: no usage sites found; only declaration at `/Users/williamcory/codeplane/apps/tui/src/providers/ThemeProvider.tsx:43`.
6. NIT: Comment claims detection/theme creation run “exactly once per provider mount”; React StrictMode can invoke initializer twice in dev, so wording is technically inaccurate. Reference: `/Users/williamcory/codeplane/apps/tui/src/providers/ThemeProvider.tsx:44`.

Additional checks:
- No direct API calls were introduced in modified source files.
- No OpenTUI component/hook misuse was introduced by these specific changes.
- Keyboard interaction behavior from the TUI design spec is not affected by this ticket and is not validated by these new tests.
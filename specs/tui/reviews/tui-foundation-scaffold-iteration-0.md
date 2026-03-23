Tests run:
1. `bun test app-shell.test.ts` (cwd `/Users/williamcory/codeplane/e2e/tui`) -> 32 pass, 0 fail.
2. `bun run check` (cwd `/Users/williamcory/codeplane/apps/tui`) -> pass.
3. `bun test e2e/tui/app-shell.test.ts` (cwd repo root) -> executed `/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts` and failed in non-TTY mode.

Findings (ordered by severity):
1. High - Ambiguous test targeting from repo root. Adding `e2e/tui/app-shell.test.ts` creates a basename collision with `specs/tui/e2e/tui/app-shell.test.ts`; `bun test e2e/tui/app-shell.test.ts` can run the wrong suite and fail. Reference: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:1`.
2. High - TUI entrypoint is non-functional scaffold only; no renderer bootstrap, no app mount, no keybinding registration (`?`, `:`, `q`, `Esc`, vim nav) to match the design spec. It only re-exports types. Reference: `/Users/williamcory/codeplane/apps/tui/src/index.tsx:14`.
3. Medium - `verify-imports.ts` "assertions" are no-ops. The conditional type aliases can evaluate to `never` without failing compilation, so they do not actually enforce API contracts. Reference: `/Users/williamcory/codeplane/apps/tui/src/verify-imports.ts:10`.
4. Medium - Data access contract is not established for TUI hooks. `@codeplane/ui-core` is not declared in TUI dependencies and no ui-core hook usage exists in `apps/tui/src`, so the requirement to consume shared hooks is not satisfied yet (no direct API calls found, which is good). Reference: `/Users/williamcory/codeplane/apps/tui/package.json:11`.
5. Low - Test quality nits in scaffold test/helpers:
   - Redundant repeated `bun run check` test bodies add runtime without extra signal. Reference: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:136`.
   - Hardcoded `"bun"` in `run([...])` instead of helper `BUN` weakens portability. Reference: `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:137`.
   - Unused `sleep()` in helpers. Reference: `/Users/williamcory/codeplane/e2e/tui/helpers.ts:65`.
6. Low - Workspace hygiene issue: unrelated lockfile/node_modules/spec snapshot churn is present and should be excluded from this ticket changeset.
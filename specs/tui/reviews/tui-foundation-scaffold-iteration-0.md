Tests run:
1. `bun test /Users/williamcory/codeplane/e2e/tui/app-shell.test.ts` -> 32 pass, 0 fail.
2. `pnpm --filter @codeplane/tui check` -> pass.
3. `bun test e2e/tui/app-shell.test.ts` (relative path) matched `/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts` and failed in non-TTY mode.

Findings (ordered by severity):
1. Critical: Data layer contract mismatch. `/Users/williamcory/codeplane/apps/tui/package.json:15` declares `@codeplane/sdk` instead of `@codeplane/ui-core`, and tests enforce that mismatch at `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:43` and `:214`. TUI PRD/design requires shared `@codeplane/ui-core` hooks for data access.
2. Critical: No runnable app scaffold yet. `/Users/williamcory/codeplane/apps/tui/src/index.tsx:14`-`:17` only exports types; no `createCliRenderer`/`createRoot` bootstrap, no provider tree, no initial screen render. `bun run dev` exits immediately.
3. Critical: Keyboard interaction model not implemented in scaffold runtime. Global bindings from design (`?`, `:`, `q`, `Esc`, `Ctrl+C`, `g`-prefixed navigation) are not wired anywhere in modified source.
4. High: `verify-imports.ts` does not actually assert signatures. `/Users/williamcory/codeplane/apps/tui/src/verify-imports.ts:10`-`:17` defines conditional types but never constrains them; `never` would still compile. This is a weak verification pattern.
5. High: Core barrels are empty placeholders. `/Users/williamcory/codeplane/apps/tui/src/components/index.ts:4`, `/theme/index.ts:4`, `/screens/index.ts:4`, `/util/index.ts:4` export nothing, so the scaffold exposes no minimal contracts/components.
6. Medium: Foundational tsconfig is lax. `/Users/williamcory/codeplane/apps/tui/tsconfig.json:9` (`allowJs: true`) plus `:17` and `:18` (`noUnusedLocals/Parameters: false`) reduce strictness in a new package.
7. Medium: Test discoverability is brittle due duplicate filename `app-shell.test.ts` under both `/e2e/tui` and `/specs/tui/e2e/tui`; relative execution can run the wrong suite.

Notes:
- I did not find direct API calls (`fetch`/HTTP client usage) in the modified `apps/tui/src` files.
- OpenTUI imports compile, but runtime OpenTUI component/hook usage is mostly not implemented yet in this ticket.
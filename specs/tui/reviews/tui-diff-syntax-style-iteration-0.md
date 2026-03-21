Findings (ordered by severity):
1. [BLOCKER] The e2e suite is non-functional: every test body is comment-only with zero assertions, zero terminal snapshots, and zero keyboard simulation. `bun test e2e/tui/diff.test.ts` reports green but validates nothing. This violates the TUI PRD test philosophy. File: /Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:4.
2. [BLOCKER] Test framework mismatch: file imports `describe`/`test` from `vitest` instead of implementing actual `@microsoft/tui-test` interactions/snapshot assertions required by the spec. File: /Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:1.
3. [HIGH] `useDiffSyntaxStyle` cleanup bug: on tier changes, cleanup destroys `styleRef.current` (latest instance) rather than the previous instance, so the old native style can leak and the new one can be destroyed prematurely. Create path: /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useDiffSyntaxStyle.ts:27. Cleanup path: /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useDiffSyntaxStyle.ts:42.
4. [HIGH] Native resource allocation happens inside `useMemo` (render path). In React strict-mode/replayed renders, this can allocate without a guaranteed commit lifecycle and is unsafe for native handles. File: /Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useDiffSyntaxStyle.ts:27.
5. [MEDIUM] No integration: `useDiffSyntaxStyle`/`resolveFiletype` are defined but not consumed anywhere in `apps/tui/src`, so diff rendering behavior is unchanged. `rg` only finds definitions.
6. [MEDIUM] `resolveFiletype` trusts any non-empty `apiLanguage` without validation/fallback; unknown values are returned directly instead of guaranteeing plain-text fallback semantics. File: /Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-syntax.ts:128.
7. [LOW] `SYNTAX_TOKEN_COUNT` is exported but unused (dead surface area). File: /Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-syntax.ts:99.

Requested checks:
- OpenTUI usage: `RGBA`/`SyntaxStyle` API usage compiles structurally, but lifecycle handling is incorrect (findings #3/#4), and there is no `<diff>` integration (#5).
- Keyboard interactions vs design spec: not verified in code; tests do not perform key events/assertions (#1).
- `@codeplane/ui-core` data access: no direct API calls introduced in the changed `apps/tui/src` files.

Tests run:
- `bun test e2e/tui/diff.test.ts` => 31 pass, 0 fail (false confidence because tests are empty).
- `bun run typecheck` => fails in this workspace context (includes missing `vitest` and `@opentui/core` type/module errors).
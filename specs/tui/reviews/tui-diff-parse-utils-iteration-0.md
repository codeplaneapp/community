Tests run:
- bun test e2e/tui/diff.test.ts -> 97 pass, 10 skip, 0 fail.
- bun run typecheck -> fails globally; includes new touched-file error TS7016 for `diff` import.

Findings (highest severity first):
1. Scope/header parsing is functionally incomplete in [/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:245](/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:245) and [/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:248](/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:248). `parseDiffHunks()` synthesizes `header` and hardcodes `scopeName = null`, and never calls `parseHunkScopeName()`. Real header scope text is dropped.
2. Collapsed range math is incorrect in [/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:191](/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:191). `endLine` uses `totalLineCount`, which counts add/remove/context visual rows, not a real old/new file line span. Mixed hunks can show impossible ranges.
3. Test quality is not acceptable in [/Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:13](/Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:13), [/Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:334](/Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:334), and [/Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:519](/Users/williamcory/codeplane/specs/tui/e2e/tui/diff.test.ts:519):
- Many tests are comment-only no-op bodies.
- `SPLIT-012` is a tautology (`expect(true).toBe(true)`).
- 10 integration/snapshot tests are skipped.
This does not validate keyboard behavior or render behavior despite test names claiming it does.
4. Dependency/type safety issue in [/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:1](/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:1): direct import from `diff` is not declared as a direct dependency in this package and has no type declarations (TS7016). Also `catch (error: any)` at line 222 weakens type safety.
5. Robustness nit in [/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:50](/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/diff-parse.ts:50): `buildSplitPairs()` can infinite-loop if passed a non-context/non-add/non-remove line type (e.g. `filler`) because `i` will not advance.

Checks requested by you:
- OpenTUI components/hooks usage: not applicable in touched source files (pure parsing utilities only).
- Keyboard interactions vs design spec: not actually verified by implementation; test cases are mostly placeholders/no-op.
- `@codeplane/ui-core` data access: no direct API calls in touched utility files.
Tests run:
1. `bun run test:e2e` (from `/Users/williamcory/codeplane/apps/tui`) fails globally: 518 failures caused by missing module `@microsoft/tui-test/lib/terminal/term.js` referenced by `/Users/williamcory/codeplane/e2e/tui/helpers.ts:289`.
2. Ticket-focused test run passes: `bun test ../../e2e/tui/app-shell.test.ts --timeout 30000` -> 73 pass, 0 fail.
3. Typecheck passes: `bun run check`.

Findings (ordered by severity):
1. High: `isUnicodeSupported()` incorrectly ties Unicode capability to `NO_COLOR` in `/Users/williamcory/codeplane/apps/tui/src/theme/detect.ts:67-70`. `NO_COLOR` is a color-preference signal, not a Unicode capability signal; this can unnecessarily disable Unicode box-drawing/progress glyphs and conflicts with the TUI design’s Unicode-first rendering expectations.
2. Medium: The “pure-function” claim is not met in strict terms. Both exported functions read global mutable state (`process.env`) directly (`/Users/williamcory/codeplane/apps/tui/src/theme/detect.ts:22`, `:61`). For deterministic behavior and easier unit testing, this should accept an injected env object.
3. Medium: New tests contain duplicate/redundant cases that add runtime cost without coverage gain:
- `DET-DETECT-012` and `DET-DETECT-015` are functionally identical (`/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:469-476` and `:496-503`).
- `DET-UNICODE-004` and `DET-UNICODE-005` are identical (`:554-561` and `:563-570`).
- `DET-UNICODE-001` and `DET-UNICODE-006` are identical (`:527-534` and `:572-579`).
4. Medium: Compatibility coverage is incomplete. The suite documents divergence only for `NO_COLOR`, but another existing divergence is untested: new detector returns `ansi256` for `TERM=xterm|linux|""` while old `detectColorTier()` returns `ansi16` (`/Users/williamcory/codeplane/apps/tui/src/lib/diff-syntax.ts:115-117`). This is a migration risk.
5. Nit: Appended block uses semicolon-heavy style inconsistent with the rest of `app-shell.test.ts` (existing file largely no-semicolon), reducing consistency.

Requested verification checks:
- OpenTUI components/hooks: no new component or hook usage introduced in this ticket; no misuse found in changed files.
- Keyboard interactions: no keyboard handling changes in this ticket.
- Data access boundaries: no direct API calls added in `apps/tui/src` for this ticket; no evidence of bypassing `@codeplane/ui-core` in changed code.